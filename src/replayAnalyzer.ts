import crypto from "crypto";
import fs from "fs";
import type Database from "better-sqlite3";
import { loadConfig } from "./config";
import { getActiveModelId } from "./llm";
import {
  requirePlayerIdx,
  classifyGameResult,
  isDegenerateAnalysis,
  type GameSummary,
  type DerivedInsights,
  type GameHighlight,
} from "./pipeline";
import {
  insertGame,
  insertGameStats,
  insertSignatureStats,
  insertHighlights,
  type InsertGameParams,
  type InsertGameStatsParams,
} from "./db";

// ── Types ────────────────────────────────────────────────────────────

/** Row shape from the `games` table */
interface GameRow {
  id: number;
  replay_path: string;
  replay_hash: string;
  session_id: number | null;
}

/** Row shape from the `coaching_analyses` table */
interface AnalysisRow {
  id: number;
  game_id: number;
  analysis_text: string;
  model_used: string;
  created_at: string;
}

/** What processReplay returns to the caller */
export interface ProcessReplayResult {
  gameId: number;
  analysisText: string;
  /** true if we returned a cached analysis and skipped the LLM call */
  cached: boolean;
}

/** Result from the analysis generator — includes both LLM text and parsed game data */
export interface AnalysisGeneratorResult {
  analysisText: string;
  gameResult: {
    gameSummary: GameSummary;
    derivedInsights: [DerivedInsights, DerivedInsights];
    highlights: [GameHighlight[], GameHighlight[]];
    startAt: string | null;
  };
  targetPlayer: string;
}

// ── File hashing ─────────────────────────────────────────────────────

function hashFile(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ── Pluggable analysis generator ─────────────────────────────────────

/**
 * Function signature for generating coaching analysis from a replay.
 * Returns the LLM analysis text AND the parsed game data so the DB
 * can be populated with real metadata instead of dummy values.
 */
export type AnalysisGenerator = (filePath: string) => Promise<AnalysisGeneratorResult>;

let _generateAnalysis: AnalysisGenerator = async (filePath: string) => {
  // Fail closed: never invent zero-filled stats that look like a real analysis.
  throw new Error(
    `Analysis generator is not configured — refusing to invent stats for ${filePath}. Call setAnalysisGenerator() at startup.`,
  );
};

/**
 * Inject the real analysis pipeline. Call this once at app startup:
 *
 * ```ts
 * import { setAnalysisGenerator } from "./replayAnalyzer";
 * setAnalysisGenerator(async (filePath) => {
 *   const result = processGame(filePath, 1);
 *   const prompt = assembleUserPrompt([result], targetTag);
 *   const analysisText = await callLLM({ systemPrompt: SYSTEM_PROMPT, userPrompt: prompt, config });
 *   return { analysisText, gameResult: { ...result, startAt: result.startAt }, targetPlayer: targetTag };
 * });
 * ```
 */
export function setAnalysisGenerator(fn: AnalysisGenerator): void {
  _generateAnalysis = fn;
}

// ── Helpers to extract DB params from game data ─────────────────────

export function buildInsertGameParams(
  gameResult: AnalysisGeneratorResult["gameResult"],
  targetPlayer: string,
  filePath: string,
  fileHash: string,
  sessionId: number | null,
): InsertGameParams {
  const { gameSummary, startAt } = gameResult;
  if (isDegenerateAnalysis(gameResult)) {
    throw new Error("Refusing to persist degenerate / placeholder game analysis");
  }
  const playerIdx = requirePlayerIdx(gameSummary, targetPlayer);
  const opponentIdx = playerIdx === 0 ? 1 : 0;

  const player = gameSummary.players[playerIdx];
  const opponent = gameSummary.players[opponentIdx];

  const result = classifyGameResult(gameSummary.result, player.tag, opponent.tag, playerIdx, gameSummary.duration);

  return {
    sessionId,
    replayPath: filePath,
    replayHash: fileHash,
    playedAt: startAt,
    stage: gameSummary.stage,
    durationSeconds: gameSummary.duration,
    playerCharacter: player.character,
    opponentCharacter: opponent.character,
    playerTag: player.tag,
    playerConnectCode: player.connectCode || null,
    opponentTag: opponent.tag,
    opponentConnectCode: opponent.connectCode || null,
    result,
    endMethod: gameSummary.result.endMethod,
    playerFinalStocks: gameSummary.result.finalStocks[playerIdx],
    playerFinalPercent: gameSummary.result.finalPercents[playerIdx],
    opponentFinalStocks: gameSummary.result.finalStocks[opponentIdx],
    opponentFinalPercent: gameSummary.result.finalPercents[opponentIdx],
    gameNumber: gameSummary.gameNumber,
    analysisStatus: "ok",
  };
}

export function buildInsertGameStatsParams(
  gameId: number,
  gameResult: AnalysisGeneratorResult["gameResult"],
  targetPlayer: string,
): InsertGameStatsParams {
  const { gameSummary, derivedInsights } = gameResult;
  const playerIdx = requirePlayerIdx(gameSummary, targetPlayer);
  const player = gameSummary.players[playerIdx];
  const insights = derivedInsights[playerIdx];

  const totalDamageDealt = player.stocks.reduce((sum, s) => sum + s.damageDealt, 0);

  return {
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
    ledgeEntropy: insights.afterLedgeGrab.entropy,
    knockdownEntropy: insights.afterKnockdown.entropy,
    shieldPressureEntropy: insights.afterShieldPressure.entropy,
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
  };
}

// ── Core: process a single replay ────────────────────────────────────

/**
 * Deduplicated replay analysis:
 * 1. Hash the .slp file (SHA-256)
 * 2. If game+analysis already exist in DB → return cached (no LLM cost)
 * 3. If game exists but no analysis → generate and attach
 * 4. If new → import game with full parsed data + generate analysis in a transaction
 */
export async function processReplay(
  filePath: string,
  db: Database.Database,
  sessionId: number | null = null,
): Promise<ProcessReplayResult> {
  const fileHash = hashFile(filePath);

  // ── 1. Check if this replay is already in the database ─────────────

  const existingGame = db
    .prepare("SELECT id, replay_path, replay_hash, session_id FROM games WHERE replay_hash = ?")
    .get(fileHash) as GameRow | undefined;

  if (existingGame) {
    // ── 2. Game exists — look for cached analysis ────────────────────

    const currentModelId = getActiveModelId(loadConfig());
    const cachedAnalysis = db
      .prepare(
        `
      SELECT id, game_id, analysis_text, model_used, created_at
      FROM coaching_analyses
      WHERE game_id = ? AND model_used = ? AND scope = 'game'
      ORDER BY created_at DESC
      LIMIT 1
    `,
      )
      .get(existingGame.id, currentModelId) as AnalysisRow | undefined;

    if (cachedAnalysis) {
      // Cache hit — zero cost, return immediately
      return {
        gameId: existingGame.id,
        analysisText: cachedAnalysis.analysis_text,
        cached: true,
      };
    }

    // ── 3. Game exists but no analysis — generate one ────────────────

    const { analysisText } = await _generateAnalysis(filePath);

    db.prepare(
      `
      INSERT INTO coaching_analyses (game_id, session_id, model_used, analysis_text, scope)
      VALUES (?, ?, ?, ?, 'game')
    `,
    ).run(existingGame.id, existingGame.session_id, getActiveModelId(loadConfig()), analysisText);

    return {
      gameId: existingGame.id,
      analysisText,
      cached: false,
    };
  }

  // ── 4. New replay — generate analysis first, then insert atomically ─

  const { analysisText, gameResult, targetPlayer } = await _generateAnalysis(filePath);

  // Transaction ensures we never end up with a game row but no analysis.
  // If any insert fails, all roll back.
  const insertTransaction = db.transaction((text: string) => {
    const gameParams = buildInsertGameParams(gameResult, targetPlayer, filePath, fileHash, sessionId);
    const gameId = insertGame(gameParams);

    // Use the canonical db.ts function — keeps columns in sync automatically
    const statsParams = buildInsertGameStatsParams(gameId, gameResult, targetPlayer);
    insertGameStats(statsParams);

    // Store character-specific signature stats
    const playerIdx = requirePlayerIdx(gameResult.gameSummary, targetPlayer);
    const player = gameResult.gameSummary.players[playerIdx];
    if (player.signatureStats) {
      insertSignatureStats(gameId, JSON.stringify(player.signatureStats));
    }

    // Store highlights
    const playerHighlights = gameResult.highlights[playerIdx];
    if (playerHighlights && playerHighlights.length > 0) {
      insertHighlights(gameId, playerHighlights);
    }

    // Insert coaching analysis
    db.prepare(
      `
      INSERT INTO coaching_analyses (game_id, session_id, model_used, analysis_text, scope)
      VALUES (?, ?, ?, ?, 'game')
    `,
    ).run(gameId, sessionId, getActiveModelId(loadConfig()), text);

    return gameId;
  });

  const gameId = insertTransaction(analysisText);

  return {
    gameId,
    analysisText,
    cached: false,
  };
}

// ── Batch processing ─────────────────────────────────────────────────

export interface BatchResult {
  results: ProcessReplayResult[];
  newCount: number;
  cachedCount: number;
  /** Rough cost estimate — $0 for cached, ~$0.02 per new Gemini Flash call */
  estimatedCost: number;
}

/**
 * Process multiple replays, deduplicating each one.
 * Returns aggregate stats so the UI can show "Analyzed 3 new, 2 cached ($0.06)".
 */
export async function processReplays(
  filePaths: string[],
  db: Database.Database,
  sessionId: number | null = null,
): Promise<BatchResult> {
  const results: ProcessReplayResult[] = [];
  let newCount = 0;
  let cachedCount = 0;

  for (const filePath of filePaths) {
    const result = await processReplay(filePath, db, sessionId);
    results.push(result);
    if (result.cached) {
      cachedCount++;
    } else {
      newCount++;
    }
  }

  return {
    results,
    newCount,
    cachedCount,
    estimatedCost: newCount * 0.02,
  };
}
