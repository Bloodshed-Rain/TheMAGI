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
  });

  it("has unique constraint on replay_hash", () => {
    expect(schema).toContain("replay_hash TEXT NOT NULL UNIQUE");
  });

  it("has check constraint on result column", () => {
    expect(schema).toContain("CHECK (result IN ('win', 'loss', 'draw'))");
  });

  it("has foreign key references", () => {
    expect(schema).toContain("REFERENCES sessions(id)");
    expect(schema).toContain("REFERENCES games(id)");
  });

  it("games table has all required columns", () => {
    const requiredColumns = [
      "replay_path", "replay_hash", "stage", "duration_seconds",
      "player_character", "opponent_character", "player_tag", "opponent_tag",
      "result", "end_method", "player_final_stocks", "player_final_percent",
      "opponent_final_stocks", "opponent_final_percent", "game_number",
    ];
    for (const col of requiredColumns) {
      expect(schema).toContain(col);
    }
  });

  it("game_stats table has all stat columns", () => {
    const statColumns = [
      "neutral_wins", "neutral_losses", "neutral_win_rate",
      "openings_per_kill", "conversion_rate", "l_cancel_rate",
      "wavedash_count", "total_damage_taken", "total_damage_dealt",
      "avg_death_percent", "recovery_attempts", "recovery_success_rate",
      "ledge_entropy", "knockdown_entropy", "shield_pressure_entropy",
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

  it("uses WAL journal mode", () => {
    expect(DB_SOURCE).toContain('journal_mode = WAL');
  });

  it("enables foreign keys", () => {
    expect(DB_SOURCE).toContain('foreign_keys = ON');
  });

  it("has error handling on db init", () => {
    expect(DB_SOURCE).toContain("Failed to initialize database");
  });

  it("data directory is in ~/.magi-melee/", () => {
    expect(DB_SOURCE).toContain(".magi-melee");
  });
});
