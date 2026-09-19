import { processGame } from "./processGame.js";
import type { AnalysisStatus } from "./analysisStatus.js";
import type { GameResult } from "./types.js";

export type AnalyzedGame = GameResult;

export type AnalyzeGameOk = {
  status: "ok";
  result: AnalyzedGame;
};

export type AnalyzeGameErr = {
  status: "failed" | "unavailable";
  reason: string;
  filePath: string;
};

export type AnalyzeGameOutcome = AnalyzeGameOk | AnalyzeGameErr;

/**
 * True when a successful-looking processGame payload is actually empty junk
 * (e.g. placeholder / zero-duration) that must not be persisted as real stats.
 */
export function isDegenerateAnalysis(result: Pick<AnalyzedGame, "gameSummary">): boolean {
  const { gameSummary } = result;
  if (!Number.isFinite(gameSummary.duration) || gameSummary.duration < 0) return true;
  if (gameSummary.duration === 0 && gameSummary.stage === "Unknown") return true;

  const players = gameSummary.players;
  if (!players || players.length !== 2) return true;

  const bothUnknownChars = players.every((p) => !p.character || p.character === "Unknown");
  const bothUnknownTags = players.every((p) => !p.tag || p.tag === "Unknown");
  if (bothUnknownChars && bothUnknownTags && gameSummary.duration === 0) return true;

  // Missing numeric fields that buildInsertGameStatsParams requires — treat as failed
  // so we never coerce undefined → 0 into SQLite as a "real" L-cancel / W/L rate.
  for (const p of players) {
    if (
      typeof p.neutralWinRate !== "number" ||
      typeof p.lCancelRate !== "number" ||
      typeof p.conversionRate !== "number" ||
      typeof p.openingsPerKill !== "number" ||
      typeof p.averageDamagePerOpening !== "number"
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Analysis boundary: never returns success-shaped fake stats.
 * Callers must branch on outcome.status before persisting or rendering rates.
 */
export function analyzeGame(filePath: string, gameNumber: number = 1): AnalyzeGameOutcome {
  try {
    const result = processGame(filePath, gameNumber);
    if (isDegenerateAnalysis(result)) {
      return {
        status: "failed",
        reason: "Analysis produced incomplete or placeholder stats",
        filePath,
      };
    }
    return { status: "ok", result };
  } catch (err) {
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
      filePath,
    };
  }
}

export function assertAnalysisOk(outcome: AnalyzeGameOutcome): AnalyzedGame {
  if (outcome.status !== "ok") {
    throw new Error(`Game analysis ${outcome.status}: ${outcome.reason}`);
  }
  return outcome.result;
}

export function analysisStatusFromOutcome(outcome: AnalyzeGameOutcome): AnalysisStatus {
  return outcome.status === "ok" ? "ok" : outcome.status;
}
