import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  findPlayerIdx,
  computeAdaptationSignals,
  assembleUserPrompt,
  SYSTEM_PROMPT,
  type GameResult,
  type GameSummary,
} from "./pipeline";
import { callLLM, LLM_DEFAULTS, type LLMConfig } from "./llm";
import { loadConfig } from "./config";
import { parsePool } from "./parsePool";

import {
  getDb,
  replayExists,
  insertGame,
  insertGameStats,
  insertCoachingAnalysis,
  insertSignatureStats,
  insertHighlights,
  createSession,
  updateSession,
  getPlayerHistory,
} from "./db";

// ── File hashing ─────────────────────────────────────────────────────

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/** Yield to the event loop so Electron stays responsive */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// ── Import result ────────────────────────────────────────────────────

export interface ImportResult {
  filePath: string;
  hash: string;
  skipped: boolean;
  gameId?: number;
  gameSummary?: GameSummary;
  /** Cached full game result to avoid re-parsing for LLM prompt assembly */
  gameResult?: GameResult;
}

// ── Single game import ───────────────────────────────────────────────

export async function importReplay(
  filePath: string,
  targetPlayer: string | null,
  gameNumber: number = 1,
  sessionId: number | null = null,
): Promise<ImportResult> {
  const absolutePath = path.resolve(filePath);
  const hash = await hashFile(absolutePath);

  // Dedup check
  if (replayExists(hash)) {
    return { filePath: absolutePath, hash, skipped: true };
  }

  // Parse the game via pool
  const gameResult = await parsePool.parse(absolutePath, gameNumber);
  const { gameSummary, derivedInsights, startAt } = gameResult;

  // Resolve target player — use the explicit target, only guess if nothing provided
  let targetTag = targetPlayer ?? "";
  if (!targetTag) {
    console.warn(`[importReplay] No target player for ${path.basename(absolutePath)} — guessing from replay`);
    targetTag =
      gameSummary.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ??
      gameSummary.players[0].tag;
  }

  const playerIdx = findPlayerIdx(gameSummary, targetTag);
  const opponentIdx = playerIdx === 0 ? 1 : 0;

  const player = gameSummary.players[playerIdx];
  const opponent = gameSummary.players[opponentIdx];
  const playerInsights = derivedInsights[playerIdx];

  // Determine result — if both players have stocks remaining, count as a draw (e.g. LRAS quit-out)
  const pStocks = gameSummary.result.finalStocks[playerIdx];
  const oStocks = gameSummary.result.finalStocks[opponentIdx];
  let result: "win" | "loss" | "draw";
  if (pStocks > 0 && oStocks > 0) {
    result = "draw";
  } else if (gameSummary.result.winner === player.tag) {
    result = "win";
  } else if (gameSummary.result.winner === "Unknown") {
    result = "draw";
  } else {
    result = "loss";
  }

  // Compute total damage dealt from stock data
  const totalDamageDealt = player.stocks.reduce((sum, s) => sum + s.damageDealt, 0);

  // Insert game + stats + signature stats atomically.
  const importTransaction = getDb().transaction(() => {
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
      powerShieldCount: player.powerShieldCount,
      edgeguardAttempts: player.edgeguardAttempts,
      edgeguardSuccessRate: player.edgeguardSuccessRate,
      shieldPressureSequences: player.shieldPressure.sequenceCount,
      shieldPressureAvgDamage: player.shieldPressure.avgShieldDamage,
      shieldBreaks: player.shieldPressure.shieldBreaks,
      shieldPokeRate: player.shieldPressure.shieldPokeRate,
      diSurvivalScore: player.diQuality.survivalDIScore,
      diComboScore: player.diQuality.comboDIScore,
      diAvgComboLengthReceived: player.diQuality.avgComboLengthReceived,
      diAvgComboLengthDealt: player.diQuality.avgComboLengthDealt,
    });

    if (player.signatureStats) {
      insertSignatureStats(gameId, JSON.stringify(player.signatureStats));
    }

    // Persist highlights for the target player
    const playerHighlights = gameResult.highlights[playerIdx];
    if (playerHighlights && playerHighlights.length > 0) {
      insertHighlights(gameId, playerHighlights);
    }

    return gameId;
  });

  const gameId = importTransaction();

  return { filePath: absolutePath, hash, skipped: false, gameId, gameSummary, gameResult };
}

// ── Progress callback ────────────────────────────────────────────────

export interface ImportProgress {
  current: number;
  total: number;
  lastFile: string;
  /** Running count of successfully imported games */
  importedSoFar: number;
  /** Running count of skipped duplicates */
  skippedSoFar: number;
  /** Running count of files that failed to parse/import */
  errorsSoFar: number;
  /** If the current file errored, a short reason */
  lastError?: string;
  /** Status of the current file */
  lastFileStatus: "imported" | "skipped" | "error";
}

export type ImportProgressCallback = (progress: ImportProgress) => void;

// ── Batch import (a set of replays) ──────────────────────────────────

export interface FileError {
  filePath: string;
  error: string;
}

export interface BatchImportResult {
  imported: ImportResult[];
  skipped: number;
  /** Number of files that failed to parse or import */
  errors: number;
  /** Details for each failed file (capped to avoid huge payloads) */
  errorDetails: FileError[];
  sessionId: number | null;
}

/** Max error details to keep — prevents huge payloads when most files fail */
const MAX_ERROR_DETAILS = 50;

/** Max game results to keep in memory for LLM analysis after import.
 *  Older entries have heavy fields (gameSummary, gameResult) evicted
 *  to prevent OOM on large imports (65K+ replays). */
const MAX_CACHED_RESULTS = 20;

/** Classify an import error into a user-friendly short message */
function classifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("ENOENT") || msg.includes("no such file")) return "File not found";
  if (msg.includes("EACCES") || msg.includes("permission denied")) return "Permission denied";
  if (msg.includes("is not a valid")) return "Not a valid Slippi replay";
  if (msg.includes("ENOMEM") || msg.includes("out of memory")) return "Out of memory";
  if (msg.includes("Cannot read") || msg.includes("undefined")) return "Corrupt or incomplete replay";
  if (msg.includes("target player")) return "Target player not found in replay";

  // Truncate long messages
  return msg.length > 120 ? msg.slice(0, 117) + "..." : msg;
}

export async function importReplays(
  filePaths: string[],
  targetPlayer: string | null,
  onProgress?: ImportProgressCallback,
): Promise<BatchImportResult> {
  if (filePaths.length === 0) {
    return { imported: [], skipped: 0, errors: 0, errorDetails: [], sessionId: null };
  }

  const now = new Date().toISOString();
  const sessionId = createSession(now);

  const finalResults: ImportResult[] = [];
  let skippedCount = 0;
  let winsCount = 0;
  let errorCount = 0;
  let importedCount = 0;
  const errorDetails: FileError[] = [];
  let earliestGameTime: string | null = null;
  let latestGameTime: string | null = null;

  // Step 1: Hash and filter duplicates in parallel (with limit)
  const toParse: { filePath: string; hash: string; gameNumber: number }[] = [];
  const HASH_CONCURRENCY = 16;
  
  for (let i = 0; i < filePaths.length; i += HASH_CONCURRENCY) {
    const chunk = filePaths.slice(i, i + HASH_CONCURRENCY);
    const hashes = await Promise.all(
      chunk.map(async (fp) => {
        try {
          const hash = await hashFile(fp);
          return { fp, hash };
        } catch (err) {
          return { fp, err };
        }
      })
    );

    for (const { fp, hash, err } of hashes as any[]) {
      const fileName = path.basename(fp);
      if (err) {
        const errorMsg = classifyError(err);
        errorCount++;
        if (errorDetails.length < MAX_ERROR_DETAILS) {
          errorDetails.push({ filePath: fp, error: errorMsg });
        }
        finalResults.push({ filePath: fp, hash: "", skipped: false }); // Placeholder for failed hash
        onProgress?.({
          current: finalResults.length,
          total: filePaths.length,
          lastFile: fileName,
          importedSoFar: importedCount,
          skippedSoFar: skippedCount,
          errorsSoFar: errorCount,
          lastFileStatus: "error",
          lastError: errorMsg,
        });
        continue;
      }

      if (replayExists(hash)) {
        skippedCount++;
        finalResults.push({ filePath: fp, hash, skipped: true });
        onProgress?.({
          current: finalResults.length,
          total: filePaths.length,
          lastFile: fileName,
          importedSoFar: importedCount,
          skippedSoFar: skippedCount,
          errorsSoFar: errorCount,
          lastFileStatus: "skipped",
        });
      } else {
        toParse.push({ filePath: fp, hash, gameNumber: finalResults.length + 1 });
        finalResults.push({ filePath: fp, hash, skipped: false }); // Will be updated
      }
    }
    await yieldToEventLoop();
  }

  // Step 2: Parse remaining replays in parallel via ParsePool
  // We process in batches to allow database commit interleaving
  const DB_BATCH_SIZE = 50;
  for (let i = 0; i < toParse.length; i += DB_BATCH_SIZE) {
    const chunk = toParse.slice(i, i + DB_BATCH_SIZE);
    
    // Parse the chunk in parallel
    const parseResults = await Promise.all(
      chunk.map(async (item) => {
        try {
          const result = await parsePool.parse(item.filePath, item.gameNumber);
          return { success: true, item, result };
        } catch (err) {
          return { success: false, item, error: err };
        }
      })
    );

    // Insert into DB in a single transaction
    const dbBatch = getDb().transaction(() => {
      for (const res of parseResults) {
        if (!res.success) continue;
        const { item } = res;
        const gameResult = res.result!;
        const { gameSummary, derivedInsights, startAt } = gameResult;

        let targetTag = targetPlayer ?? "";
        if (!targetTag) {
          targetTag =
            gameSummary.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ??
            gameSummary.players[0].tag;
        }

        const playerIdx = findPlayerIdx(gameSummary, targetTag);
        const opponentIdx = playerIdx === 0 ? 1 : 0;
        const player = gameSummary.players[playerIdx];
        const opponent = gameSummary.players[opponentIdx];
        const playerInsights = derivedInsights[playerIdx];

        // If both players have stocks remaining, count as a draw (e.g. LRAS quit-out)
        const pStocks = gameSummary.result.finalStocks[playerIdx];
        const oStocks = gameSummary.result.finalStocks[opponentIdx];
        let gameResultStr: "win" | "loss" | "draw";
        if (pStocks > 0 && oStocks > 0) {
          gameResultStr = "draw";
        } else if (gameSummary.result.winner === player.tag) {
          gameResultStr = "win";
        } else if (gameSummary.result.winner === "Unknown") {
          gameResultStr = "draw";
        } else {
          gameResultStr = "loss";
        }

        const totalDamageDealt = player.stocks.reduce((sum, s) => sum + s.damageDealt, 0);

        const gameId = insertGame({
          sessionId,
          replayPath: item.filePath,
          replayHash: item.hash,
          playedAt: startAt,
          stage: gameSummary.stage,
          durationSeconds: gameSummary.duration,
          playerCharacter: player.character,
          opponentCharacter: opponent.character,
          playerTag: player.tag,
          opponentTag: opponent.tag,
          playerConnectCode: player.connectCode || null,
          opponentConnectCode: opponent.connectCode || null,
          result: gameResultStr,
          endMethod: gameSummary.result.endMethod,
          playerFinalStocks: gameSummary.result.finalStocks[playerIdx],
          playerFinalPercent: gameSummary.result.finalPercents[playerIdx],
          opponentFinalStocks: gameSummary.result.finalStocks[opponentIdx],
          opponentFinalPercent: gameSummary.result.finalPercents[opponentIdx],
          gameNumber: item.gameNumber,
        });

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
          powerShieldCount: player.powerShieldCount,
          edgeguardAttempts: player.edgeguardAttempts,
          edgeguardSuccessRate: player.edgeguardSuccessRate,
          shieldPressureSequences: player.shieldPressure.sequenceCount,
          shieldPressureAvgDamage: player.shieldPressure.avgShieldDamage,
          shieldBreaks: player.shieldPressure.shieldBreaks,
          shieldPokeRate: player.shieldPressure.shieldPokeRate,
          diSurvivalScore: player.diQuality.survivalDIScore,
          diComboScore: player.diQuality.comboDIScore,
          diAvgComboLengthReceived: player.diQuality.avgComboLengthReceived,
          diAvgComboLengthDealt: player.diQuality.avgComboLengthDealt,
        });

        if (player.signatureStats) {
          insertSignatureStats(gameId, JSON.stringify(player.signatureStats));
        }

        // Persist highlights for the target player
        const playerHighlights = gameResult.highlights[playerIdx];
        if (playerHighlights && playerHighlights.length > 0) {
          insertHighlights(gameId, playerHighlights);
        }

        if (startAt) {
          if (!earliestGameTime || startAt < earliestGameTime) earliestGameTime = startAt;
          if (!latestGameTime || startAt > latestGameTime) latestGameTime = startAt;
        }

        if (gameSummary.result.winner === targetTag) {
          winsCount++;
        }

        // Update finalResults entry — use the gameNumber to find the index directly
        const idx = item.gameNumber - 1;
        if (finalResults[idx]) {
          finalResults[idx] = {
            ...finalResults[idx],
            gameId,
            gameSummary,
            gameResult,
          };
        }
      }
    });

    dbBatch();

    // Update progress and error counts
    for (const res of parseResults) {
      const fileName = path.basename(res.item.filePath);
      if (res.success) {
        importedCount++;
        onProgress?.({
          current: finalResults.length, // approximation
          total: filePaths.length,
          lastFile: fileName,
          importedSoFar: importedCount,
          skippedSoFar: skippedCount,
          errorsSoFar: errorCount,
          lastFileStatus: "imported",
        });
      } else {
        const errorMsg = classifyError(res.error);
        errorCount++;
        if (errorDetails.length < MAX_ERROR_DETAILS) {
          errorDetails.push({ filePath: res.item.filePath, error: errorMsg });
        }
        onProgress?.({
          current: finalResults.length,
          total: filePaths.length,
          lastFile: fileName,
          importedSoFar: importedCount,
          skippedSoFar: skippedCount,
          errorsSoFar: errorCount,
          lastFileStatus: "error",
          lastError: errorMsg,
        });
      }
    }
    // Evict heavy fields from older entries to bound memory on large imports.
    // Only the most recent MAX_CACHED_RESULTS entries keep gameSummary/gameResult.
    const evictBefore = finalResults.length - MAX_CACHED_RESULTS;
    if (evictBefore > 0) {
      for (let k = 0; k < evictBefore; k++) {
        const entry = finalResults[k];
        if (entry && (entry.gameSummary || entry.gameResult)) {
          delete entry.gameSummary;
          delete entry.gameResult;
        }
      }
    }

    await yieldToEventLoop();
  }

  // Use actual game timestamps for the session; fall back to import time
  if (earliestGameTime) {
    getDb().prepare("UPDATE sessions SET started_at = ? WHERE id = ?").run(earliestGameTime, sessionId);
  }
  updateSession(sessionId, latestGameTime ?? now, importedCount, winsCount);

  return { imported: finalResults, skipped: skippedCount, errors: errorCount, errorDetails, sessionId };
}

// ── Import + analyze ─────────────────────────────────────────────────

export async function importAndAnalyze(
  filePaths: string[],
  targetPlayer: string | null,
  onProgress?: ImportProgressCallback,
): Promise<{ batchResult: BatchImportResult; analysis: string | null }> {
  const batchResult = await importReplays(filePaths, targetPlayer, onProgress);

  const importedFiles = batchResult.imported.filter((r) => !r.skipped && r.gameId !== undefined);
  if (importedFiles.length === 0) {
    return { batchResult, analysis: null };
  }

  // Use cached GameResults from import — no re-parsing needed.
  // Cap at 20 games for LLM prompt (larger sets would exceed context limits).
  const MAX_LLM_GAMES = 20;
  const filesToAnalyze = importedFiles.slice(-MAX_LLM_GAMES);
  const gameResults: GameResult[] = [];
  for (const file of filesToAnalyze) {
    if (file.gameResult) {
      gameResults.push(file.gameResult);
    }
  }

  if (gameResults.length === 0) {
    return { batchResult, analysis: null };
  }

  const firstGame = gameResults[0]!.gameSummary;
  const targetTag =
    targetPlayer ??
    firstGame.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ??
    firstGame.players[0].tag;

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

  const playerHistory = getPlayerHistory(targetTag) ?? undefined;
  const userPrompt = assembleUserPrompt(gameResults, targetTag, playerHistory);
  const userCfg = loadConfig();
  const llmConfig: LLMConfig = {
    modelId: userCfg.llmModelId ?? LLM_DEFAULTS.modelId,
    openrouterApiKey: userCfg.openrouterApiKey,
    geminiApiKey: userCfg.geminiApiKey,
    anthropicApiKey: userCfg.anthropicApiKey,
    openaiApiKey: userCfg.openaiApiKey,
    localEndpoint: userCfg.localEndpoint,
  };
  const analysis = await callLLM({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    config: llmConfig,
  });

  if (batchResult.sessionId) {
    insertCoachingAnalysis(null, batchResult.sessionId, llmConfig.modelId, analysis);
  }

  return { batchResult, analysis };
}

