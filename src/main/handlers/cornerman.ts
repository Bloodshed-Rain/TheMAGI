import { Notification } from "electron";
import { loadConfig } from "../../config.js";
import { getDb, insertCoachingAnalysis } from "../../db.js";
import { advanceLiveSet, type LiveSetState } from "../../cornerman.js";
import { startCornermanLiveMonitor, type CornermanLiveMonitor } from "../../cornermanLiveMonitor.js";
import { resolveCornermanPopupSettings } from "../../cornermanPopupSettings.js";
import {
  resolveCornermanLiveStatsSettings,
  type CornermanLiveStatsSettings,
} from "../../cornermanLiveStatsSettings.js";
import type { CornermanLiveBaseline, CornermanLiveSnapshot } from "../../cornermanLiveStats.js";
import { importReplay } from "../../importer.js";
import { SYSTEM_PROMPT_CORNERMAN, assembleCornermanPrompt } from "../../pipeline/index.js";
import { callLLMStream } from "../../llm.js";
import { llmQueue } from "../../llmQueue.js";
import { type SafeHandleFn, validatePath } from "../ipc.js";
import { getMainWindow, setImportListener, type WatcherImportEvent } from "../state.js";
import { resolveLLMConfig } from "./analysis.js";
import { notifyGameHighlights, startReplayWatcher } from "./watcher.js";

/** Cap on games rendered into the prompt — long friendlies runs vs the same
 *  opponent are one "set"; the card should focus on recent games anyway. */
const MAX_PROMPT_GAMES = 6;

interface CornermanSession {
  targetTag: string;
  setState: LiveSetState | null;
  /** Player's historical averages, computed once at session start; stamped onto
   *  every live-stats snapshot so consumers get self-contained deltas. */
  baseline: CornermanLiveBaseline | null;
  /** Live-stats prefs resolved once at start — never re-read from disk in the tick. */
  liveStats: CornermanLiveStatsSettings;
}

let session: CornermanSession | null = null;
let liveMonitor: CornermanLiveMonitor | null = null;
/** Most recent live-stats snapshot, so a page opened mid-game paints instantly
 *  instead of waiting for the next emit. Nulled only on cornerman:stop. */
let lastSnapshot: CornermanLiveSnapshot | null = null;

export interface CornermanStatus {
  active: boolean;
  opponentTag: string | null;
  opponentKey: string | null;
  wins: number;
  losses: number;
  gamesCount: number;
}

function currentStatus(): CornermanStatus {
  return {
    active: session !== null,
    opponentTag: session?.setState?.opponentTag ?? null,
    opponentKey: session?.setState?.opponentKey ?? null,
    wins: session?.setState?.wins ?? 0,
    losses: session?.setState?.losses ?? 0,
    gamesCount: session?.setState?.games.length ?? 0,
  };
}

function broadcast(channel: string, ...args: unknown[]): void {
  try {
    getMainWindow()?.webContents.send(channel, ...args);
  } catch {
    // window may have closed
  }
}

function stopLiveMonitor(): void {
  liveMonitor?.close();
  liveMonitor = null;
}
export function shutdownCornerman(): void {
  session = null;
  lastSnapshot = null;
  stopLiveMonitor();
  setImportListener(null);
}

/** Player's recent per-game averages, for live-stats baseline deltas. Averages
 *  the last 20 games in JS (SQLite applies LIMIT after aggregation, so a naive
 *  SELECT AVG(...) LIMIT 20 would average all-time). openings_per_kill and
 *  avg_damage_per_opening store 0 on 0-kill/0-opening games (post-game masks
 *  undefined ratios to 0) — an impossible-best value for a lower-is-better stat
 *  — so those zeros are excluded; genuine-zero rates (l-cancel, neutral) are kept.
 *  Returns null until there are enough samples so deltas simply don't render for
 *  new users. */
function getLiveBaseline(targetTag: string): CornermanLiveBaseline | null {
  try {
    // Scope to the session's target player — game_stats rows are per-game TARGET
    // stats, and imports without an explicit target can store the opponent as the
    // target, so a global last-20 would mix in other players' history. Matches
    // getPlayerHistory's tag/connect-code predicate (db.ts).
    const rows = getDb()
      .prepare(
        `SELECT gs.l_cancel_rate AS lCancelRate,
                gs.openings_per_kill AS openingsPerKill,
                gs.avg_damage_per_opening AS avgDamagePerOpening,
                gs.neutral_win_rate AS neutralWinRate
         FROM game_stats gs
         JOIN games g ON g.id = gs.game_id
         WHERE g.player_tag = ? OR g.player_connect_code = ?
         ORDER BY g.played_at DESC
         LIMIT 20`,
      )
      .all(targetTag, targetTag) as Array<{
      lCancelRate: number;
      openingsPerKill: number;
      avgDamagePerOpening: number;
      neutralWinRate: number;
    }>;
    if (rows.length < 5) return null;

    const avg = (pick: (r: (typeof rows)[number]) => number, excludeZero: boolean): number | null => {
      const values = rows
        .map(pick)
        .filter((v) => typeof v === "number" && Number.isFinite(v) && (!excludeZero || v > 0));
      if (values.length < 5) return null;
      return values.reduce((sum, v) => sum + v, 0) / values.length;
    };

    return {
      gamesSampled: rows.length,
      lCancelRate: avg((r) => r.lCancelRate, false),
      openingsPerKill: avg((r) => r.openingsPerKill, true),
      avgDamagePerOpening: avg((r) => r.avgDamagePerOpening, true),
      neutralWinRate: avg((r) => r.neutralWinRate, false),
    };
  } catch (err) {
    console.warn("[cornerman] baseline query failed:", err);
    return null;
  }
}

/** Latest cached dossier text for an opponent, if the user ever generated one */
function getCachedDossier(opponentKey: string): string | null {
  const row = getDb()
    .prepare(
      "SELECT analysis_text FROM coaching_analyses WHERE scope = 'dossier' AND scope_identifier = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(opponentKey) as { analysis_text: string } | undefined;
  return row?.analysis_text ?? null;
}

async function handleCornermanImport(event: WatcherImportEvent): Promise<void> {
  if (!session || event.skipped || !event.gameResult) return;

  // Capture the session reference now so we can detect stop/restart after the
  // async LLM call resolves (Issue 2: stale broadcast guard).
  const mySession = session;

  const outcome = advanceLiveSet(session.setState, event.gameResult, session.targetTag, Date.now());
  if (!outcome) return; // handwarmer / false start
  session.setState = outcome.state;

  broadcast("cornerman:set-update", currentStatus());

  const { games, wins, losses, opponentKey, opponentTag } = outcome.state;
  const totalGames = games.length; // full count before slicing for prompt cap
  const userPrompt = assembleCornermanPrompt(
    games.slice(-MAX_PROMPT_GAMES).map((g) => g.gameResult),
    session.targetTag,
    { wins, losses },
    getCachedDossier(opponentKey),
    totalGames,
  );
  const llmConfig = resolveLLMConfig();
  const popupSettings = resolveCornermanPopupSettings(loadConfig());

  let card: string;
  try {
    card = await llmQueue.enqueue(() =>
      callLLMStream({ systemPrompt: SYSTEM_PROMPT_CORNERMAN, userPrompt, config: llmConfig }, (chunk) => {
        if (session !== mySession) return; // stale session — drop chunks from the old session
        broadcast("cornerman:stream", chunk);
      }),
    );
  } catch (err) {
    if (session === mySession) {
      broadcast("cornerman:error", err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // If the user stopped or restarted cornerman while the LLM was in flight,
  // skip the card broadcast and notification — they belong to a dead session.
  // The DB insert still runs because we already paid for the tokens.
  if (session === mySession) {
    broadcast("cornerman:card", {
      text: card,
      gameNumber: totalGames,
      opponentTag,
      wins,
      losses,
    });
  }

  try {
    insertCoachingAnalysis(
      event.gameId ?? null,
      null,
      llmConfig.modelId || "pollinations",
      card,
      "cornerman",
      opponentKey,
      `Cornerman G${totalGames} vs ${opponentTag}`,
    );
  } catch (err) {
    console.error("[cornerman] failed to persist card:", err);
  }

  if (session === mySession && popupSettings.desktopNotifications) {
    try {
      new Notification({
        title: `MAGI Cornerman — ${wins}-${losses} vs ${opponentTag}`,
        body: "Your between-games adjustment is ready.",
      }).show();
    } catch {
      // notifications are best-effort
    }
  }
}

/** Import a replay the live monitor saw finish and run the card flow on it.
 *  Covers the game already in progress when the session starts: its .slp file
 *  predates the folder watcher, whose ignoreInitial suppresses the "add" event,
 *  so without this the first game would never produce a card. SHA-256 dedup in
 *  importReplay makes this a cheap no-op when the watcher also imported it. */
async function importCompletedLiveGame(
  filePath: string,
  targetPlayer: string,
  mySession: CornermanSession,
): Promise<void> {
  if (session !== mySession) return;
  const result = await importReplay(filePath, targetPlayer);
  if (session !== mySession) return;

  if (!result.skipped) {
    try {
      getMainWindow()?.webContents.send("watcher:imported", {
        filePath,
        skipped: result.skipped,
        gameId: result.gameId,
      });
    } catch {
      // window may have closed
    }
    if (result.gameId) {
      notifyGameHighlights(result.gameId);
    }
  }

  await handleCornermanImport({
    filePath,
    skipped: result.skipped,
    gameId: result.gameId,
    gameResult: result.gameResult,
  });
}

export function registerCornermanHandlers(safeHandle: SafeHandleFn): void {
  safeHandle("cornerman:start", (_e, replayFolder: string, targetPlayer: string) => {
    const safeFolder = validatePath(replayFolder);
    // Resolve baseline + live-stats prefs once, up front — never in the 500ms tick.
    const startConfig = loadConfig();
    if (startConfig.cornermanEnabled === false)
      throw new Error("Enable Cornerman in Settings → Play Mode settings to start a live session.");
    const mySession: CornermanSession = {
      targetTag: targetPlayer,
      setState: null,
      baseline: getLiveBaseline(targetPlayer),
      liveStats: resolveCornermanLiveStatsSettings(startConfig),
    };
    session = mySession;
    lastSnapshot = null;
    startReplayWatcher(safeFolder, targetPlayer);
    stopLiveMonitor();
    liveMonitor = startCornermanLiveMonitor({
      replayFolder: safeFolder,
      targetPlayer,
      onEvents: (events) => {
        if (session !== mySession) return;
        for (const liveEvent of events) {
          broadcast("cornerman:live-event", liveEvent);
        }
      },
      onSnapshot: (snapshot) => {
        // Running stats update the main renderer without creating windows.
        if (session !== mySession) return; // stale session after stop/restart
        if (!mySession.liveStats.enabled) return;
        const stamped: CornermanLiveSnapshot = { ...snapshot, baseline: mySession.baseline };
        lastSnapshot = stamped;
        broadcast("cornerman:live-stats", stamped);
      },
      onGameComplete: (filePath) => {
        void importCompletedLiveGame(filePath, targetPlayer, mySession).catch((err) => {
          console.error("[cornerman] live-game import failed:", err);
        });
      },
      onError: (err, filePath) => {
        console.warn(`[cornerman] live monitor skipped ${filePath}: ${err.message}`);
      },
    });
    setImportListener((event) => {
      if (session !== mySession) return;
      // Fire-and-forget; failures are logged so they're not silently invisible
      void handleCornermanImport(event).catch((err) => {
        console.error("[cornerman] card generation failed:", err);
      });
    });
    broadcast("cornerman:set-update", currentStatus());
    return currentStatus();
  });

  safeHandle("cornerman:stop", () => {
    shutdownCornerman();
    // The folder watcher stays up — it's the app-wide live import; stop it via watcher:stop.
    broadcast("cornerman:set-update", currentStatus());
    return currentStatus();
  });

  safeHandle("cornerman:status", () => currentStatus());

  // Seed for a late-mounting page: returns the last snapshot (FINAL
  // between games) so it paints instantly rather than waiting for the next emit.
  safeHandle("cornerman:live-stats-latest", () => lastSnapshot);
}
