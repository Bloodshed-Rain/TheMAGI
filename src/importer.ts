import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  processGame,
  findPlayerIdx,
  computeAdaptationSignals,
  assembleUserPrompt,
  callGemini,
  SYSTEM_PROMPT,
  type GameResult,
  type GameSummary,
  type PlayerSummary,
  type DerivedInsights,
} from "./pipeline";

import {
  replayExists,
  insertGame,
  insertGameStats,
  insertCoachingAnalysis,
  createSession,
  updateSession,
  type InsertGameParams,
  type InsertGameStatsParams,
} from "./db";

// ── File hashing ─────────────────────────────────────────────────────

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

// ── Import result ────────────────────────────────────────────────────

export interface ImportResult {
  filePath: string;
  hash: string;
  skipped: boolean;
  gameId?: number;
  gameSummary?: GameSummary;
}

// ── Single game import ───────────────────────────────────────────────

export function importReplay(
  filePath: string,
  targetPlayer: string | null,
  gameNumber: number = 1,
  sessionId: number | null = null,
): ImportResult {
  const absolutePath = path.resolve(filePath);
  const hash = hashFile(absolutePath);

  // Dedup check
  if (replayExists(hash)) {
    return { filePath: absolutePath, hash, skipped: true };
  }

  // Parse the game
  const { gameSummary, derivedInsights, startAt } = processGame(absolutePath, gameNumber);

  // Resolve target player
  const targetTag =
    targetPlayer ??
    gameSummary.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ??
    gameSummary.players[0].tag;

  const playerIdx = findPlayerIdx(gameSummary, targetTag);
  const opponentIdx = playerIdx === 0 ? 1 : 0;

  const player = gameSummary.players[playerIdx];
  const opponent = gameSummary.players[opponentIdx];
  const playerInsights = derivedInsights[playerIdx];

  // Determine result
  let result: "win" | "loss" | "draw";
  if (gameSummary.result.winner === player.tag) {
    result = "win";
  } else if (gameSummary.result.winner === "Unknown") {
    result = "draw";
  } else {
    result = "loss";
  }

  // Compute total damage dealt from stock data
  const totalDamageDealt = player.stocks.reduce((sum, s) => sum + s.damageDealt, 0);

  // Insert game record
  const gameId = insertGame({
    sessionId,
    replayPath: absolutePath,
    replayHash: hash,
    playedAt: startAt,
    stage: gameSummary.stage,
    durationSeconds: gameSummary.duration,
    playerCharacter: player.character,
    opponentCharacter: opponent.character,
    playerTag: player.tag,
    opponentTag: opponent.tag,
    playerConnectCode: player.connectCode || null,
    opponentConnectCode: opponent.connectCode || null,
    result,
    endMethod: gameSummary.result.endMethod,
    playerFinalStocks: gameSummary.result.finalStocks[playerIdx],
    playerFinalPercent: gameSummary.result.finalPercents[playerIdx],
    opponentFinalStocks: gameSummary.result.finalStocks[opponentIdx],
    opponentFinalPercent: gameSummary.result.finalPercents[opponentIdx],
    gameNumber,
  });

  // Insert stats
  insertGameStats({
    gameId,
    neutralWins: player.neutralWins,
    neutralLosses: player.neutralLosses,
    neutralWinRate: player.neutralWinRate,
    counterHits: player.counterHits,
    openingsPerKill: player.openingsPerKill,
    totalOpenings: player.totalOpenings,
    totalConversions: player.totalConversions,
    conversionRate: player.conversionRate,
    avgDamagePerOpening: player.averageDamagePerOpening,
    killConversions: player.killConversions,
    lCancelRate: player.lCancelRate,
    wavedashCount: player.wavedashCount,
    dashDanceFrames: player.dashDanceFrames,
    avgStagePositionX: player.avgStagePosition.x,
    timeOnPlatform: player.timeOnPlatform,
    timeInAir: player.timeInAir,
    timeAtLedge: player.timeAtLedge,
    totalDamageTaken: player.totalDamageTaken,
    totalDamageDealt: totalDamageDealt,
    avgDeathPercent: player.avgDeathPercent,
    recoveryAttempts: player.recoveryAttempts,
    recoverySuccessRate: player.recoverySuccessRate,
    ledgeEntropy: playerInsights.afterLedgeGrab.entropy,
    knockdownEntropy: playerInsights.afterKnockdown.entropy,
    shieldPressureEntropy: playerInsights.afterShieldPressure.entropy,
  });

  return { filePath: absolutePath, hash, skipped: false, gameId, gameSummary };
}

// ── Batch import (a set of replays) ──────────────────────────────────

export interface BatchImportResult {
  imported: ImportResult[];
  skipped: number;
  sessionId: number | null;
}

export function importReplays(
  filePaths: string[],
  targetPlayer: string | null,
): BatchImportResult {
  if (filePaths.length === 0) {
    return { imported: [], skipped: 0, sessionId: null };
  }

  // Create a session for this batch
  const now = new Date().toISOString();
  const sessionId = createSession(now);

  const results: ImportResult[] = [];
  let skippedCount = 0;
  let winsCount = 0;

  for (let i = 0; i < filePaths.length; i++) {
    const result = importReplay(filePaths[i]!, targetPlayer, i + 1, sessionId);
    results.push(result);
    if (result.skipped) {
      skippedCount++;
    } else if (result.gameSummary) {
      // Resolve target to check win
      const tag =
        targetPlayer ??
        result.gameSummary.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ??
        result.gameSummary.players[0].tag;
      if (result.gameSummary.result.winner === tag) {
        winsCount++;
      }
    }
  }

  const importedCount = results.filter((r) => !r.skipped).length;

  // Update session with final stats
  updateSession(sessionId, now, importedCount, winsCount);

  return { imported: results, skipped: skippedCount, sessionId };
}

// ── Import + analyze ─────────────────────────────────────────────────

export async function importAndAnalyze(
  filePaths: string[],
  targetPlayer: string | null,
): Promise<{ batchResult: BatchImportResult; analysis: string | null }> {
  // First import all replays
  const batchResult = importReplays(filePaths, targetPlayer);

  const importedFiles = batchResult.imported.filter((r) => !r.skipped);
  if (importedFiles.length === 0) {
    return { batchResult, analysis: null };
  }

  // Re-process for LLM prompt (we need the full GameResult objects)
  const gameResults: GameResult[] = [];
  for (let i = 0; i < filePaths.length; i++) {
    const result = batchResult.imported[i]!;
    if (!result.skipped) {
      gameResults.push(processGame(result.filePath, i + 1));
    }
  }

  if (gameResults.length === 0) {
    return { batchResult, analysis: null };
  }

  // Resolve target player
  const firstGame = gameResults[0]!.gameSummary;
  const targetTag =
    targetPlayer ??
    firstGame.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ??
    firstGame.players[0].tag;

  // Compute adaptation signals for multi-game sets
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

  const userPrompt = assembleUserPrompt(gameResults, targetTag);
  const analysis = await callGemini(SYSTEM_PROMPT, userPrompt);

  // Store the coaching analysis
  if (batchResult.sessionId) {
    insertCoachingAnalysis(null, batchResult.sessionId, "gemini-2.5-flash", analysis);
  }

  return { batchResult, analysis };
}
