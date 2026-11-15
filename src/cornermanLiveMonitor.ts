import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs";
import path from "path";
import { Frames, SlippiGame, type GameStartType, type StatsType } from "@slippi/slippi-js/node";

import { getCharacterName, getPlayerTag } from "./pipeline/helpers";
import {
  detectLiveConversionEvents,
  detectLiveFrameEvents,
  detectLiveItemEvents,
  markObservedItemInstances,
  type CornermanLiveEvent,
  type CornermanLivePlayer,
} from "./cornermanLiveEvents";
import { buildLiveStatsSnapshot, type CornermanLiveSnapshot } from "./cornermanLiveStats";

const POLL_INTERVAL_MS = 500;
/** Max cadence at which running-stat snapshots are pushed per owner tracker.
 *  Polls stay at 500ms; stats only need to be glanceable, not real-time. */
const LIVE_STATS_EMIT_MS = 2000;
const INITIAL_FILE_WINDOW_MS = 10 * 60 * 1000;
/** Polls where the file grew but no new frames parsed before we assume the
 *  incremental parser is wedged and rebuild it (see poll()). */
const STALLED_PARSER_POLLS = 4;

interface CornermanLiveMonitorOptions {
  replayFolder: string;
  targetPlayer: string;
  onEvents: (events: CornermanLiveEvent[]) => void;
  /** Fires with a running-stats snapshot for the game currently being played,
   *  throttled to one per LIVE_STATS_EMIT_MS per owner tracker (plus an immediate
   *  first paint and an immediate final emit at game end). Only one tracker owns
   *  the stream at a time, so this never interleaves two games. */
  onSnapshot?: (snapshot: CornermanLiveSnapshot) => void;
  /** Fires when the game that was already in progress at monitor start ends —
   *  the one file the folder watcher's ignoreInitial suppresses, so nothing
   *  else imports it. Files created during the session are the watcher's job
   *  (importing them here too would race it), and files already complete when
   *  tracking began are never reported. */
  onGameComplete?: (filePath: string) => void;
  onError?: (error: Error, filePath: string) => void;
}

export interface CornermanLiveMonitor {
  close: () => void;
}

function normalizeCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  const hashIdx = trimmed.indexOf("#");
  if (hashIdx < 0) return trimmed;
  const prefix = trimmed.slice(0, hashIdx);
  const num = trimmed.slice(hashIdx + 1).replace(/^0+/, "") || "0";
  return `${prefix}#${num}`;
}

function isEmptyTag(tag: string): boolean {
  const t = tag.trim().toLowerCase();
  return t === "" || t === "unknown" || t === "player" || t === "no tag";
}

function matchScore(player: { tag: string; connectCode: string }, id: string): number {
  const idLower = id.toLowerCase();
  const tagLower = player.tag.toLowerCase();
  const codeLower = player.connectCode.toLowerCase();
  const tagEmpty = isEmptyTag(player.tag);
  const isConnectCode = id.includes("#");

  if (isConnectCode) {
    const idNorm = normalizeCode(id);
    if (player.connectCode && normalizeCode(player.connectCode) === idNorm) return 100;

    const codePrefix = idLower.split("#")[0]!;
    if (codePrefix && !tagEmpty && tagLower === codePrefix) return 80;
    if (codePrefix && codePrefix.length >= 3 && !tagEmpty && tagLower.includes(codePrefix)) return 40;
  }

  if (!tagEmpty && player.tag === id) return 100;
  if (!tagEmpty && tagLower === idLower) return 95;
  if (!isConnectCode && player.connectCode && codeLower === idLower) return 90;
  if (idLower.length >= 3 && !tagEmpty && tagLower.includes(idLower)) return 50;
  if (!tagEmpty && player.tag.length >= 3 && idLower.includes(tagLower)) return 45;
  if (!isConnectCode && idLower.length >= 3 && player.connectCode && codeLower.startsWith(idLower)) return 30;

  return 0;
}

function resolveTargetIndex(players: CornermanLivePlayer[], targetPlayer: string): number {
  const scores = players.map((player) => ({ player, score: matchScore(player, targetPlayer.trim()) }));
  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.score ? scores[0].player.playerIndex : (players[0]?.playerIndex ?? 0);
}

/**
 * The player `targetPlayer` identifies in this game, or null when nobody
 * matches. Live stats fall back to the first player (resolveTargetIndex); a
 * caller that must never present another player's data as the user's own uses
 * this instead. Same scoring, and the same winner whenever there is a match.
 */
export function matchTargetPlayerIndex(settings: GameStartType, targetPlayer: string): number | null {
  const id = targetPlayer.trim();
  if (!id) return null;
  let best: { playerIndex: number; score: number } | null = null;
  for (const player of settings.players) {
    if (player.type === 3) continue;
    const score = matchScore({ tag: getPlayerTag(player), connectCode: player.connectCode || "" }, id);
    if (score > 0 && (!best || score > best.score)) best = { playerIndex: player.playerIndex, score };
  }
  return best?.playerIndex ?? null;
}

function buildPlayers(settings: GameStartType, targetPlayer: string): CornermanLivePlayer[] {
  const activePlayers = settings.players.filter((p) => p.type !== 3);
  const players = activePlayers.map((player) => ({
    playerIndex: player.playerIndex,
    tag: getPlayerTag(player),
    connectCode: player.connectCode || "",
    character: getCharacterName(player.characterId),
    isTarget: false,
  }));
  const targetIndex = resolveTargetIndex(players, targetPlayer);
  return players.map((player) => ({ ...player, isTarget: player.playerIndex === targetIndex }));
}

function findRecentSlpFiles(replayFolder: string): string[] {
  const now = Date.now();
  const files: { filePath: string; mtimeMs: number }[] = [];

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".slp")) continue;

      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs <= INITIAL_FILE_WINDOW_MS) {
          files.push({ filePath: full, mtimeMs: stat.mtimeMs });
        }
      } catch {
        // The live file can disappear between readdir and stat; skip it.
      }
    }
  };

  walk(replayFolder);
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).map((f) => f.filePath);
}

class LiveReplayTracker {
  private game: SlippiGame;
  private players: CornermanLivePlayer[] | null = null;
  private seenConversionKeys = new Set<string>();
  private seenFrameKeys = new Set<string>();
  private seenItemKeys = new Set<string>();
  private lastItemFrame = Frames.FIRST_PLAYABLE - 1;
  private lastFrameEventFrame = Frames.FIRST_PLAYABLE - 1;
  private baselineFrame: number | null = null;
  private ended = false;
  private completedPolls = 0;
  private firstPollLatestFrame: number | null = null;
  private lastLatestFrame = Frames.FIRST_PLAYABLE - 1;
  /** File size the current SlippiGame instance is known to have parsed
   *  through (updated whenever frames advance, and on rebuild). */
  private consumedSize = -1;
  private stalledPolls = 0;

  constructor(
    private filePath: string,
    private targetPlayer: string,
    readonly suppressExistingEvents: boolean,
  ) {
    this.game = new SlippiGame(filePath, { processOnTheFly: true });
  }

  isDone(): boolean {
    return this.ended && this.completedPolls >= 2;
  }

  /** True when the game's end was observed while tracking — i.e. frames were
   *  still being written after we started, as opposed to a file that was
   *  already complete when the tracker attached. */
  wasCompletedLive(): boolean {
    return this.ended && this.firstPollLatestFrame !== null && this.lastLatestFrame > this.firstPollLatestFrame;
  }

  /** slippi-js's incremental reader wedges permanently when a growing file
   *  already declares its final rawDataLength (e.g. a finished replay being
   *  copied into the folder): reads past EOF advance the internal position to
   *  the declared end, and appended bytes are never parsed. Detect "bytes on
   *  disk beyond what this parser instance consumed, and no new frames" and
   *  rebuild the parser; the seen-key dedup state lives on this tracker, so a
   *  rebuild never re-emits past events. Comparing against consumedSize (not
   *  poll-over-poll growth) matters: a parser wedged when the copy FINISHES
   *  would otherwise never rebuild because the file has stopped growing. */
  private noteProgress(fileSize: number, latestFrame: number): void {
    if (this.firstPollLatestFrame === null) this.firstPollLatestFrame = latestFrame;
    const advanced = latestFrame > this.lastLatestFrame;
    this.lastLatestFrame = Math.max(this.lastLatestFrame, latestFrame);
    if (advanced && fileSize >= 0) this.consumedSize = fileSize;

    if (this.ended || fileSize < 0 || advanced || fileSize <= this.consumedSize) {
      this.stalledPolls = 0;
      return;
    }
    this.stalledPolls++;
    if (this.stalledPolls >= STALLED_PARSER_POLLS) {
      this.game = new SlippiGame(this.filePath, { processOnTheFly: true });
      // The fresh instance consumes everything currently on disk on the next
      // poll; requiring further growth (or frame progress) before another
      // rebuild prevents a rebuild loop on a file that will never parse
      // further, e.g. a truncated copy.
      this.consumedSize = fileSize;
      this.stalledPolls = 0;
    }
  }

  private statFileSize(): number {
    try {
      return fs.statSync(this.filePath).size;
    } catch {
      return -1;
    }
  }

  /** Build a running-stats snapshot from the current parse. Null unless we have
   *  stats and a resolved 1v1 roster — doubles yields an empty actionCounts
   *  array (getSinglesPlayerPermutations returns none), so a stats strip there
   *  would be all dashes; suppress it entirely. */
  private buildSnapshot(stats: StatsType | null | undefined, latestFrame: number): CornermanLiveSnapshot | null {
    if (!stats || !this.players || this.players.length !== 2) return null;
    return buildLiveStatsSnapshot(stats, this.players, latestFrame, this.filePath, this.ended);
  }

  poll(): PollResult {
    const fileSize = this.statFileSize();
    const settings = this.game.getSettings();
    if (!settings) {
      // Even the header can wedge on a declared-length file; track progress so
      // the stalled-parser rebuild above can kick in.
      this.noteProgress(fileSize, Frames.FIRST_PLAYABLE - 1);
      return { events: [], snapshot: null };
    }

    if (!this.players) {
      this.players = buildPlayers(settings, this.targetPlayer);
    }

    const stats = this.game.getStats();
    const frames = this.game.getFrames();
    const latestFrame = stats?.lastFrame ?? this.game.getLatestFrame()?.frame ?? Frames.FIRST_PLAYABLE - 1;
    this.noteProgress(fileSize, latestFrame);

    // Checked before detection so conversions left open by the game ending
    // (LRAS, timeout) can still alert on this same poll.
    if (this.game.getGameEnd()) {
      this.ended = true;
    }

    if (this.baselineFrame === null && this.suppressExistingEvents) {
      markObservedItemInstances({
        frames,
        seenKeys: this.seenItemKeys,
        fromFrame: Frames.FIRST_PLAYABLE,
        toFrame: latestFrame,
      });
      this.baselineFrame = latestFrame;
      this.lastItemFrame = latestFrame;
      this.lastFrameEventFrame = latestFrame;
      // Events are suppressed on a mid-game attach, but running stats deliberately
      // cover the whole game — and returning the snapshot here (not []) lets the
      // owner's first-paint fire on this very poll instead of 500ms later.
      return { events: [], snapshot: this.buildSnapshot(stats, latestFrame) };
    }

    const minEventFrame = (this.baselineFrame ?? Frames.FIRST_PLAYABLE - 1) + 1;
    const events: CornermanLiveEvent[] = [];

    if (stats) {
      events.push(
        ...detectLiveConversionEvents({
          conversions: stats.conversions,
          players: this.players,
          seenKeys: this.seenConversionKeys,
          frames,
          stageId: settings.stageId,
          minEventFrame,
          // Once the game has ended, open conversions will never close —
          // emit them now instead of dropping them.
          allowOpenConversions: this.ended,
        }),
      );
    }

    const frameFrom = Math.max(this.lastFrameEventFrame + 1, minEventFrame);
    if (latestFrame >= frameFrom) {
      events.push(
        ...detectLiveFrameEvents({
          frames,
          conversions: stats?.conversions ?? [],
          players: this.players,
          seenKeys: this.seenFrameKeys,
          fromFrame: frameFrom,
          toFrame: latestFrame,
        }),
      );
      this.lastFrameEventFrame = latestFrame;
    }

    const fromFrame = Math.max(this.lastItemFrame + 1, minEventFrame);
    if (latestFrame >= fromFrame) {
      events.push(
        ...detectLiveItemEvents({
          frames,
          players: this.players,
          seenKeys: this.seenItemKeys,
          fromFrame,
          toFrame: latestFrame,
        }),
      );
      this.lastItemFrame = latestFrame;
    }

    if (this.ended) {
      this.completedPolls++;
    }

    return { events: events.sort((a, b) => a.frame - b.frame), snapshot: this.buildSnapshot(stats, latestFrame) };
  }
}

interface PollResult {
  events: CornermanLiveEvent[];
  snapshot: CornermanLiveSnapshot | null;
}

interface SnapshotEmitState {
  lastEmitMs: number;
  /** Phase of the last EMITTED snapshot; "" means this tracker has never emitted. */
  lastPhase: "" | "live" | "ended";
  lastFrame: number;
}

/** Pure emission gate (exported for tests): emit immediately on first paint and
 *  on a live→ended phase change, otherwise only when the game advanced and the
 *  throttle window has elapsed. A paused/wedged game stops advancing and thus
 *  stops emitting — which the renderer surfaces as a STALE pill. */
export function shouldEmitSnapshot(args: {
  nowMs: number;
  lastEmitMs: number;
  isFirst: boolean;
  phaseChanged: boolean;
  advanced: boolean;
}): boolean {
  if (args.isFirst) return true;
  if (args.phaseChanged) return true;
  if (!args.advanced) return false;
  return args.nowMs - args.lastEmitMs >= LIVE_STATS_EMIT_MS;
}

export function startCornermanLiveMonitor(options: CornermanLiveMonitorOptions): CornermanLiveMonitor {
  const trackers = new Map<string, LiveReplayTracker>();

  const addTracker = (filePath: string, suppressExistingEvents: boolean): void => {
    if (!filePath.endsWith(".slp") || trackers.has(filePath)) return;
    trackers.set(filePath, new LiveReplayTracker(filePath, options.targetPlayer, suppressExistingEvents));
  };

  for (const filePath of findRecentSlpFiles(options.replayFolder).slice(0, 1)) {
    addTracker(filePath, true);
  }

  const watcher: FSWatcher = chokidar.watch(options.replayFolder, {
    ignoreInitial: true,
    awaitWriteFinish: false,
    ignored: (filePath: string, stats?: fs.Stats) => {
      if (!stats) return false;
      return stats.isFile() && !filePath.endsWith(".slp");
    },
  });

  watcher.on("add", (filePath) => addTracker(filePath, false));

  // Exactly one tracker owns the stats stream at a time. A LIVE tracker that
  // advances claims ownership; an ENDED tracker claims only when nobody owns it
  // (so the just-finished game keeps showing its FINAL strip until the next game
  // starts advancing). A finished replay copied into the folder parses as ENDED
  // from its first poll, so it can never steal the stream from the live game.
  const emitStates = new Map<string, SnapshotEmitState>();
  let ownerKey: string | null = null;

  const considerSnapshotEmit = (key: string, snapshot: CornermanLiveSnapshot, nowMs: number): void => {
    const prev = emitStates.get(key) ?? { lastEmitMs: 0, lastPhase: "" as const, lastFrame: Number.NEGATIVE_INFINITY };
    const advanced = snapshot.latestFrame > prev.lastFrame;

    if (advanced) {
      if (snapshot.phase === "live") ownerKey = key;
      else if (ownerKey === null) ownerKey = key;
    }

    if (ownerKey !== key) {
      // Track frame progress even for non-owners so ownership math stays correct.
      emitStates.set(key, { ...prev, lastFrame: Math.max(prev.lastFrame, snapshot.latestFrame) });
      return;
    }

    const isFirst = prev.lastPhase === "";
    const phaseChanged = prev.lastPhase !== "" && prev.lastPhase !== snapshot.phase;
    const emit = shouldEmitSnapshot({ nowMs, lastEmitMs: prev.lastEmitMs, isFirst, phaseChanged, advanced });
    emitStates.set(key, {
      lastEmitMs: emit ? nowMs : prev.lastEmitMs,
      lastPhase: emit ? snapshot.phase : prev.lastPhase,
      lastFrame: Math.max(prev.lastFrame, snapshot.latestFrame),
    });
    if (emit && options.onSnapshot) options.onSnapshot(snapshot);
  };

  const pollTimer = setInterval(() => {
    const nowMs = Date.now();
    for (const [filePath, tracker] of trackers) {
      try {
        const { events, snapshot } = tracker.poll();
        if (events.length > 0) {
          options.onEvents(events);
        }
        if (snapshot) {
          considerSnapshotEmit(filePath, snapshot, nowMs);
        }
        if (tracker.isDone()) {
          trackers.delete(filePath);
          emitStates.delete(filePath);
          // Releasing ownership lets the next game's first advancing snapshot
          // claim the stream (and re-paint immediately as its first emit).
          if (ownerKey === filePath) ownerKey = null;
          // Only the seeded pre-watcher file: files added during the session
          // are imported by the folder watcher's own "add" event; reporting
          // them here too would race that import (double parse + spurious
          // UNIQUE-constraint errors).
          if (tracker.suppressExistingEvents && tracker.wasCompletedLive()) {
            options.onGameComplete?.(filePath);
          }
        }
      } catch (err) {
        options.onError?.(err instanceof Error ? err : new Error(String(err)), filePath);
      }
    }
  }, POLL_INTERVAL_MS);

  return {
    close: () => {
      clearInterval(pollTimer);
      void watcher.close();
      trackers.clear();
    },
  };
}
