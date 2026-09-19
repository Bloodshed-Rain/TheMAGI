import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// better-sqlite3 is compiled for Electron's Node version, so we can't
// use it directly in vitest. Instead, test the schema SQL and query logic.

const DB_SOURCE = fs.readFileSync(path.resolve(__dirname, "../src/db.ts"), "utf-8");

function extractSchema(): string {
  const match = DB_SOURCE.match(/const SCHEMA = `([\s\S]*?)`;/);
  if (!match) throw new Error("Could not extract schema from db.ts");
  return match[1]!;
}

describe("database schema", () => {
  const schema = extractSchema();

  it("defines all expected tables", () => {
    const tables = [
      "player_profile",
      "sessions",
      "games",
      "game_stats",
      "coaching_analyses",
      "character_signature_stats",
      "training_log_entries",
      "game_review_notes",
      "conversions",
      "stock_deaths",
      "habit_instances",
    ];
    for (const table of tables) {
      expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("defines expected indexes", () => {
    expect(schema).toContain("idx_games_replay_hash");
    expect(schema).toContain("idx_games_played_at");
    expect(schema).toContain("idx_games_player_character");
    expect(schema).toContain("idx_games_opponent_character");
    expect(schema).toContain("idx_games_stage");
    expect(schema).toContain("idx_games_played_at_desc");
    expect(schema).toContain("idx_games_player_character_played_at");
    expect(schema).toContain("idx_games_opponent_connect_played_at");
    expect(schema).toContain("idx_coaching_scope_identifier_created");
  });

  it("has unique constraint on replay_hash", () => {
    expect(schema).toContain("replay_hash TEXT NOT NULL UNIQUE");
  });

  it("has check constraint on result column", () => {
    expect(schema).toContain("CHECK (result IN ('win', 'loss', 'draw'))");
  });

  it("has fail-closed analysis_status check on games", () => {
    expect(schema).toContain("analysis_status TEXT NOT NULL DEFAULT 'ok'");
    expect(schema).toContain("CHECK (analysis_status IN ('ok', 'failed', 'unavailable'))");
  });

  it("defines migration for analysis_status", () => {
    expect(DB_SOURCE).toContain('version: 15');
    expect(DB_SOURCE).toContain("Fail-closed analysis_status");
    expect(DB_SOURCE).toContain("insertFailedGameAnalysis");
    expect(DB_SOURCE).toContain("successfulReplayExists");
  });

  it("has foreign key references", () => {
    expect(schema).toContain("REFERENCES sessions(id)");
    expect(schema).toContain("REFERENCES games(id)");
  });

  it("games table has all required columns", () => {
    const requiredColumns = [
      "replay_path",
      "replay_hash",
      "stage",
      "duration_seconds",
      "player_character",
      "opponent_character",
      "player_tag",
      "opponent_tag",
      "result",
      "end_method",
      "player_final_stocks",
      "player_final_percent",
      "opponent_final_stocks",
      "opponent_final_percent",
      "game_number",
      "analysis_status",
      "analysis_error",
    ];
    for (const col of requiredColumns) {
      expect(schema).toContain(col);
    }
  });

  it("game_stats table has all stat columns", () => {
    const statColumns = [
      "neutral_wins",
      "neutral_losses",
      "neutral_win_rate",
      "openings_per_kill",
      "conversion_rate",
      "l_cancel_rate",
      "wavedash_count",
      "total_damage_taken",
      "total_damage_dealt",
      "avg_death_percent",
      "recovery_attempts",
      "recovery_success_rate",
      "ledge_entropy",
      "knockdown_entropy",
      "shield_pressure_entropy",
    ];
    for (const col of statColumns) {
      expect(schema).toContain(col);
    }
  });
});

describe("db.ts module structure", () => {
  it("exports getDb function", () => {
    expect(DB_SOURCE).toContain("export function getDb()");
  });

  it("exports closeDb function", () => {
    expect(DB_SOURCE).toContain("export function closeDb()");
  });

  it("exports paged library query support", () => {
    expect(DB_SOURCE).toContain("export function getLibraryGames");
    expect(DB_SOURCE).toContain("export interface LibraryGamesPage");
    expect(DB_SOURCE).toContain("totalUnfiltered");
    expect(DB_SOURCE).toContain("LIMIT ? OFFSET ?");
  });

  it("searches Library games through detected replay moments", () => {
    expect(DB_SOURCE).toContain("buildHighlightSearchPredicate");
    expect(DB_SOURCE).toContain("EXISTS (SELECT 1 FROM highlights hs");
    expect(DB_SOURCE).toContain("buildSignatureSearchPredicate");
    expect(DB_SOURCE).toContain("searchMatches");
  });

  it("keeps rival queries lightweight", () => {
    expect(DB_SOURCE).toContain("WITH opponent_records AS");
    expect(DB_SOURCE).toContain("characters LIKE ?");
    expect(DB_SOURCE).toContain("avgEdgeguardSuccessRate");
    expect(DB_SOURCE).toContain("LIMIT 50");
  });

  it("exports bundled trend series support", () => {
    expect(DB_SOURCE).toContain("export type TrendSeriesBundle");
    expect(DB_SOURCE).toContain("export function getTrendSeriesBundle");
    expect(DB_SOURCE).toContain("gs.neutral_win_rate as neutralWinRate");
    expect(DB_SOURCE).toContain("gs.avg_death_percent as avgDeathPercent");
  });

  it("uses WAL journal mode", () => {
    expect(DB_SOURCE).toContain("journal_mode = WAL");
  });

  it("enables foreign keys", () => {
    expect(DB_SOURCE).toContain("foreign_keys = ON");
  });

  it("has error handling on db init", () => {
    expect(DB_SOURCE).toContain("Failed to initialize database");
  });

  it("data directory is in ~/.magi-melee/", () => {
    expect(DB_SOURCE).toContain(".magi-melee");
  });

  it("day session summaries preserve each game result next to its id", () => {
    expect(DB_SOURCE).toMatch(/gameResults:\s*\{\s*id:\s*number;\s*result:\s*string;?\s*\}\s*\[\]/);
    expect(DB_SOURCE).toContain("existing.gameResults.push({ id: r.id, result: r.result });");
  });

  it("groups and loads sessions by the user's local calendar date", () => {
    expect(DB_SOURCE).toContain("date(played_at, 'localtime') as date");
    expect(DB_SOURCE).toContain("WHERE date(g.played_at, 'localtime') = ?");
  });

  it("stores Oracle exchanges and practice plans atomically", () => {
    expect(DB_SOURCE).toContain("export function appendOracleExchange");
    expect(DB_SOURCE).toMatch(/appendOracleExchange[\s\S]*?db\.transaction/);
    expect(DB_SOURCE).toMatch(/insertPracticePlan[\s\S]*?return db\.transaction/);
  });

  it("persists player context and coach notes alongside replay telemetry", () => {
    expect(DB_SOURCE).toContain("export function getPerformanceHub");
    expect(DB_SOURCE).toContain("export function createTrainingLogEntry");
    expect(DB_SOURCE).toContain("export function listGameReviewNotes");
    expect(DB_SOURCE).toContain("export function addGameReviewNote");
    expect(DB_SOURCE).toContain("idx_training_log_logged_at");
    expect(DB_SOURCE).toContain("idx_game_review_notes_game");
  });

  it("exports per-instance event insert helpers", () => {
    expect(DB_SOURCE).toContain("export function insertConversionEvents");
    expect(DB_SOURCE).toContain("export function insertStockDeaths");
    expect(DB_SOURCE).toContain("export function insertHabitInstances");
    expect(DB_SOURCE).toContain("idx_conversions_game");
    expect(DB_SOURCE).toContain("idx_stock_deaths_game");
    expect(DB_SOURCE).toContain("idx_habit_instances_lookup");
  });
});

describe("win-rate correctness", () => {
  it("has migration v7 reclassifying quit-out draws", () => {
    expect(DB_SOURCE).toContain("version: 7");
    expect(DB_SOURCE).toMatch(/WHERE result = 'draw' AND end_method IN \('LRAS', 'timeout'\)/);
    // Completed-but-winnerless games: exactly one player at 0 stocks
    expect(DB_SOURCE).toMatch(/\(\(player_final_stocks = 0\) \+ \(opponent_final_stocks = 0\)\) = 1/);
  });

  it("has migration v8 reverting sub-30s quit-outs to draws", () => {
    expect(DB_SOURCE).toContain("version: 8");
    expect(DB_SOURCE).toMatch(
      /end_method = 'LRAS'\s*\n\s*AND duration_seconds < 30\s*\n\s*AND player_final_stocks > 0 AND opponent_final_stocks > 0\s*\n\s*AND result IN \('win', 'loss'\)/,
    );
  });

  it("has migration v9 for the Performance Lab's durable data", () => {
    expect(DB_SOURCE).toContain("version: 9");
    expect(DB_SOURCE).toContain("Add training log and per-game review notes");
  });

  it("has migration v10 for per-instance event tables", () => {
    expect(DB_SOURCE).toContain("version: 10");
    expect(DB_SOURCE).toContain("Add per-instance event tables: conversions, stock_deaths, habit_instances");
  });

  it("has migration v11 for measured DI", () => {
    expect(DB_SOURCE).toContain("version: 11");
    expect(DB_SOURCE).toContain("Add measured-DI columns to stock_deaths and the throw_di table");
    expect(DB_SOURCE).toContain("export function insertThrowDIRows");
    expect(DB_SOURCE).toContain("idx_throw_di_lookup");
  });

  it("has migration v12 for recovery spans", () => {
    expect(DB_SOURCE).toContain("version: 12");
    expect(DB_SOURCE).toContain("Add recovery_spans table (recovery blueprint + edgeguard commitment)");
    expect(DB_SOURCE).toContain("export function insertRecoverySpans");
    expect(DB_SOURCE).toContain("idx_recovery_spans_lookup");
  });

  it("has migration v13 for the shield frame-gap audit", () => {
    expect(DB_SOURCE).toContain("version: 13");
    expect(DB_SOURCE).toContain("Add shield_blocks table (shield frame-gap audit)");
    expect(DB_SOURCE).toContain("export function insertShieldBlocks");
    expect(DB_SOURCE).toContain("idx_shield_blocks_lookup");
  });

  it("has migration v14 for the whiff-punish ledger", () => {
    expect(DB_SOURCE).toContain("version: 14");
    expect(DB_SOURCE).toContain("Add whiff_events table (whiff-punish ledger)");
    expect(DB_SOURCE).toContain("export function insertWhiffEvents");
    expect(DB_SOURCE).toContain("idx_whiff_events_lookup");
  });

  it("supports event backfill: candidate query + per-game row deletion", () => {
    expect(DB_SOURCE).toContain("export function getBackfillCandidates");
    expect(DB_SOURCE).toContain("export function deleteFrameEventRows");
    // The marker table for "already backfilled" must be stock_deaths — every
    // parsed game writes stock records, so absence reliably means missing.
    expect(DB_SOURCE).toContain("WHERE NOT EXISTS (SELECT 1 FROM stock_deaths sd WHERE sd.game_id = g.id)");

    const BACKFILL_SOURCE = fs.readFileSync(path.resolve(__dirname, "../src/backfill.ts"), "utf-8");
    // Rows are replaced atomically and files re-hashed before attribution.
    expect(BACKFILL_SOURCE).toContain("deleteFrameEventRows(candidate.id)");
    expect(BACKFILL_SOURCE).toContain("persistFrameEvents(candidate.id");
    expect(BACKFILL_SOURCE).toContain("hash !== candidate.replayHash");
  });

  it("never divides win rate by total games (draws must not count as losses)", () => {
    // Every SQL winRate must use the decisive-games denominator
    expect(DB_SOURCE).not.toMatch(/AS REAL\) \/ COUNT\(\*\)/);
    expect(DB_SOURCE).not.toContain("stats.wins / stats.gamesPlayed");
  });

  it("dashboard highlight rankings gate on decisive games", () => {
    expect(DB_SOURCE).not.toContain("HAVING COUNT(*) >= 3");
    expect(DB_SOURCE).toContain("HAVING SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END) >= 3");
  });

  it("library summary exposes losses separately from draws", () => {
    expect(DB_SOURCE).toMatch(
      /SUM\(CASE WHEN g\.analysis_status = 'ok' AND g\.result = 'loss' THEN 1 ELSE 0 END\) as losses/,
    );
    expect(DB_SOURCE).toMatch(
      /SUM\(CASE WHEN g\.analysis_status = 'ok' AND g\.result = 'win' THEN 1 ELSE 0 END\) as wins/,
    );
  });
});
