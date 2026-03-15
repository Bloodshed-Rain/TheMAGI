import crypto from "crypto";
import fs from "fs";
import type Database from "better-sqlite3";

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

// ── File hashing ─────────────────────────────────────────────────────

function hashFile(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ── Pluggable analysis generator ─────────────────────────────────────

/**
 * Function signature for generating coaching analysis from a replay.
 * The real implementation calls slippi-js → pipeline → Gemini.
 * Can be swapped out for testing.
 */
export type AnalysisGenerator = (filePath: string) => Promise<string>;

let _generateAnalysis: AnalysisGenerator = async (filePath: string) => {
  return `[Placeholder analysis for ${filePath}] — Wire up with setAnalysisGenerator().`;
};

/**
 * Inject the real analysis pipeline. Call this once at app startup:
 *
 * ```ts
 * import { setAnalysisGenerator } from "./replayAnalyzer";
 * setAnalysisGenerator(async (filePath) => {
 *   const result = processGame(filePath, 1);
 *   const prompt = assembleUserPrompt([result], targetTag);
 *   return await callGemini(SYSTEM_PROMPT, prompt);
 * });
 * ```
 */
export function setAnalysisGenerator(fn: AnalysisGenerator): void {
  _generateAnalysis = fn;
}

// ── Core: process a single replay ────────────────────────────────────

/**
 * Deduplicated replay analysis:
 * 1. Hash the .slp file (SHA-256)
 * 2. If game+analysis already exist in DB → return cached (no LLM cost)
 * 3. If game exists but no analysis → generate and attach
 * 4. If new → import game + generate analysis in a transaction
 */
export async function processReplay(
  filePath: string,
  db: Database.Database,
  sessionId: number | null = null,
): Promise<ProcessReplayResult> {
  const fileHash = hashFile(filePath);

  // ── 1. Check if this replay is already in the database ─────────────

  const existingGame = db.prepare(
    "SELECT id, replay_path, replay_hash, session_id FROM games WHERE replay_hash = ?",
  ).get(fileHash) as GameRow | undefined;

  if (existingGame) {
    // ── 2. Game exists — look for cached analysis ────────────────────

    const cachedAnalysis = db.prepare(`
      SELECT id, game_id, analysis_text, model_used, created_at
      FROM coaching_analyses
      WHERE game_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(existingGame.id) as AnalysisRow | undefined;

    if (cachedAnalysis) {
      // Cache hit — zero cost, return immediately
      return {
        gameId: existingGame.id,
        analysisText: cachedAnalysis.analysis_text,
        cached: true,
      };
    }

    // ── 3. Game exists but no analysis — generate one ────────────────

    const analysisText = await _generateAnalysis(filePath);

    db.prepare(`
      INSERT INTO coaching_analyses (game_id, session_id, model_used, analysis_text)
      VALUES (?, ?, ?, ?)
    `).run(
      existingGame.id,
      existingGame.session_id,
      "gemini-2.5-flash",
      analysisText,
    );

    return {
      gameId: existingGame.id,
      analysisText,
      cached: false,
    };
  }

  // ── 4. New replay — generate analysis first, then insert atomically ─

  const analysisText = await _generateAnalysis(filePath);

  // Transaction ensures we never end up with a game row but no analysis.
  // If either insert fails, both roll back.
  const insertTransaction = db.transaction((text: string) => {
    const gameResult = db.prepare(`
      INSERT INTO games (
        session_id, replay_path, replay_hash, played_at,
        stage, duration_seconds,
        player_character, opponent_character,
        player_tag, opponent_tag,
        result, end_method,
        player_final_stocks, player_final_percent,
        opponent_final_stocks, opponent_final_percent,
        game_number
      ) VALUES (
        ?, ?, ?, NULL,
        'Unknown', 0,
        'Unknown', 'Unknown',
        'Unknown', 'Unknown',
        'draw', 'unknown',
        0, 0,
        0, 0,
        1
      )
    `).run(sessionId, filePath, fileHash);

    const gameId = Number(gameResult.lastInsertRowid);

    db.prepare(`
      INSERT INTO coaching_analyses (game_id, session_id, model_used, analysis_text)
      VALUES (?, ?, ?, ?)
    `).run(gameId, sessionId, "gemini-2.5-flash", text);

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
