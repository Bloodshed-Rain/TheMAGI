import crypto from "crypto";
import fs from "fs";
import { pipeline } from "stream/promises";
import { loadConfig } from "../../config.js";
import { EVENT_SAMPLE_GUARDS, type CharacterBlurbResult } from "../../characterEventProfile.js";
import {
  getDb,
  insertCoachingAnalysis,
  getPlayerHistory,
  getGamesBySession,
  getGameById,
  getAggregateStats,
  getCharacterEventProfile,
  getOpponentDetail,
  getDeepInsightsData,
  insertGame,
  insertGameStats,
  insertFailedGameAnalysis,
  insertSignatureStats,
  insertHighlights,
  successfulReplayExists,
  deleteFailedGameByHash,
} from "../../db.js";
import {
  computeAdaptationSignals,
  findPlayerIdx,
  PlayerMatchError,
  assembleUserPrompt,
  SYSTEM_PROMPT,
  assembleAggregatePrompt,
  SYSTEM_PROMPT_AGGREGATE,
  SYSTEM_PROMPT_CHARACTER_BLURB,
  assembleDiscoveryPrompt,
  SYSTEM_PROMPT_DISCOVERY,
  SYSTEM_PROMPT_SCOUT,
  assembleOpponentDossierPrompt,
  stripNulls,
  type GameResult,
} from "../../pipeline/index.js";
import { callLLM, callLLMStream, getActiveModelId, isUsableLLMResponse, type LLMConfig } from "../../llm.js";
import { llmQueue } from "../../llmQueue.js";
import { parsePool } from "../../parsePool.js";
import { buildInsertGameParams, buildInsertGameStatsParams } from "../../replayAnalyzer.js";
import { type SafeHandleFn, validatePath } from "../ipc.js";
import { getMainWindow } from "../state.js";

/** Async streaming SHA-256 hash — avoids blocking main thread on large files */
async function hashFileAsync(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest("hex");
}

/** Build LLMConfig from user config. The provider abstraction handles env-var
 *  fallbacks. Returns modelId=null when no provider/model is selected — the
 *  LLM call will throw a clear error in that case. */
export function resolveLLMConfig(): LLMConfig {
  const config = loadConfig();
  return {
    modelId: getActiveModelId(config),
    activeProvider: config.activeProvider,
    apiKeys: config.apiKeys,
    localEndpoint: config.localEndpoint ?? null,
    azureEndpoint: config.azureEndpoint ?? null,
  };
}

/** Shared multi-game analysis logic used by both analyze:run and analyze:recent */
function runMultiGameAnalysis(
  gameResults: GameResult[],
  targetPlayer: string,
): { targetTag: string; userPrompt: string } {
  const firstGame = gameResults[0]!.gameSummary;
  const targetTag =
    targetPlayer || firstGame.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag || firstGame.players[0].tag;

  if (gameResults.length >= 2) {
    const p0Tag = firstGame.players[0].tag;
    const p1Tag = firstGame.players[1].tag;
    const p0Signals = computeAdaptationSignals(gameResults, p0Tag);
    const p1Signals = computeAdaptationSignals(gameResults, p1Tag);
    const lastResult = gameResults[gameResults.length - 1]!;
    const lastP0Idx = findPlayerIdx(lastResult.gameSummary, p0Tag);
    const lastP1Idx = findPlayerIdx(lastResult.gameSummary, p1Tag);
    lastResult.derivedInsights[lastP0Idx].adaptationSignals = p0Signals;
    lastResult.derivedInsights[lastP1Idx].adaptationSignals = p1Signals;
  }

  // Query player history for contextual coaching
  const playerHistory = getPlayerHistory(targetTag) ?? undefined;

  const userPrompt = assembleUserPrompt(gameResults, targetTag, playerHistory);
  return { targetTag, userPrompt };
}

export function registerAnalysisHandlers(safeHandle: SafeHandleFn): void {
  // Analyze — deduplicated. Returns cached analysis if already exists.
  // Streams LLM chunks to the renderer via "analyze:stream" IPC events when possible.
  safeHandle("analyze:run", async (_e, replayPaths: string[], targetPlayer: string, streamId?: string) => {
    const safePaths = replayPaths.map(validatePath);
    const llmConfig = resolveLLMConfig();
    const win = getMainWindow();

    // Check DB cache for single replays — skip LLM if already analyzed
    if (safePaths.length === 1) {
      const db = getDb();
      const fileHash = await hashFileAsync(safePaths[0]!);
      const existingGame = db.prepare("SELECT id FROM games WHERE replay_hash = ?").get(fileHash) as
        | { id: number }
        | undefined;
      if (existingGame) {
        const cachedAnalysis = db
          .prepare(
            "SELECT analysis_text FROM coaching_analyses WHERE game_id = ? AND scope = 'game' ORDER BY created_at DESC LIMIT 1",
          )
          .get(existingGame.id) as { analysis_text: string } | undefined;
        if (cachedAnalysis) {
          return cachedAnalysis.analysis_text;
        }
      }
      // Not cached — fall through to streaming path
    }

    // Multi-replay (set analysis) — parse off main thread via pool
    const gameResults = await parsePool.parseMany(safePaths);

    if (gameResults.length === 0) {
      throw new Error("No games to analyze.");
    }

    const { targetTag, userPrompt } = runMultiGameAnalysis(gameResults, targetPlayer);

    // Use streaming when a window is available to receive chunks
    const analysis = await llmQueue.enqueue(() =>
      callLLMStream({ systemPrompt: SYSTEM_PROMPT, userPrompt, config: llmConfig }, (chunk) => {
        try {
          win?.webContents.send("analyze:stream", chunk, streamId);
        } catch {
          // Window may have been closed during streaming — ignore
        }
      }),
    );

    // Signal streaming is done
    try {
      win?.webContents.send("analyze:stream-end", streamId);
    } catch {
      // ignore
    }

    // Persist game data for each replay so stats/trends/dedup work
    const db = getDb();
    const gameIds: number[] = [];
    for (let i = 0; i < gameResults.length; i++) {
      const gameResult = gameResults[i]!;
      const filePath = safePaths[i]!;
      const fileHash = await hashFileAsync(filePath);

      const existing = db.prepare("SELECT id FROM games WHERE replay_hash = ?").get(fileHash) as
        | { id: number }
        | undefined;

      if (existing) {
        gameIds.push(existing.id);
      } else {
        try {
          deleteFailedGameByHash(fileHash);
          const gameParams = buildInsertGameParams(gameResult, targetTag, filePath, fileHash, null);
          const gameId = insertGame(gameParams);
          insertGameStats(buildInsertGameStatsParams(gameId, gameResult, targetTag));
          const playerIdx = findPlayerIdx(gameResult.gameSummary, targetTag);
          const player = gameResult.gameSummary.players[playerIdx];
          if (player.signatureStats) {
            insertSignatureStats(gameId, JSON.stringify(player.signatureStats));
          }
          const playerHighlights = gameResult.highlights[playerIdx];
          if (playerHighlights && playerHighlights.length > 0) {
            insertHighlights(gameId, playerHighlights);
          }
          gameIds.push(gameId);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          const status = err instanceof PlayerMatchError ? "unavailable" : "failed";
          if (!successfulReplayExists(fileHash)) {
            deleteFailedGameByHash(fileHash);
            const failedId = insertFailedGameAnalysis({
              replayPath: filePath,
              replayHash: fileHash,
              playedAt: gameResult.startAt,
              analysisStatus: status,
              analysisError: reason,
              playerTag: targetTag,
            });
            gameIds.push(failedId);
          }
          // Do not invent success-shaped stats; coaching text may still be returned.
          console.warn(`[analyze:run] persist fail-closed (${status}):`, reason);
        }
      }
    }

    insertCoachingAnalysis(gameIds[0] ?? null, null, llmConfig.modelId || "pollinations", analysis);

    return analysis;
  });

  // Unified scoped analysis handler
  safeHandle("analyze:scoped", async (_e, scope: string, id: any, targetPlayer?: string, streamId?: string) => {
    const llmConfig = resolveLLMConfig();
    const win = getMainWindow();
    const db = getDb();

    // Check cache for ALL scopes (ignore model_used to reuse any past analysis)
    let cachedCandidates: { analysis_text: string }[];
    if (scope === "game") {
      cachedCandidates = db
        .prepare(
          "SELECT analysis_text FROM coaching_analyses WHERE game_id = ? AND scope = 'game' ORDER BY created_at DESC LIMIT 10",
        )
        .all(Number(id)) as { analysis_text: string }[];
    } else if (scope === "session") {
      cachedCandidates = db
        .prepare("SELECT analysis_text FROM coaching_analyses WHERE session_id = ? ORDER BY created_at DESC LIMIT 10")
        .all(Number(id)) as { analysis_text: string }[];
    } else {
      cachedCandidates = db
        .prepare(
          "SELECT analysis_text FROM coaching_analyses WHERE scope = ? AND scope_identifier = ? ORDER BY created_at DESC LIMIT 10",
        )
        .all(scope, String(id)) as { analysis_text: string }[];
    }
    const cached = cachedCandidates.find((entry) => isUsableLLMResponse(entry.analysis_text));
    if (cached) return cached.analysis_text;

    let systemPrompt = SYSTEM_PROMPT;
    let userPrompt = "";
    let gameIdForCache: number | null = null;
    let sessionIdForCache: number | null = null;

    if (scope === "game") {
      const game = getGameById(Number(id));
      if (!game) throw new Error("Game not found");
      const result = await parsePool.parse(game.replay_path, 1);
      const playerHistory = getPlayerHistory(targetPlayer || game.player_tag) ?? undefined;
      userPrompt = assembleUserPrompt([result], targetPlayer || game.player_tag, playerHistory);
      gameIdForCache = game.id;
    } else if (scope === "session") {
      const sessionId = Number(id);
      const games = getGamesBySession(sessionId);
      if (games.length === 0) throw new Error("No games found for session");
      const gameResults = await parsePool.parseMany(games.map((g) => g.replay_path));
      const { userPrompt: prompt } = runMultiGameAnalysis(gameResults, targetPlayer || "");
      userPrompt = prompt;
      sessionIdForCache = sessionId;
    } else if (["character", "stage", "opponent", "career"].includes(scope)) {
      const filters: any = {};
      if (scope === "character") filters.character = String(id);
      if (scope === "stage") filters.stage = String(id);
      if (scope === "opponent") filters.opponentKey = String(id);
      // 'career' scope uses empty filters to aggregate everything

      const stats = getAggregateStats(filters);
      if (!stats) throw new Error("No data found for this scope");

      const playerHistory = getPlayerHistory(targetPlayer || "") ?? undefined;
      systemPrompt = SYSTEM_PROMPT_AGGREGATE;
      userPrompt = assembleAggregatePrompt(
        stats,
        scope as any,
        scope === "career" ? "Lifetime" : String(id),
        playerHistory,
      );
    } else {
      throw new Error(`Invalid analysis scope: ${scope}`);
    }

    const analysis = await llmQueue.enqueue(() => {
      // A character report is short enough to validate before showing it. Some
      // automatic/free routers occasionally return only "User Safety: safe".
      if (scope === "character") {
        return callLLM({ systemPrompt, userPrompt, config: llmConfig });
      }

      return callLLMStream({ systemPrompt, userPrompt, config: llmConfig }, (chunk) => {
        try {
          win?.webContents.send("analyze:stream", chunk, streamId);
        } catch {
          // ignore
        }
      });
    });

    if (!isUsableLLMResponse(analysis)) {
      throw new Error("The AI provider returned a status message instead of an analysis. Please try again.");
    }

    try {
      win?.webContents.send("analyze:stream-end", streamId);
    } catch {
      // ignore
    }

    insertCoachingAnalysis(
      gameIdForCache,
      sessionIdForCache,
      llmConfig.modelId || "pollinations",
      analysis,
      scope,
      String(id),
    );
    return analysis;
  });

  // Opponent scouting dossier — scout-framed, streamed over the shared analyze:stream
  // channel, cached under scope='dossier'. Phase B will pass real tendencies (4th arg).
  safeHandle("analyze:dossier", async (_e, opponentKey: string, targetPlayer?: string, streamId?: string) => {
    const llmConfig = resolveLLMConfig();
    const win = getMainWindow();
    const db = getDb();

    const cached = db
      .prepare(
        "SELECT analysis_text FROM coaching_analyses WHERE scope = 'dossier' AND scope_identifier = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(String(opponentKey)) as { analysis_text: string } | undefined;
    if (cached) {
      try {
        win?.webContents.send("analyze:stream", cached.analysis_text, streamId);
        win?.webContents.send("analyze:stream-end", streamId);
      } catch {
        // window may have closed
      }
      return cached.analysis_text;
    }

    const detail = getOpponentDetail(String(opponentKey));
    if (!detail || detail.totalGames === 0) throw new Error("No games found against this opponent.");

    const headToHead = {
      opponentTag: detail.opponentTag,
      wins: detail.wins,
      losses: detail.losses,
      totalGames: detail.totalGames,
      winRate: detail.winRate,
      characterBreakdown: detail.characterBreakdown,
      stageBreakdown: detail.stageBreakdown,
    };
    const yourStatsVsThem = getAggregateStats({ opponentKey: String(opponentKey) });
    const playerHistory = targetPlayer ? (getPlayerHistory(targetPlayer) ?? null) : null;

    const userPrompt = assembleOpponentDossierPrompt(headToHead, yourStatsVsThem, playerHistory, null);

    const analysis = await llmQueue.enqueue(() =>
      callLLMStream({ systemPrompt: SYSTEM_PROMPT_SCOUT, userPrompt, config: llmConfig }, (chunk) => {
        try {
          win?.webContents.send("analyze:stream", chunk, streamId);
        } catch {
          // ignore
        }
      }),
    );

    try {
      win?.webContents.send("analyze:stream-end", streamId);
    } catch {
      // ignore
    }

    insertCoachingAnalysis(
      null,
      null,
      llmConfig.modelId || "pollinations",
      analysis,
      "dossier",
      String(opponentKey),
      `${detail.opponentTag} Dossier`,
    );
    return analysis;
  });

  // Character identity blurb — short scouting-report summary of how the player
  // pilots one character, grounded in the v10-v14 per-instance event profile.
  // Non-streaming; cached under scope='character-blurb' until force-refreshed.
  safeHandle(
    "analyze:characterBlurb",
    async (_e, character: string, force?: boolean): Promise<CharacterBlurbResult> => {
      const stats = getAggregateStats({ character });
      const gamesPlayed = stats?.gamesPlayed ?? 0;
      if (!stats || gamesPlayed < EVENT_SAMPLE_GUARDS.blurbGamesMin) {
        return { insufficient: true, gamesPlayed };
      }

      const db = getDb();
      if (!force) {
        const cached = db
          .prepare(
            "SELECT analysis_text, model_used, created_at FROM coaching_analyses WHERE scope = 'character-blurb' AND scope_identifier = ? ORDER BY created_at DESC LIMIT 1",
          )
          .get(character) as { analysis_text: string; model_used: string; created_at: string } | undefined;
        if (cached) {
          return {
            text: cached.analysis_text,
            modelUsed: cached.model_used,
            createdAt: cached.created_at,
            cached: true,
          };
        }
      }

      const llmConfig = resolveLLMConfig();
      const events = getCharacterEventProfile(character);
      const playerHistory = getPlayerHistory("") ?? undefined;
      const userPrompt =
        assembleAggregatePrompt(stats, "character", character, playerHistory) +
        "\n\nPER-INSTANCE EVENT PROFILE (measured, with sample sizes):\n" +
        JSON.stringify(stripNulls(events));

      const text = await llmQueue.enqueue(() =>
        callLLM({ systemPrompt: SYSTEM_PROMPT_CHARACTER_BLURB, userPrompt, config: llmConfig }),
      );

      const modelUsed = llmConfig.modelId || "pollinations";
      insertCoachingAnalysis(null, null, modelUsed, text, "character-blurb", character);
      return { text, modelUsed, createdAt: new Date().toISOString(), cached: false };
    },
  );

  // Deep Pattern Discovery — MAGI finds hidden correlations across your whole career
  safeHandle("analyze:discovery", async (_e, streamId?: string) => {
    const llmConfig = resolveLLMConfig();
    const win = getMainWindow();
    const dbData = getDeepInsightsData();
    const playerHistory = getPlayerHistory("") ?? undefined;

    const systemPrompt = SYSTEM_PROMPT_DISCOVERY;
    const userPrompt = assembleDiscoveryPrompt(dbData, playerHistory);

    const analysis = await llmQueue.enqueue(() =>
      callLLMStream({ systemPrompt, userPrompt, config: llmConfig }, (chunk) => {
        try {
          win?.webContents.send("analyze:stream", chunk, streamId);
        } catch {
          // ignore
        }
      }),
    );

    try {
      win?.webContents.send("analyze:stream-end", streamId);
    } catch {
      // ignore
    }

    return analysis;
  });

  // Analyze recent games from the DB (by replay paths)
  safeHandle("analyze:recent", async (_e, count: number, targetPlayer: string, streamId?: string) => {
    const games = getDb()
      .prepare(
        `
      SELECT id, replay_path FROM games
      WHERE played_at IS NOT NULL
      ORDER BY played_at DESC
      LIMIT ?
    `,
      )
      .all(count) as { id: number; replay_path: string }[];

    if (games.length === 0) {
      throw new Error("No games in database to analyze.");
    }

    // Reverse to chronological order
    games.reverse();
    const paths = games.map((g) => g.replay_path);

    const llmConfig = resolveLLMConfig();

    const gameResults = await parsePool.parseMany(paths);

    const { userPrompt } = runMultiGameAnalysis(gameResults, targetPlayer);
    const win = getMainWindow();
    const analysis = await llmQueue.enqueue(() =>
      callLLMStream({ systemPrompt: SYSTEM_PROMPT, userPrompt, config: llmConfig }, (chunk) => {
        try {
          win?.webContents.send("analyze:stream", chunk, streamId);
        } catch {
          // ignore
        }
      }),
    );
    try {
      win?.webContents.send("analyze:stream-end", streamId);
    } catch {
      // ignore
    }
    insertCoachingAnalysis(games[0]?.id ?? null, null, llmConfig.modelId || "pollinations", analysis);

    return analysis;
  });

  // Trend commentary — MAGI reacts to your trend data
  safeHandle("analyze:trends", async (_e, trendSummary: string) => {
    const llmConfig = resolveLLMConfig();

    const trendPrompt = `You are MAGI (Melee Analysis through Generative Intelligence), a Melee coaching assistant with personality. You're reviewing a player's stat trends over their recent games.

Your voice: You're like a sharp, witty practice partner who genuinely wants to see them improve. Think of the energy of a commentator who actually knows the game — mix real analysis with personality. You can be funny, you can be blunt, you can hype them up when something's genuinely impressive. Use Melee terminology naturally.

Keep it concise — 3-5 short paragraphs max. Don't just recite the numbers back. Tell them what the numbers MEAN, what's exciting, what's concerning, and what to focus on next. If something is genuinely bad, don't sugarcoat it — but make it motivating, not demoralizing.

Open with a quick vibe check on their overall trajectory, then hit the highlights and lowlights.`;

    const analysis = await llmQueue.enqueue(() =>
      callLLM({ systemPrompt: trendPrompt, userPrompt: trendSummary, config: llmConfig }),
    );
    return analysis;
  });
}
