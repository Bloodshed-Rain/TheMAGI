import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import type { AggregateStats, PlayerHistory } from "./pipeline/index.js";

// ── Database path ────────────────────────────────────────────────────

const DATA_DIR = path.join(os.homedir(), ".magi-melee");
const DB_PATH = path.join(DATA_DIR, "magi.db");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ── Schema ───────────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS player_profile (
    id INTEGER PRIMARY KEY,
    connect_code TEXT,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    games_played INTEGER NOT NULL DEFAULT 0,
    games_won INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id),
    replay_path TEXT NOT NULL,
    replay_hash TEXT NOT NULL UNIQUE,
    played_at TEXT,
    stage TEXT NOT NULL,
    duration_seconds REAL NOT NULL,
    player_character TEXT NOT NULL,
    opponent_character TEXT NOT NULL,
    player_tag TEXT NOT NULL,
    player_connect_code TEXT,
    opponent_tag TEXT NOT NULL,
    opponent_connect_code TEXT,
    result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
    end_method TEXT NOT NULL,
    player_final_stocks INTEGER NOT NULL,
    player_final_percent INTEGER NOT NULL,
    opponent_final_stocks INTEGER NOT NULL,
    opponent_final_percent INTEGER NOT NULL,
    game_number INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS game_stats (
    game_id INTEGER PRIMARY KEY REFERENCES games(id),
    neutral_wins INTEGER NOT NULL,
    neutral_losses INTEGER NOT NULL,
    neutral_win_rate REAL NOT NULL,
    counter_hits INTEGER NOT NULL,
    openings_per_kill REAL NOT NULL,
    total_openings INTEGER NOT NULL,
    total_conversions INTEGER NOT NULL,
    conversion_rate REAL NOT NULL,
    avg_damage_per_opening REAL NOT NULL,
    kill_conversions INTEGER NOT NULL,
    l_cancel_rate REAL NOT NULL,
    wavedash_count INTEGER NOT NULL,
    dash_dance_frames INTEGER NOT NULL,
    avg_stage_position_x REAL NOT NULL,
    time_on_platform REAL NOT NULL,
    time_in_air REAL NOT NULL,
    time_at_ledge REAL NOT NULL,
    total_damage_taken REAL NOT NULL,
    total_damage_dealt REAL NOT NULL,
    avg_death_percent REAL NOT NULL,
    recovery_attempts INTEGER NOT NULL,
    recovery_success_rate REAL NOT NULL,
    ledge_entropy REAL NOT NULL,
    knockdown_entropy REAL NOT NULL,
    shield_pressure_entropy REAL NOT NULL,
    power_shield_count INTEGER NOT NULL DEFAULT 0,
    edgeguard_attempts INTEGER NOT NULL DEFAULT 0,
    edgeguard_success_rate REAL NOT NULL DEFAULT 0,
    shield_pressure_sequences INTEGER NOT NULL DEFAULT 0,
    shield_pressure_avg_damage REAL NOT NULL DEFAULT 0,
    shield_breaks INTEGER NOT NULL DEFAULT 0,
    shield_poke_rate REAL NOT NULL DEFAULT 0,
    di_survival_score REAL NOT NULL DEFAULT 0.5,
    di_combo_score REAL NOT NULL DEFAULT 0.5,
    di_avg_combo_length_received REAL NOT NULL DEFAULT 0,
    di_avg_combo_length_dealt REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS coaching_analyses (
    id INTEGER PRIMARY KEY,
    game_id INTEGER REFERENCES games(id),
    session_id INTEGER REFERENCES sessions(id),
    model_used TEXT NOT NULL,
    analysis_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_games_replay_hash ON games(replay_hash);
  CREATE INDEX IF NOT EXISTS idx_games_session_id ON games(session_id);
  CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at);
  CREATE INDEX IF NOT EXISTS idx_games_player_character ON games(player_character);
  CREATE INDEX IF NOT EXISTS idx_games_opponent_character ON games(opponent_character);
  CREATE INDEX IF NOT EXISTS idx_games_opponent_tag ON games(opponent_tag);
  CREATE INDEX IF NOT EXISTS idx_games_stage ON games(stage);

  CREATE TABLE IF NOT EXISTS character_signature_stats (
    game_id INTEGER PRIMARY KEY REFERENCES games(id),
    signature_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS highlights (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id),
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    character TEXT NOT NULL,
    victim TEXT NOT NULL,
    start_frame INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    damage INTEGER NOT NULL DEFAULT 0,
    start_percent INTEGER NOT NULL DEFAULT 0,
    did_kill INTEGER NOT NULL DEFAULT 0,
    moves_json TEXT NOT NULL DEFAULT '[]',
    stock_number INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_highlights_game_id ON highlights(game_id);
  CREATE INDEX IF NOT EXISTS idx_highlights_type ON highlights(type);
`;

// ── Migration system ─────────────────────────────────────────────────

interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

/**
 * Versioned migrations array. Each migration runs exactly once.
 * Migrations must be idempotent — they check before altering.
 * Never remove or reorder existing migrations; only append new ones.
 */
const migrations: Migration[] = [
  {
    version: 1,
    description: "Add power_shield_count to game_stats",
    up: (db) => {
      const columns = db.pragma("table_info(game_stats)") as { name: string }[];
      if (!columns.some((c) => c.name === "power_shield_count")) {
        db.exec("ALTER TABLE game_stats ADD COLUMN power_shield_count INTEGER NOT NULL DEFAULT 0");
      }
    },
  },
  {
    version: 2,
    description: "Add edgeguard_attempts and edgeguard_success_rate to game_stats",
    up: (db) => {
      const columns = db.pragma("table_info(game_stats)") as { name: string }[];
      if (!columns.some((c) => c.name === "edgeguard_attempts")) {
        db.exec("ALTER TABLE game_stats ADD COLUMN edgeguard_attempts INTEGER NOT NULL DEFAULT 0");
        db.exec("ALTER TABLE game_stats ADD COLUMN edgeguard_success_rate REAL NOT NULL DEFAULT 0");
      }
    },
  },
  {
    version: 3,
    description: "Add shield pressure and DI quality columns to game_stats",
    up: (db) => {
      const columns = db.pragma("table_info(game_stats)") as { name: string }[];
      if (!columns.some((c) => c.name === "shield_pressure_sequences")) {
        db.exec("ALTER TABLE game_stats ADD COLUMN shield_pressure_sequences INTEGER NOT NULL DEFAULT 0");
        db.exec("ALTER TABLE game_stats ADD COLUMN shield_pressure_avg_damage REAL NOT NULL DEFAULT 0");
        db.exec("ALTER TABLE game_stats ADD COLUMN shield_breaks INTEGER NOT NULL DEFAULT 0");
        db.exec("ALTER TABLE game_stats ADD COLUMN shield_poke_rate REAL NOT NULL DEFAULT 0");
        db.exec("ALTER TABLE game_stats ADD COLUMN di_survival_score REAL NOT NULL DEFAULT 0.5");
        db.exec("ALTER TABLE game_stats ADD COLUMN di_combo_score REAL NOT NULL DEFAULT 0.5");
        db.exec("ALTER TABLE game_stats ADD COLUMN di_avg_combo_length_received REAL NOT NULL DEFAULT 0");
        db.exec("ALTER TABLE game_stats ADD COLUMN di_avg_combo_length_dealt REAL NOT NULL DEFAULT 0");
      }
    },
  },
  {
    version: 4,
    description: "Add scope, scope_identifier, title columns to coaching_analyses",
    up: (db) => {
      const columns = db.pragma("table_info(coaching_analyses)") as { name: string }[];
      if (!columns.some((c) => c.name === "scope")) {
        db.exec("ALTER TABLE coaching_analyses ADD COLUMN scope TEXT NOT NULL DEFAULT 'game'");
        db.exec("ALTER TABLE coaching_analyses ADD COLUMN scope_identifier TEXT");
        db.exec("ALTER TABLE coaching_analyses ADD COLUMN title TEXT");
      }
    },
  },
  {
    version: 5,
    description: "Add highlights table for game highlight detection",
    up: (db) => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='highlights'").get();
      if (!tables) {
        db.exec(`
          CREATE TABLE highlights (
            id INTEGER PRIMARY KEY,
            game_id INTEGER NOT NULL REFERENCES games(id),
            type TEXT NOT NULL,
            label TEXT NOT NULL,
            description TEXT NOT NULL,
            character TEXT NOT NULL,
            victim TEXT NOT NULL,
            start_frame INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            damage INTEGER NOT NULL DEFAULT 0,
            start_percent INTEGER NOT NULL DEFAULT 0,
            did_kill INTEGER NOT NULL DEFAULT 0,
            moves_json TEXT NOT NULL DEFAULT '[]',
            stock_number INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE INDEX idx_highlights_game_id ON highlights(game_id);
          CREATE INDEX idx_highlights_type ON highlights(type);
        `);
      }
    },
  },
  {
    version: 6,
    description: "Add session_reports, oracle_messages, practice_plans, practice_drills tables",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS session_reports (
          id INTEGER PRIMARY KEY,
          date TEXT NOT NULL UNIQUE,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS oracle_messages (
          id INTEGER PRIMARY KEY,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS practice_plans (
          id INTEGER PRIMARY KEY,
          player_profile_id INTEGER,
          name TEXT NOT NULL,
          weakness_summary TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS practice_drills (
          id INTEGER PRIMARY KEY,
          plan_id INTEGER NOT NULL REFERENCES practice_plans(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          target TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_drills_plan ON practice_drills(plan_id);
        CREATE INDEX IF NOT EXISTS idx_oracle_created ON oracle_messages(created_at);
      `);
    },
  },
];

/**
 * Ensure the schema_version table exists and return current version.
 * Returns 0 for brand new databases (no migrations have run yet).
 */
function getSchemaVersion(db: Database.Database): number {
  // Create the version tracking table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const row = db.prepare("SELECT version FROM schema_version WHERE id = 1").get() as { version: number } | undefined;

  if (!row) {
    // First run — determine starting version by inspecting existing state.
    // If the ad-hoc columns already exist, we know those migrations were
    // effectively applied before we had the version table.
    let startVersion = 0;
    const columns = db.pragma("table_info(game_stats)") as { name: string }[];
    if (columns.some((c) => c.name === "edgeguard_attempts")) {
      startVersion = 2;
    } else if (columns.some((c) => c.name === "power_shield_count")) {
      startVersion = 1;
    }
    db.prepare("INSERT INTO schema_version (id, version) VALUES (1, ?)").run(startVersion);
    return startVersion;
  }

  return row.version;
}

function setSchemaVersion(db: Database.Database, version: number): void {
  db.prepare("UPDATE schema_version SET version = ?, updated_at = datetime('now') WHERE id = 1").run(version);
}

/**
 * Run all pending migrations in a single transaction.
 * Each migration's version must be strictly greater than the current version.
 */
function runMigrations(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db);

  const pending = migrations.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version);

  if (pending.length === 0) return;

  const migrate = db.transaction(() => {
    for (const migration of pending) {
      console.log(`[db] Running migration v${migration.version}: ${migration.description}`);
      migration.up(db);
      setSchemaVersion(db, migration.version);
    }
  });

  migrate();
  const lastPending = pending[pending.length - 1];
  if (lastPending) console.log(`[db] Migrations complete. Schema version: ${lastPending.version}`);
}

// ── Database instance ────────────────────────────────────────────────

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    ensureDataDir();
    try {
      db = new Database(DB_PATH);
      db.pragma("journal_mode = WAL");
      db.pragma("busy_timeout = 5000");
      db.pragma("foreign_keys = ON");
      db.exec(SCHEMA);
      runMigrations(db);
    } catch (err) {
      db = null;
      throw new Error(
        `Failed to initialize database at ${DB_PATH}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    try {
      db.close();
    } catch {
      // Ignore close errors during shutdown
    }
    db = null;
  }
}

// ── Queries ──────────────────────────────────────────────────────────

export function replayExists(hash: string): boolean {
  const row = getDb().prepare("SELECT 1 FROM games WHERE replay_hash = ?").get(hash);
  return row !== undefined;
}

export interface InsertGameParams {
  sessionId: number | null;
  replayPath: string;
  replayHash: string;
  playedAt: string | null;
  stage: string;
  durationSeconds: number;
  playerCharacter: string;
  opponentCharacter: string;
  playerTag: string;
  playerConnectCode: string | null;
  opponentTag: string;
  opponentConnectCode: string | null;
  result: "win" | "loss" | "draw";
  endMethod: string;
  playerFinalStocks: number;
  playerFinalPercent: number;
  opponentFinalStocks: number;
  opponentFinalPercent: number;
  gameNumber: number;
}

export function insertGame(params: InsertGameParams): number {
  const stmt = getDb().prepare(`
    INSERT INTO games (
      session_id, replay_path, replay_hash, played_at,
      stage, duration_seconds,
      player_character, opponent_character,
      player_tag, player_connect_code, opponent_tag, opponent_connect_code,
      result, end_method,
      player_final_stocks, player_final_percent,
      opponent_final_stocks, opponent_final_percent,
      game_number
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?
    )
  `);

  const result = stmt.run(
    params.sessionId,
    params.replayPath,
    params.replayHash,
    params.playedAt,
    params.stage,
    params.durationSeconds,
    params.playerCharacter,
    params.opponentCharacter,
    params.playerTag,
    params.playerConnectCode,
    params.opponentTag,
    params.opponentConnectCode,
    params.result,
    params.endMethod,
    params.playerFinalStocks,
    params.playerFinalPercent,
    params.opponentFinalStocks,
    params.opponentFinalPercent,
    params.gameNumber,
  );

  return Number(result.lastInsertRowid);
}

export interface InsertGameStatsParams {
  gameId: number;
  neutralWins: number;
  neutralLosses: number;
  neutralWinRate: number;
  counterHits: number;
  openingsPerKill: number;
  totalOpenings: number;
  totalConversions: number;
  conversionRate: number;
  avgDamagePerOpening: number;
  killConversions: number;
  lCancelRate: number;
  wavedashCount: number;
  dashDanceFrames: number;
  avgStagePositionX: number;
  timeOnPlatform: number;
  timeInAir: number;
  timeAtLedge: number;
  totalDamageTaken: number;
  totalDamageDealt: number;
  avgDeathPercent: number;
  recoveryAttempts: number;
  recoverySuccessRate: number;
  ledgeEntropy: number;
  knockdownEntropy: number;
  shieldPressureEntropy: number;
  powerShieldCount: number;
  edgeguardAttempts: number;
  edgeguardSuccessRate: number;
  shieldPressureSequences: number;
  shieldPressureAvgDamage: number;
  shieldBreaks: number;
  shieldPokeRate: number;
  diSurvivalScore: number;
  diComboScore: number;
  diAvgComboLengthReceived: number;
  diAvgComboLengthDealt: number;
}

export function insertGameStats(params: InsertGameStatsParams): void {
  const stmt = getDb().prepare(`
    INSERT INTO game_stats (
      game_id,
      neutral_wins, neutral_losses, neutral_win_rate, counter_hits,
      openings_per_kill, total_openings, total_conversions, conversion_rate,
      avg_damage_per_opening, kill_conversions,
      l_cancel_rate, wavedash_count, dash_dance_frames,
      avg_stage_position_x, time_on_platform, time_in_air, time_at_ledge,
      total_damage_taken, total_damage_dealt, avg_death_percent,
      recovery_attempts, recovery_success_rate,
      ledge_entropy, knockdown_entropy, shield_pressure_entropy,
      power_shield_count,
      edgeguard_attempts, edgeguard_success_rate,
      shield_pressure_sequences, shield_pressure_avg_damage,
      shield_breaks, shield_poke_rate,
      di_survival_score, di_combo_score,
      di_avg_combo_length_received, di_avg_combo_length_dealt
    ) VALUES (
      ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?
    )
  `);

  stmt.run(
    params.gameId,
    params.neutralWins,
    params.neutralLosses,
    params.neutralWinRate,
    params.counterHits,
    params.openingsPerKill,
    params.totalOpenings,
    params.totalConversions,
    params.conversionRate,
    params.avgDamagePerOpening,
    params.killConversions,
    params.lCancelRate,
    params.wavedashCount,
    params.dashDanceFrames,
    params.avgStagePositionX,
    params.timeOnPlatform,
    params.timeInAir,
    params.timeAtLedge,
    params.totalDamageTaken,
    params.totalDamageDealt,
    params.avgDeathPercent,
    params.recoveryAttempts,
    params.recoverySuccessRate,
    params.ledgeEntropy,
    params.knockdownEntropy,
    params.shieldPressureEntropy,
    params.powerShieldCount,
    params.edgeguardAttempts,
    params.edgeguardSuccessRate,
    params.shieldPressureSequences,
    params.shieldPressureAvgDamage,
    params.shieldBreaks,
    params.shieldPokeRate,
    params.diSurvivalScore,
    params.diComboScore,
    params.diAvgComboLengthReceived,
    params.diAvgComboLengthDealt,
  );
}

export function insertCoachingAnalysis(
  gameId: number | null,
  sessionId: number | null,
  modelUsed: string,
  analysisText: string,
  scope?: string,
  scopeIdentifier?: string,
  title?: string,
): number {
  const stmt = getDb().prepare(`
    INSERT INTO coaching_analyses (game_id, session_id, model_used, analysis_text, scope, scope_identifier, title)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    gameId,
    sessionId,
    modelUsed,
    analysisText,
    scope ?? "game",
    scopeIdentifier ?? null,
    title ?? null,
  );
  return Number(result.lastInsertRowid);
}

// ── Analysis history ────────────────────────────────────────────────

export interface AnalysisHistoryEntry {
  id: number;
  gameId: number | null;
  sessionId: number | null;
  scope: string;
  scopeIdentifier: string | null;
  title: string | null;
  modelUsed: string;
  analysisText: string;
  createdAt: string;
  playerCharacter: string | null;
  opponentCharacter: string | null;
  opponentTag: string | null;
  stage: string | null;
  result: string | null;
}

export function getAnalysisHistory(
  limit: number = 20,
  offset: number = 0,
  scopeFilter?: string,
): AnalysisHistoryEntry[] {
  const where = scopeFilter ? "WHERE ca.scope = ?" : "";
  const params = scopeFilter ? [scopeFilter, limit, offset] : [limit, offset];

  return getDb()
    .prepare(
      `
    SELECT
      ca.id, ca.game_id as gameId, ca.session_id as sessionId,
      ca.scope, ca.scope_identifier as scopeIdentifier,
      ca.title, ca.model_used as modelUsed,
      ca.analysis_text as analysisText, ca.created_at as createdAt,
      g.player_character as playerCharacter,
      g.opponent_character as opponentCharacter,
      g.opponent_tag as opponentTag,
      g.stage, g.result
    FROM coaching_analyses ca
    LEFT JOIN games g ON ca.game_id = g.id
    ${where}
    ORDER BY ca.created_at DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(...params) as AnalysisHistoryEntry[];
}

// ── Session management ───────────────────────────────────────────────

export function createSession(startedAt: string): number {
  const stmt = getDb().prepare("INSERT INTO sessions (started_at) VALUES (?)");
  const result = stmt.run(startedAt);
  return Number(result.lastInsertRowid);
}

export function updateSession(sessionId: number, endedAt: string, gamesPlayed: number, gamesWon: number): void {
  getDb()
    .prepare(
      `
    UPDATE sessions SET ended_at = ?, games_played = ?, games_won = ? WHERE id = ?
  `,
    )
    .run(endedAt, gamesPlayed, gamesWon, sessionId);
}

// ── Trend queries ────────────────────────────────────────────────────

export interface TrendPoint {
  playedAt: string;
  value: number;
}

export interface AggregateStatsParams {
  character?: string;
  opponentCharacter?: string;
  stage?: string;
  opponentKey?: string;
}

/**
 * Retrieve aggregate stats across a filtered scope.
 */
export function getAggregateStats(filters: AggregateStatsParams): AggregateStats | null {
  const db = getDb();
  const conditions: string[] = [];
  const params: string[] = [];

  if (filters.character) {
    conditions.push("g.player_character = ?");
    params.push(filters.character);
  }
  if (filters.opponentCharacter) {
    conditions.push("g.opponent_character = ?");
    params.push(filters.opponentCharacter);
  }
  if (filters.stage) {
    conditions.push("g.stage = ?");
    params.push(filters.stage);
  }
  if (filters.opponentKey) {
    conditions.push("(g.opponent_tag = ? OR g.opponent_connect_code = ?)");
    params.push(filters.opponentKey, filters.opponentKey);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  // 1. Core aggregates
  const stats = db
    .prepare(
      `
    SELECT
      COUNT(*) as gamesPlayed,
      SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      ROUND(AVG(gs.neutral_win_rate), 4) as avgNeutralWinRate,
      ROUND(AVG(gs.conversion_rate), 4) as avgConversionRate,
      ROUND(AVG(gs.l_cancel_rate), 4) as avgLCancelRate,
      ROUND(AVG(gs.openings_per_kill), 2) as avgOpeningsPerKill,
      ROUND(AVG(gs.avg_damage_per_opening), 2) as avgDamagePerOpening,
      ROUND(AVG(gs.avg_death_percent), 0) as avgDeathPercent,
      ROUND(AVG(gs.recovery_success_rate), 4) as avgRecoverySuccessRate,
      ROUND(AVG(gs.edgeguard_success_rate), 4) as avgEdgeguardSuccessRate,
      ROUND(AVG(gs.power_shield_count), 2) as avgPowerShieldCount,
      ROUND(AVG(gs.shield_pressure_sequences), 2) as avgShieldPressureSequences,
      ROUND(AVG(gs.shield_pressure_avg_damage), 2) as avgShieldPressureDamage,
      ROUND(AVG(gs.shield_poke_rate), 4) as avgShieldPokeRate,
      ROUND(AVG(gs.di_survival_score), 4) as avgDISurvivalScore,
      ROUND(AVG(gs.di_combo_score), 4) as avgDIComboScore
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    ${where}
  `,
    )
    .get(...params) as any;

  if (!stats || stats.gamesPlayed === 0) return null;

  // 2. Distributions
  const characterDistribution = db
    .prepare(
      `
    SELECT player_character as character, COUNT(*) as count
    FROM games g ${where}
    GROUP BY player_character ORDER BY count DESC
  `,
    )
    .all(...params) as { character: string; count: number }[];

  const opponentDistribution = db
    .prepare(
      `
    SELECT opponent_tag as opponentTag, COUNT(*) as count
    FROM games g ${where}
    GROUP BY opponent_tag ORDER BY count DESC
  `,
    )
    .all(...params) as { opponentTag: string; count: number }[];

  const stageDistribution = db
    .prepare(
      `
    SELECT stage, COUNT(*) as count
    FROM games g ${where}
    GROUP BY stage ORDER BY count DESC
  `,
    )
    .all(...params) as { stage: string; count: number }[];

  // 3. Signature aggregates (if character filtered)
  let signatureAggregates: any = null;
  if (filters.character) {
    signatureAggregates = getCharacterSignatureAggregates(filters.character);
    // Average them? For now we just return the list of JSONs or a summary
    // Let's just return the list, the prompt assembly can handle it.
  }

  return {
    ...stats,
    winRate: stats.gamesPlayed > 0 ? stats.wins / stats.gamesPlayed : 0,
    characterDistribution,
    opponentDistribution,
    stageDistribution,
    signatureAggregates,
  };
}

export function getCharacterSignatureAggregates(character: string): any[] {
  return getDb()
    .prepare(
      `
    SELECT css.signature_json
    FROM character_signature_stats css
    JOIN games g ON g.id = css.game_id
    WHERE g.player_character = ?
  `,
    )
    .all(character)
    .map((row: any) => JSON.parse(row.signature_json));
}

export function getGamesBySession(sessionId: number): { id: number; replay_path: string }[] {
  return getDb()
    .prepare(
      `
    SELECT id, replay_path FROM games
    WHERE session_id = ?
    ORDER BY game_number ASC
  `,
    )
    .all(sessionId) as { id: number; replay_path: string }[];
}

export function getGameById(gameId: number): { id: number; replay_path: string; player_tag: string } | undefined {
  return getDb()
    .prepare(
      `
    SELECT id, replay_path, player_tag FROM games
    WHERE id = ?
  `,
    )
    .get(gameId) as { id: number; replay_path: string; player_tag: string } | undefined;
}

// ── Full game detail ──────────────────────────────────────────────

export interface GameDetail {
  id: number;
  replayPath: string;
  playedAt: string | null;
  stage: string;
  durationSeconds: number;
  playerCharacter: string;
  opponentCharacter: string;
  playerTag: string;
  playerConnectCode: string | null;
  opponentTag: string;
  opponentConnectCode: string | null;
  result: string;
  endMethod: string;
  playerFinalStocks: number;
  playerFinalPercent: number;
  opponentFinalStocks: number;
  opponentFinalPercent: number;
  // game_stats
  neutralWins: number;
  neutralLosses: number;
  neutralWinRate: number;
  counterHits: number;
  openingsPerKill: number;
  totalOpenings: number;
  totalConversions: number;
  conversionRate: number;
  avgDamagePerOpening: number;
  killConversions: number;
  lCancelRate: number;
  wavedashCount: number;
  dashDanceFrames: number;
  avgStagePositionX: number;
  timeOnPlatform: number;
  timeInAir: number;
  timeAtLedge: number;
  totalDamageTaken: number;
  totalDamageDealt: number;
  avgDeathPercent: number;
  recoveryAttempts: number;
  recoverySuccessRate: number;
  ledgeEntropy: number;
  knockdownEntropy: number;
  shieldPressureEntropy: number;
  powerShieldCount: number;
  edgeguardAttempts: number;
  edgeguardSuccessRate: number;
  shieldPressureSequences: number;
  shieldPressureAvgDamage: number;
  shieldBreaks: number;
  shieldPokeRate: number;
  diSurvivalScore: number;
  diComboScore: number;
  diAvgComboLengthReceived: number;
  diAvgComboLengthDealt: number;
  // signature stats
  signatureJson: string | null;
  // coaching
  coachingAnalyses: GameCoachingEntry[];
}

export interface GameCoachingEntry {
  id: number;
  modelUsed: string;
  analysisText: string;
  createdAt: string;
  scope: string;
  title: string | null;
}

export function getGameDetail(gameId: number): GameDetail | undefined {
  const row = getDb()
    .prepare(
      `
    SELECT
      g.id, g.replay_path as replayPath,
      g.played_at as playedAt, g.stage,
      g.duration_seconds as durationSeconds,
      g.player_character as playerCharacter,
      g.opponent_character as opponentCharacter,
      g.player_tag as playerTag,
      g.player_connect_code as playerConnectCode,
      g.opponent_tag as opponentTag,
      g.opponent_connect_code as opponentConnectCode,
      g.result, g.end_method as endMethod,
      g.player_final_stocks as playerFinalStocks,
      g.player_final_percent as playerFinalPercent,
      g.opponent_final_stocks as opponentFinalStocks,
      g.opponent_final_percent as opponentFinalPercent,
      gs.neutral_wins as neutralWins,
      gs.neutral_losses as neutralLosses,
      gs.neutral_win_rate as neutralWinRate,
      gs.counter_hits as counterHits,
      gs.openings_per_kill as openingsPerKill,
      gs.total_openings as totalOpenings,
      gs.total_conversions as totalConversions,
      gs.conversion_rate as conversionRate,
      gs.avg_damage_per_opening as avgDamagePerOpening,
      gs.kill_conversions as killConversions,
      gs.l_cancel_rate as lCancelRate,
      gs.wavedash_count as wavedashCount,
      gs.dash_dance_frames as dashDanceFrames,
      gs.avg_stage_position_x as avgStagePositionX,
      gs.time_on_platform as timeOnPlatform,
      gs.time_in_air as timeInAir,
      gs.time_at_ledge as timeAtLedge,
      gs.total_damage_taken as totalDamageTaken,
      gs.total_damage_dealt as totalDamageDealt,
      gs.avg_death_percent as avgDeathPercent,
      gs.recovery_attempts as recoveryAttempts,
      gs.recovery_success_rate as recoverySuccessRate,
      gs.ledge_entropy as ledgeEntropy,
      gs.knockdown_entropy as knockdownEntropy,
      gs.shield_pressure_entropy as shieldPressureEntropy,
      gs.power_shield_count as powerShieldCount,
      gs.edgeguard_attempts as edgeguardAttempts,
      gs.edgeguard_success_rate as edgeguardSuccessRate,
      gs.shield_pressure_sequences as shieldPressureSequences,
      gs.shield_pressure_avg_damage as shieldPressureAvgDamage,
      gs.shield_breaks as shieldBreaks,
      gs.shield_poke_rate as shieldPokeRate,
      gs.di_survival_score as diSurvivalScore,
      gs.di_combo_score as diComboScore,
      gs.di_avg_combo_length_received as diAvgComboLengthReceived,
      gs.di_avg_combo_length_dealt as diAvgComboLengthDealt,
      css.signature_json as signatureJson
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    LEFT JOIN character_signature_stats css ON css.game_id = g.id
    WHERE g.id = ?
  `,
    )
    .get(gameId) as (Omit<GameDetail, "coachingAnalyses"> & { signatureJson: string | null }) | undefined;

  if (!row) return undefined;

  const analyses = getDb()
    .prepare(
      `
    SELECT id, model_used as modelUsed, analysis_text as analysisText,
           created_at as createdAt, scope, title
    FROM coaching_analyses
    WHERE game_id = ?
    ORDER BY created_at DESC
  `,
    )
    .all(gameId) as GameCoachingEntry[];

  return { ...row, coachingAnalyses: analyses };
}

/** Row shape returned by the deep insights SQL query */
interface DeepInsightsRow {
  neutral_win_rate: number;
  l_cancel_rate: number;
  conversion_rate: number;
  openings_per_kill: number;
  avg_damage_per_opening: number;
  recovery_success_rate: number;
  edgeguard_success_rate: number;
  power_shield_count: number;
  wavedash_count: number;
  shield_pressure_sequences: number;
  shield_pressure_avg_damage: number;
  shield_poke_rate: number;
  di_survival_score: number;
  di_combo_score: number;
  avg_death_percent: number;
  total_damage_dealt: number;
  ledge_entropy: number;
  knockdown_entropy: number;
  shield_pressure_entropy: number;
  duration_seconds: number;
  is_win: number;
}

/** Deep insights data for AI pattern recognition */
export interface DeepInsightsData {
  correlations: { metricA: string; metricB: string; coefficient: number }[];
  situationalAverages: {
    label: string;
    metrics: Record<string, number>;
  }[];
  winLossDiffs: Record<string, number>;
}

export function getDeepInsightsData(): DeepInsightsData {
  const db = getDb();

  // 1. Fetch raw data — pull all meaningful stat columns for pairwise correlation
  const rows = db
    .prepare(
      `
    SELECT
      gs.neutral_win_rate, gs.l_cancel_rate, gs.conversion_rate,
      gs.openings_per_kill, gs.avg_damage_per_opening,
      gs.recovery_success_rate, gs.edgeguard_success_rate,
      gs.power_shield_count, gs.wavedash_count,
      gs.shield_pressure_sequences, gs.shield_pressure_avg_damage, gs.shield_poke_rate,
      gs.di_survival_score, gs.di_combo_score,
      gs.avg_death_percent, gs.total_damage_dealt,
      gs.ledge_entropy, gs.knockdown_entropy, gs.shield_pressure_entropy,
      g.duration_seconds,
      CASE WHEN g.result = 'win' THEN 1 ELSE 0 END as is_win
    FROM game_stats gs
    JOIN games g ON gs.game_id = g.id
  `,
    )
    .all() as DeepInsightsRow[];

  if (rows.length < 5) {
    throw new Error("Insufficient data for deep pattern analysis (minimum 5 games required).");
  }

  // Metric definitions: typed key → human-readable label
  const metricDefs: { key: keyof DeepInsightsRow; label: string }[] = [
    { key: "neutral_win_rate", label: "Neutral Win Rate" },
    { key: "l_cancel_rate", label: "L-Cancel Rate" },
    { key: "conversion_rate", label: "Conversion Rate" },
    { key: "openings_per_kill", label: "Openings/Kill" },
    { key: "avg_damage_per_opening", label: "Avg Damage/Opening" },
    { key: "recovery_success_rate", label: "Recovery Success" },
    { key: "edgeguard_success_rate", label: "Edgeguard Success" },
    { key: "power_shield_count", label: "Power Shields" },
    { key: "wavedash_count", label: "Wavedash Count" },
    { key: "shield_pressure_sequences", label: "Shield Pressure Sequences" },
    { key: "shield_pressure_avg_damage", label: "Shield Pressure Damage" },
    { key: "shield_poke_rate", label: "Shield Poke Rate" },
    { key: "di_survival_score", label: "Survival DI" },
    { key: "di_combo_score", label: "Combo DI" },
    { key: "avg_death_percent", label: "Avg Death %" },
    { key: "total_damage_dealt", label: "Total Damage Dealt" },
    { key: "ledge_entropy", label: "Ledge Option Entropy" },
    { key: "knockdown_entropy", label: "Knockdown Option Entropy" },
    { key: "shield_pressure_entropy", label: "Shield Pressure Entropy" },
    { key: "duration_seconds", label: "Game Duration" },
    { key: "is_win", label: "Win/Loss" },
  ];

  const metricKeys = metricDefs.map((m) => m.key);
  const keyToLabel = new Map(metricDefs.map((m) => [m.key, m.label]));

  const calculatePearson = (
    data: DeepInsightsRow[],
    keyA: keyof DeepInsightsRow,
    keyB: keyof DeepInsightsRow,
  ): number => {
    const n = data.length;
    let sumA = 0,
      sumB = 0,
      sumAB = 0,
      sumA2 = 0,
      sumB2 = 0;
    for (const row of data) {
      const a = row[keyA];
      const b = row[keyB];
      sumA += a;
      sumB += b;
      sumAB += a * b;
      sumA2 += a * a;
      sumB2 += b * b;
    }
    const num = n * sumAB - sumA * sumB;
    const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
    return den === 0 ? 0 : num / den;
  };

  // Run ALL pairwise correlations, keep those with |r| >= 0.15 (weak+ signal)
  const allCorrelations: { metricA: string; metricB: string; coefficient: number }[] = [];
  for (let i = 0; i < metricDefs.length; i++) {
    const defA = metricDefs[i];
    if (!defA) continue;
    for (let j = i + 1; j < metricDefs.length; j++) {
      const defB = metricDefs[j];
      if (!defB) continue;
      const r = calculatePearson(rows, defA.key, defB.key);
      if (Math.abs(r) >= 0.15) {
        allCorrelations.push({
          metricA: defA.label,
          metricB: defB.label,
          coefficient: Math.round(r * 10000) / 10000,
        });
      }
    }
  }

  // Sort by absolute strength descending — strongest relationships first
  allCorrelations.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));

  // Cap at 25 to keep prompt size reasonable
  const correlations = allCorrelations.slice(0, 25);

  // 2. Situational: Short vs Long games (Fatigue check)
  const sorted = [...rows].sort((a, b) => a.duration_seconds - b.duration_seconds);
  const medianRow = sorted[Math.floor(sorted.length / 2)];
  if (!medianRow) throw new Error("No rows for median calculation");
  const medianDuration = medianRow.duration_seconds;
  const shortGames = rows.filter((r) => r.duration_seconds <= medianDuration);
  const longGames = rows.filter((r) => r.duration_seconds > medianDuration);

  const avg = (arr: DeepInsightsRow[], key: keyof DeepInsightsRow) =>
    arr.reduce((s, r) => s + r[key], 0) / (arr.length || 1);

  const situationalAverages = [
    {
      label: "Short Games (\u2264 " + Math.round(medianDuration) + "s)",
      metrics: {
        lCancelRate: avg(shortGames, "l_cancel_rate"),
        neutralWinRate: avg(shortGames, "neutral_win_rate"),
        conversionRate: avg(shortGames, "conversion_rate"),
        edgeguardSuccess: avg(shortGames, "edgeguard_success_rate"),
        comboDI: avg(shortGames, "di_combo_score"),
        survivalDI: avg(shortGames, "di_survival_score"),
      },
    },
    {
      label: "Long Games (> " + Math.round(medianDuration) + "s)",
      metrics: {
        lCancelRate: avg(longGames, "l_cancel_rate"),
        neutralWinRate: avg(longGames, "neutral_win_rate"),
        conversionRate: avg(longGames, "conversion_rate"),
        edgeguardSuccess: avg(longGames, "edgeguard_success_rate"),
        comboDI: avg(longGames, "di_combo_score"),
        survivalDI: avg(longGames, "di_survival_score"),
      },
    },
  ];

  // 3. Wins vs Losses (The "What Matters" check)
  const wins = rows.filter((r) => r.is_win === 1);
  const losses = rows.filter((r) => r.is_win === 0);

  const winLossDiffs: Record<string, number> = {};
  for (const key of metricKeys) {
    if (key === "is_win") continue;
    const label = keyToLabel.get(key);
    if (label) winLossDiffs[label] = Math.round((avg(wins, key) - avg(losses, key)) * 10000) / 10000;
  }

  return { correlations, situationalAverages, winLossDiffs };
}

export function getStatTrend(
  statColumn: string,
  options?: {
    character?: string;
    opponentCharacter?: string;
    stage?: string;
    limit?: number;
  },
): TrendPoint[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options?.character) {
    conditions.push("g.player_character = ?");
    params.push(options.character);
  }
  if (options?.opponentCharacter) {
    conditions.push("g.opponent_character = ?");
    params.push(options.opponentCharacter);
  }
  if (options?.stage) {
    conditions.push("g.stage = ?");
    params.push(options.stage);
  }

  const where = conditions.length > 0 ? "AND " + conditions.join(" AND ") : "";
  const limit = options?.limit ?? 100;

  // Allowlist stat columns to prevent SQL injection
  const allowedColumns = [
    "neutral_win_rate",
    "openings_per_kill",
    "conversion_rate",
    "avg_damage_per_opening",
    "l_cancel_rate",
    "recovery_success_rate",
    "ledge_entropy",
    "knockdown_entropy",
    "shield_pressure_entropy",
    "avg_death_percent",
    "total_damage_dealt",
    "total_damage_taken",
    "wavedash_count",
    "dash_dance_frames",
    "time_on_platform",
    "time_in_air",
    "time_at_ledge",
    "avg_stage_position_x",
    "neutral_wins",
    "neutral_losses",
    "counter_hits",
    "total_openings",
    "total_conversions",
    "kill_conversions",
    "recovery_attempts",
    "power_shield_count",
    "edgeguard_attempts",
    "edgeguard_success_rate",
  ];
  if (!allowedColumns.includes(statColumn)) {
    throw new Error(`Invalid stat column: ${statColumn}`);
  }

  const rows = getDb()
    .prepare(
      `
    SELECT g.played_at as playedAt, gs.${statColumn} as value
    FROM game_stats gs
    JOIN games g ON gs.game_id = g.id
    WHERE g.played_at IS NOT NULL ${where}
    ORDER BY g.played_at DESC
    LIMIT ?
  `,
    )
    .all(...params, limit) as TrendPoint[];

  return rows.reverse();
}

export interface MatchupRecord {
  opponentCharacter: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

export function getMatchupRecords(playerCharacter?: string): MatchupRecord[] {
  const where = playerCharacter ? "WHERE g.player_character = ?" : "";
  const params = playerCharacter ? [playerCharacter] : [];

  return getDb()
    .prepare(
      `
    SELECT
      g.opponent_character as opponentCharacter,
      SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames,
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate
    FROM games g
    ${where}
    GROUP BY g.opponent_character
    ORDER BY totalGames DESC
  `,
    )
    .all(...params) as MatchupRecord[];
}

export interface StageRecord {
  stage: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

export function getStageRecords(): StageRecord[] {
  return getDb()
    .prepare(
      `
    SELECT
      g.stage,
      SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames,
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate
    FROM games g
    GROUP BY g.stage
    ORDER BY totalGames DESC
  `,
    )
    .all() as StageRecord[];
}

export function getTotalGames(): number {
  const row = getDb().prepare("SELECT COUNT(*) as count FROM games").get() as { count: number };
  return row.count;
}

export function getOverallRecord(): { wins: number; losses: number; totalGames: number } {
  const row = getDb()
    .prepare(
      `
    SELECT
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames
    FROM games
  `,
    )
    .get() as { wins: number; losses: number; totalGames: number };
  return row;
}

// ── Dashboard highlights ────────────────────────────────────────────

export interface DashboardHighlights {
  /** Best character by win rate (min 3 games) */
  bestCharacter: { character: string; winRate: number; games: number } | null;
  /** Worst matchup by win rate (min 3 games) */
  worstMatchup: { opponentCharacter: string; winRate: number; games: number } | null;
  /** Best matchup by win rate (min 3 games) */
  bestMatchup: { opponentCharacter: string; winRate: number; games: number } | null;
  /** Best stage by win rate (min 3 games) */
  bestStage: { stage: string; winRate: number; games: number } | null;
  /** Trend deltas: avg of last N games minus avg of previous N games */
  trends: {
    neutralWinRate: number;
    lCancelRate: number;
    edgeguardSuccessRate: number;
    openingsPerKill: number;
    avgDamagePerOpening: number;
    conversionRate: number;
  };
  /** Current streak: positive = win streak, negative = loss streak */
  streak: number;
}

export function getDashboardHighlights(trendWindow: number = 10): DashboardHighlights {
  const db = getDb();

  // Best character
  const bestChar = db
    .prepare(
      `
    SELECT g.player_character as character,
           ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate,
           COUNT(*) as games
    FROM games g
    GROUP BY g.player_character
    HAVING COUNT(*) >= 3
    ORDER BY winRate DESC
    LIMIT 1
  `,
    )
    .get() as { character: string; winRate: number; games: number } | undefined;

  // Best matchup
  const bestMu = db
    .prepare(
      `
    SELECT g.opponent_character as opponentCharacter,
           ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate,
           COUNT(*) as games
    FROM games g
    GROUP BY g.opponent_character
    HAVING COUNT(*) >= 3
    ORDER BY winRate DESC
    LIMIT 1
  `,
    )
    .get() as { opponentCharacter: string; winRate: number; games: number } | undefined;

  // Worst matchup
  const worstMu = db
    .prepare(
      `
    SELECT g.opponent_character as opponentCharacter,
           ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate,
           COUNT(*) as games
    FROM games g
    GROUP BY g.opponent_character
    HAVING COUNT(*) >= 3
    ORDER BY winRate ASC
    LIMIT 1
  `,
    )
    .get() as { opponentCharacter: string; winRate: number; games: number } | undefined;

  // Best stage
  const bestStage = db
    .prepare(
      `
    SELECT g.stage,
           ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate,
           COUNT(*) as games
    FROM games g
    GROUP BY g.stage
    HAVING COUNT(*) >= 3
    ORDER BY winRate DESC
    LIMIT 1
  `,
    )
    .get() as { stage: string; winRate: number; games: number } | undefined;

  // Trend deltas: compare last N games vs previous N
  const trendRows = db
    .prepare(
      `
    SELECT gs.neutral_win_rate as neutralWinRate,
           gs.l_cancel_rate as lCancelRate,
           gs.edgeguard_success_rate as edgeguardSuccessRate,
           gs.openings_per_kill as openingsPerKill,
           gs.avg_damage_per_opening as avgDamagePerOpening,
           gs.conversion_rate as conversionRate
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    ORDER BY g.played_at DESC
    LIMIT ?
  `,
    )
    .all(trendWindow * 2) as Array<{
    neutralWinRate: number;
    lCancelRate: number;
    edgeguardSuccessRate: number;
    openingsPerKill: number;
    avgDamagePerOpening: number;
    conversionRate: number;
  }>;

  const recent = trendRows.slice(0, trendWindow);
  const previous = trendRows.slice(trendWindow);

  function avg(arr: typeof trendRows, key: keyof (typeof trendRows)[0]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((s, r) => s + (r[key] ?? 0), 0) / arr.length;
  }

  const trends =
    previous.length > 0
      ? {
          neutralWinRate: avg(recent, "neutralWinRate") - avg(previous, "neutralWinRate"),
          lCancelRate: avg(recent, "lCancelRate") - avg(previous, "lCancelRate"),
          edgeguardSuccessRate: avg(recent, "edgeguardSuccessRate") - avg(previous, "edgeguardSuccessRate"),
          openingsPerKill: avg(recent, "openingsPerKill") - avg(previous, "openingsPerKill"),
          avgDamagePerOpening: avg(recent, "avgDamagePerOpening") - avg(previous, "avgDamagePerOpening"),
          conversionRate: avg(recent, "conversionRate") - avg(previous, "conversionRate"),
        }
      : {
          neutralWinRate: 0,
          lCancelRate: 0,
          edgeguardSuccessRate: 0,
          openingsPerKill: 0,
          avgDamagePerOpening: 0,
          conversionRate: 0,
        };

  // Current streak
  const streakRows = db
    .prepare(
      `
    SELECT g.result FROM games g ORDER BY g.played_at DESC LIMIT 20
  `,
    )
    .all() as Array<{ result: string }>;

  let streak = 0;
  if (streakRows.length > 0) {
    const first = streakRows[0]!.result;
    for (const row of streakRows) {
      if (row.result === first) streak++;
      else break;
    }
    if (first === "loss") streak = -streak;
  }

  return {
    bestCharacter: bestChar ?? null,
    worstMatchup: worstMu ?? null,
    bestMatchup: bestMu ?? null,
    bestStage: bestStage ?? null,
    trends,
    streak,
  };
}

// ── Recent games (for frontend) ──────────────────────────────────────

export interface RecentGame {
  id: number;
  replayPath: string;
  playedAt: string | null;
  stage: string;
  playerCharacter: string;
  opponentCharacter: string;
  opponentTag: string;
  opponentConnectCode: string | null;
  result: "win" | "loss" | "draw";
  playerFinalStocks: number;
  playerFinalPercent: number;
  opponentFinalStocks: number;
  opponentFinalPercent: number;
  durationSeconds: number;
  neutralWinRate: number;
  lCancelRate: number;
  openingsPerKill: number;
  avgDamagePerOpening: number;
  conversionRate: number;
  avgDeathPercent: number;
  powerShieldCount: number;
  edgeguardAttempts: number;
  edgeguardSuccessRate: number;
  recoverySuccessRate: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  wavedashCount: number;
  dashDanceFrames: number;
  killMove: string | null;
}

export function getRecentGames(limit: number = 100): RecentGame[] {
  return getDb()
    .prepare(
      `
    SELECT
      g.id, g.replay_path as replayPath,
      g.played_at as playedAt, g.stage,
      g.player_character as playerCharacter,
      g.opponent_character as opponentCharacter,
      g.opponent_tag as opponentTag,
      g.opponent_connect_code as opponentConnectCode,
      g.result,
      g.player_final_stocks as playerFinalStocks,
      g.player_final_percent as playerFinalPercent,
      g.opponent_final_stocks as opponentFinalStocks,
      g.opponent_final_percent as opponentFinalPercent,
      g.duration_seconds as durationSeconds,
      gs.neutral_win_rate as neutralWinRate,
      gs.l_cancel_rate as lCancelRate,
      gs.openings_per_kill as openingsPerKill,
      gs.avg_damage_per_opening as avgDamagePerOpening,
      gs.conversion_rate as conversionRate,
      gs.avg_death_percent as avgDeathPercent,
      gs.power_shield_count as powerShieldCount,
      gs.edgeguard_attempts as edgeguardAttempts,
      gs.edgeguard_success_rate as edgeguardSuccessRate,
      gs.recovery_success_rate as recoverySuccessRate,
      gs.total_damage_dealt as totalDamageDealt,
      gs.total_damage_taken as totalDamageTaken,
      gs.wavedash_count as wavedashCount,
      gs.dash_dance_frames as dashDanceFrames,
      (SELECT h.label
         FROM highlights h
         WHERE h.game_id = g.id AND h.did_kill = 1
         ORDER BY h.damage DESC
         LIMIT 1) as killMove
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    ORDER BY g.played_at DESC
    LIMIT ?
  `,
    )
    .all(limit) as RecentGame[];
}

// ── Opponent history ─────────────────────────────────────────────────

export interface OpponentRecord {
  opponentTag: string;
  opponentConnectCode: string | null;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
  characters: string;
  lastPlayed: string | null;
}

export function getOpponentHistory(opponent?: string): OpponentRecord[] {
  if (opponent) {
    // Search by tag or connect code
    return getDb()
      .prepare(
        `
      SELECT
        opponent_tag as opponentTag,
        opponent_connect_code as opponentConnectCode,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
        COUNT(*) as totalGames,
        ROUND(CAST(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate,
        GROUP_CONCAT(DISTINCT opponent_character) as characters,
        MAX(played_at) as lastPlayed
      FROM games
      WHERE opponent_tag LIKE ? OR opponent_connect_code LIKE ?
      GROUP BY COALESCE(opponent_connect_code, opponent_tag)
      ORDER BY totalGames DESC
    `,
      )
      .all(`%${opponent}%`, `%${opponent}%`) as OpponentRecord[];
  }

  return getDb()
    .prepare(
      `
    SELECT
      opponent_tag as opponentTag,
      opponent_connect_code as opponentConnectCode,
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames,
      ROUND(CAST(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate,
      GROUP_CONCAT(DISTINCT opponent_character) as characters,
      MAX(played_at) as lastPlayed
    FROM games
    GROUP BY COALESCE(opponent_connect_code, opponent_tag)
    ORDER BY totalGames DESC
  `,
    )
    .all() as OpponentRecord[];
}

// ── Coaching analysis retrieval ──────────────────────────────────────

export interface StoredAnalysis {
  id: number;
  modelUsed: string;
  analysisText: string;
  createdAt: string;
}

export function getLatestAnalysis(limit: number = 1): StoredAnalysis[] {
  return getDb()
    .prepare(
      `
    SELECT id, model_used as modelUsed, analysis_text as analysisText, created_at as createdAt
    FROM coaching_analyses
    ORDER BY created_at DESC
    LIMIT ?
  `,
    )
    .all(limit) as StoredAnalysis[];
}

export function getAnalysisById(id: number): StoredAnalysis | undefined {
  return getDb()
    .prepare(
      `
    SELECT id, model_used as modelUsed, analysis_text as analysisText, created_at as createdAt
    FROM coaching_analyses
    WHERE id = ?
  `,
    )
    .get(id) as StoredAnalysis | undefined;
}

// ── Set detection ────────────────────────────────────────────────────

export interface DetectedSet {
  opponentTag: string;
  opponentCharacter: string;
  gameIds: number[];
  sessionId: number | null;
  startedAt: string;
  wins: number;
  losses: number;
  draws: number;
}

/**
 * Detect sets from imported games by grouping consecutive games
 * against the same opponent within a time gap.
 */
export function detectSets(gapMinutes: number = 15): DetectedSet[] {
  const games = getDb()
    .prepare(
      `
    SELECT
      id, session_id, opponent_tag, opponent_connect_code, opponent_character,
      result, played_at
    FROM games
    WHERE played_at IS NOT NULL
    ORDER BY played_at ASC
  `,
    )
    .all() as {
    id: number;
    session_id: number | null;
    opponent_tag: string;
    opponent_connect_code: string | null;
    opponent_character: string;
    result: string;
    played_at: string;
  }[];

  if (games.length === 0) return [];

  const gapMs = gapMinutes * 60 * 1000;
  const sets: DetectedSet[] = [];
  const firstGame = games[0];
  if (!firstGame) return [];
  let currentSet: DetectedSet = {
    opponentTag: firstGame.opponent_tag,
    opponentCharacter: firstGame.opponent_character,
    gameIds: [firstGame.id],
    sessionId: firstGame.session_id,
    startedAt: firstGame.played_at,
    wins: firstGame.result === "win" ? 1 : 0,
    losses: firstGame.result === "loss" ? 1 : 0,
    draws: firstGame.result === "draw" ? 1 : 0,
  };

  for (let i = 1; i < games.length; i++) {
    const game = games[i];
    const prev = games[i - 1];
    if (!game || !prev) continue;
    const prevTime = new Date(prev.played_at).getTime();
    const currTime = new Date(game.played_at).getTime();
    const sameOpponent =
      (game.opponent_connect_code && game.opponent_connect_code === prev.opponent_connect_code) ||
      game.opponent_tag === prev.opponent_tag;
    const withinGap = currTime - prevTime < gapMs;

    if (sameOpponent && withinGap) {
      currentSet.gameIds.push(game.id);
      if (game.result === "win") currentSet.wins++;
      else if (game.result === "loss") currentSet.losses++;
      else currentSet.draws++;
      // Track all opponent characters used in the set
      if (
        game.opponent_character !== currentSet.opponentCharacter &&
        !currentSet.opponentCharacter.includes(game.opponent_character)
      ) {
        currentSet.opponentCharacter += `, ${game.opponent_character}`;
      }
    } else {
      sets.push(currentSet);
      currentSet = {
        opponentTag: game.opponent_tag,
        opponentCharacter: game.opponent_character,
        gameIds: [game.id],
        sessionId: game.session_id,
        startedAt: game.played_at,
        wins: game.result === "win" ? 1 : 0,
        losses: game.result === "loss" ? 1 : 0,
        draws: game.result === "draw" ? 1 : 0,
      };
    }
  }
  sets.push(currentSet);

  return sets;
}

// ── Opponent detail (head-to-head deep dive) ────────────────────────

export interface OpponentDetailGame {
  id: number;
  playedAt: string | null;
  playerCharacter: string;
  opponentCharacter: string;
  stage: string;
  result: string;
  playerFinalStocks: number;
  opponentFinalStocks: number;
  neutralWinRate: number;
  lCancelRate: number;
  openingsPerKill: number;
  edgeguardSuccessRate: number;
  replayPath: string;
}

export interface OpponentStageBreakdown {
  stage: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

export interface OpponentCharacterBreakdown {
  opponentCharacter: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

export interface OpponentDetail {
  opponentTag: string;
  opponentConnectCode: string | null;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
  games: OpponentDetailGame[];
  stageBreakdown: OpponentStageBreakdown[];
  characterBreakdown: OpponentCharacterBreakdown[];
}

/**
 * Get full head-to-head detail for a specific opponent.
 * @param opponentKey - The opponent's connect code or tag (as used in COALESCE grouping)
 */
export function getOpponentDetail(opponentKey: string): OpponentDetail | null {
  const database = getDb();

  // Match games by connect code or tag
  const games = database
    .prepare(
      `
    SELECT
      g.id, g.played_at as playedAt,
      g.player_character as playerCharacter,
      g.opponent_character as opponentCharacter,
      g.stage, g.result,
      g.player_final_stocks as playerFinalStocks,
      g.opponent_final_stocks as opponentFinalStocks,
      gs.neutral_win_rate as neutralWinRate,
      gs.l_cancel_rate as lCancelRate,
      gs.openings_per_kill as openingsPerKill,
      gs.edgeguard_success_rate as edgeguardSuccessRate,
      g.replay_path as replayPath
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    WHERE g.opponent_connect_code = ? OR g.opponent_tag = ?
    ORDER BY g.played_at DESC
  `,
    )
    .all(opponentKey, opponentKey) as OpponentDetailGame[];

  if (games.length === 0) return null;

  // Get the tag and connect code from the first game row
  const meta = database
    .prepare(
      `
    SELECT opponent_tag, opponent_connect_code
    FROM games
    WHERE opponent_connect_code = ? OR opponent_tag = ?
    ORDER BY played_at DESC
    LIMIT 1
  `,
    )
    .get(opponentKey, opponentKey) as { opponent_tag: string; opponent_connect_code: string | null } | undefined;

  if (!meta) return null;

  const wins = games.filter((g) => g.result === "win").length;
  const losses = games.filter((g) => g.result === "loss").length;

  // Stage breakdown
  const stageBreakdown = database
    .prepare(
      `
    SELECT
      g.stage,
      SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames,
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate
    FROM games g
    WHERE g.opponent_connect_code = ? OR g.opponent_tag = ?
    GROUP BY g.stage
    ORDER BY totalGames DESC
  `,
    )
    .all(opponentKey, opponentKey) as OpponentStageBreakdown[];

  // Character breakdown (opponent's characters)
  const characterBreakdown = database
    .prepare(
      `
    SELECT
      g.opponent_character as opponentCharacter,
      SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames,
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate
    FROM games g
    WHERE g.opponent_connect_code = ? OR g.opponent_tag = ?
    GROUP BY g.opponent_character
    ORDER BY totalGames DESC
  `,
    )
    .all(opponentKey, opponentKey) as OpponentCharacterBreakdown[];

  return {
    opponentTag: meta.opponent_tag,
    opponentConnectCode: meta.opponent_connect_code,
    wins,
    losses,
    totalGames: games.length,
    winRate: games.length > 0 ? wins / games.length : 0,
    games,
    stageBreakdown,
    characterBreakdown,
  };
}

// ── Clear all data ───────────────────────────────────────────────────

export function clearAllGames(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM coaching_analyses;
    DELETE FROM highlights;
    DELETE FROM character_signature_stats;
    DELETE FROM game_stats;
    DELETE FROM games;
    DELETE FROM sessions;
  `);
}

// ── Character aggregate queries ──────────────────────────────────────

export interface CharacterOverview {
  character: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgNeutralWinRate: number;
  avgConversionRate: number;
  avgLCancelRate: number;
  avgOpeningsPerKill: number;
  avgDamagePerOpening: number;
  avgDeathPercent: number;
  avgRecoverySuccessRate: number;
  lastPlayed: string | null;
}

export function getCharacterList(): CharacterOverview[] {
  return getDb()
    .prepare(
      `
    SELECT
      g.player_character as character,
      COUNT(*) as gamesPlayed,
      SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate,
      ROUND(AVG(gs.neutral_win_rate), 4) as avgNeutralWinRate,
      ROUND(AVG(gs.conversion_rate), 4) as avgConversionRate,
      ROUND(AVG(gs.l_cancel_rate), 4) as avgLCancelRate,
      ROUND(AVG(gs.openings_per_kill), 2) as avgOpeningsPerKill,
      ROUND(AVG(gs.avg_damage_per_opening), 2) as avgDamagePerOpening,
      ROUND(AVG(gs.avg_death_percent), 0) as avgDeathPercent,
      ROUND(AVG(gs.recovery_success_rate), 4) as avgRecoverySuccessRate,
      MAX(g.played_at) as lastPlayed
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    GROUP BY g.player_character
    ORDER BY gamesPlayed DESC
  `,
    )
    .all() as CharacterOverview[];
}

export interface CharacterMatchup {
  opponentCharacter: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgNeutralWinRate: number;
  avgConversionRate: number;
  avgOpeningsPerKill: number;
}

export function getCharacterMatchups(character: string): CharacterMatchup[] {
  return getDb()
    .prepare(
      `
    SELECT
      g.opponent_character as opponentCharacter,
      COUNT(*) as gamesPlayed,
      SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate,
      ROUND(AVG(gs.neutral_win_rate), 4) as avgNeutralWinRate,
      ROUND(AVG(gs.conversion_rate), 4) as avgConversionRate,
      ROUND(AVG(gs.openings_per_kill), 2) as avgOpeningsPerKill
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    WHERE g.player_character = ?
    GROUP BY g.opponent_character
    ORDER BY gamesPlayed DESC
  `,
    )
    .all(character) as CharacterMatchup[];
}

export interface CharacterStageStats {
  stage: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

export function getCharacterStageStats(character: string): CharacterStageStats[] {
  return getDb()
    .prepare(
      `
    SELECT
      g.stage,
      COUNT(*) as gamesPlayed,
      SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate
    FROM games g
    WHERE g.player_character = ?
    GROUP BY g.stage
    ORDER BY gamesPlayed DESC
  `,
    )
    .all(character) as CharacterStageStats[];
}

// ── Character signature stats ────────────────────────────────────────

export function insertSignatureStats(gameId: number, signatureJson: string): void {
  getDb()
    .prepare(
      `
    INSERT OR REPLACE INTO character_signature_stats (game_id, signature_json)
    VALUES (?, ?)
  `,
    )
    .run(gameId, signatureJson);
}

// ── Highlights ──────────────────────────────────────────────────────

export interface HighlightRow {
  id: number;
  gameId: number;
  type: string;
  label: string;
  description: string;
  character: string;
  victim: string;
  startFrame: number;
  timestamp: string;
  damage: number;
  startPercent: number;
  didKill: boolean;
  moves: string[];
  stockNumber: number | null;
}

export function insertHighlights(
  gameId: number,
  highlights: {
    type: string;
    label: string;
    description: string;
    character: string;
    victim: string;
    startFrame: number;
    timestamp: string;
    damage: number;
    startPercent: number;
    didKill: boolean;
    moves: string[];
    stockNumber: number | null;
  }[],
): void {
  if (highlights.length === 0) return;
  const stmt = getDb().prepare(`
    INSERT INTO highlights (game_id, type, label, description, character, victim, start_frame, timestamp, damage, start_percent, did_kill, moves_json, stock_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const h of highlights) {
    stmt.run(
      gameId,
      h.type,
      h.label,
      h.description,
      h.character,
      h.victim,
      h.startFrame,
      h.timestamp,
      h.damage,
      h.startPercent,
      h.didKill ? 1 : 0,
      JSON.stringify(h.moves),
      h.stockNumber,
    );
  }
}

export function getGameHighlights(gameId: number): HighlightRow[] {
  const rows = getDb()
    .prepare(
      `
    SELECT id, game_id as gameId, type, label, description, character, victim,
           start_frame as startFrame, timestamp, damage, start_percent as startPercent,
           did_kill as didKill, moves_json, stock_number as stockNumber
    FROM highlights
    WHERE game_id = ?
    ORDER BY start_frame ASC
  `,
    )
    .all(gameId) as (Omit<HighlightRow, "didKill" | "moves"> & { didKill: number; moves_json: string })[];

  return rows.map((r) => ({
    ...r,
    didKill: r.didKill === 1,
    moves: JSON.parse(r.moves_json) as string[],
  }));
}

export function getRecentHighlights(limit: number = 20): (HighlightRow & {
  replayPath: string;
  opponentTag: string;
  playedAt: string | null;
})[] {
  const rows = getDb()
    .prepare(
      `
    SELECT h.id, h.game_id as gameId, h.type, h.label, h.description,
           h.character, h.victim,
           h.start_frame as startFrame, h.timestamp, h.damage,
           h.start_percent as startPercent,
           h.did_kill as didKill, h.moves_json, h.stock_number as stockNumber,
           g.replay_path as replayPath, g.opponent_tag as opponentTag, g.played_at as playedAt
    FROM highlights h
    JOIN games g ON g.id = h.game_id
    ORDER BY g.played_at DESC, h.start_frame ASC
    LIMIT ?
  `,
    )
    .all(limit) as any[];

  return rows.map((r) => ({
    ...r,
    didKill: r.didKill === 1,
    moves: JSON.parse(r.moves_json) as string[],
  }));
}

// ── Per-character game stats (for radar chart) ──────────────────────

export interface CharacterGameStat {
  neutralWinRate: number;
  lCancelRate: number;
  openingsPerKill: number;
  avgDamagePerOpening: number;
  conversionRate: number;
  avgDeathPercent: number;
  recoverySuccessRate: number;
  edgeguardSuccessRate: number;
  wavedashCount: number;
  dashDanceFrames: number;
  ledgeEntropy: number;
  knockdownEntropy: number;
  shieldPressureEntropy: number;
  diSurvivalScore: number;
  diComboScore: number;
  powerShieldCount: number;
  shieldPressureSequences: number;
  shieldPressureAvgDamage: number;
  playedAt: string | null;
}

export function getCharacterGameStats(character: string): CharacterGameStat[] {
  return getDb()
    .prepare(
      `
    SELECT
      gs.neutral_win_rate as neutralWinRate,
      gs.l_cancel_rate as lCancelRate,
      gs.openings_per_kill as openingsPerKill,
      gs.avg_damage_per_opening as avgDamagePerOpening,
      gs.conversion_rate as conversionRate,
      gs.avg_death_percent as avgDeathPercent,
      gs.recovery_success_rate as recoverySuccessRate,
      gs.edgeguard_success_rate as edgeguardSuccessRate,
      gs.wavedash_count as wavedashCount,
      gs.dash_dance_frames as dashDanceFrames,
      gs.ledge_entropy as ledgeEntropy,
      gs.knockdown_entropy as knockdownEntropy,
      gs.shield_pressure_entropy as shieldPressureEntropy,
      gs.di_survival_score as diSurvivalScore,
      gs.di_combo_score as diComboScore,
      gs.power_shield_count as powerShieldCount,
      gs.shield_pressure_sequences as shieldPressureSequences,
      gs.shield_pressure_avg_damage as shieldPressureAvgDamage,
      g.played_at as playedAt
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    WHERE g.player_character = ?
    ORDER BY g.played_at DESC
  `,
    )
    .all(character) as CharacterGameStat[];
}

/**
 * Retrieve historical player context for LLM coaching prompts.
 * Aggregates overall record, character win rates, top matchups,
 * recent vs overall stat trends, and current streak.
 *
 * @param targetPlayer - Player tag or connect code to filter by
 * @param recentLimit - Number of recent games for trend comparison (default 10)
 */
export function getPlayerHistory(targetPlayer: string, recentLimit: number = 10): PlayerHistory | null {
  const database = getDb();

  // Overall record
  const overallRecord = database
    .prepare(
      `
    SELECT
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames
    FROM games
    WHERE player_tag = ? OR player_connect_code = ?
  `,
    )
    .get(targetPlayer, targetPlayer) as { wins: number; losses: number; totalGames: number } | undefined;

  if (!overallRecord || overallRecord.totalGames === 0) {
    return null;
  }

  // Character win rates (player's own characters)
  const characterWinRates = database
    .prepare(
      `
    SELECT
      player_character as character,
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames,
      ROUND(CAST(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate
    FROM games
    WHERE player_tag = ? OR player_connect_code = ?
    GROUP BY player_character
    ORDER BY totalGames DESC
  `,
    )
    .all(targetPlayer, targetPlayer) as PlayerHistory["characterWinRates"];

  // Top 3 most-played matchups with win rates
  const topMatchups = database
    .prepare(
      `
    SELECT
      opponent_character as opponentCharacter,
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames,
      ROUND(CAST(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate
    FROM games
    WHERE player_tag = ? OR player_connect_code = ?
    GROUP BY opponent_character
    ORDER BY totalGames DESC
    LIMIT 3
  `,
    )
    .all(targetPlayer, targetPlayer) as PlayerHistory["topMatchups"];

  // Recent stats (last N games) — subquery ensures LIMIT applies before aggregation
  const recentStats = database
    .prepare(
      `
    SELECT
      ROUND(AVG(gs.neutral_win_rate), 4) as avgNeutralWinRate,
      ROUND(AVG(gs.l_cancel_rate), 4) as avgLCancelRate,
      ROUND(AVG(gs.conversion_rate), 4) as avgConversionRate,
      ROUND(AVG(gs.openings_per_kill), 2) as avgOpeningsPerKill,
      ROUND(AVG(gs.avg_damage_per_opening), 2) as avgDamagePerOpening,
      ROUND(AVG(gs.edgeguard_success_rate), 4) as avgEdgeguardSuccessRate,
      COUNT(*) as gamesCount
    FROM game_stats gs
    WHERE gs.game_id IN (
      SELECT g.id FROM games g
      WHERE (g.player_tag = ? OR g.player_connect_code = ?)
        AND g.played_at IS NOT NULL
      ORDER BY g.played_at DESC
      LIMIT ?
    )
  `,
    )
    .get(targetPlayer, targetPlayer, recentLimit) as PlayerHistory["recentStats"];

  // Overall stats (all games)
  const overallStats = database
    .prepare(
      `
    SELECT
      ROUND(AVG(gs.neutral_win_rate), 4) as avgNeutralWinRate,
      ROUND(AVG(gs.l_cancel_rate), 4) as avgLCancelRate,
      ROUND(AVG(gs.conversion_rate), 4) as avgConversionRate,
      ROUND(AVG(gs.openings_per_kill), 2) as avgOpeningsPerKill,
      ROUND(AVG(gs.avg_damage_per_opening), 2) as avgDamagePerOpening,
      ROUND(AVG(gs.edgeguard_success_rate), 4) as avgEdgeguardSuccessRate,
      COUNT(*) as gamesCount
    FROM game_stats gs
    JOIN games g ON gs.game_id = g.id
    WHERE g.player_tag = ? OR g.player_connect_code = ?
  `,
    )
    .get(targetPlayer, targetPlayer) as PlayerHistory["overallStats"];

  // Current streak — walk recent results to count consecutive wins or losses
  const recentResults = database
    .prepare(
      `
    SELECT result
    FROM games
    WHERE (player_tag = ? OR player_connect_code = ?)
      AND played_at IS NOT NULL
    ORDER BY played_at DESC
    LIMIT 50
  `,
    )
    .all(targetPlayer, targetPlayer) as { result: string }[];

  let currentStreak: PlayerHistory["currentStreak"] = null;
  if (recentResults.length > 0) {
    const firstResult = recentResults[0]?.result;
    if (firstResult === "win" || firstResult === "loss") {
      let count = 0;
      for (const row of recentResults) {
        if (row.result === firstResult) {
          count++;
        } else {
          break;
        }
      }
      if (count >= 2) {
        currentStreak = { type: firstResult, count };
      }
    }
  }

  return {
    overallRecord,
    characterWinRates,
    topMatchups,
    recentStats: recentStats && recentStats.gamesCount > 0 ? recentStats : null,
    overallStats: overallStats && overallStats.gamesCount > 0 ? overallStats : null,
    currentStreak,
  };
}

export interface DaySession {
  date: string;
  games: number;
  wins: number;
  losses: number;
  opponents: string[];
  gameIds: number[];
}

export function getSessionsByDay(daysBack: number = 90): DaySession[] {
  const rows = getDb()
    .prepare(
      `
    SELECT
      substr(played_at, 1, 10) as date,
      id,
      result,
      opponent_tag as opponentTag
    FROM games
    WHERE played_at >= date('now', '-' || ? || ' days')
    ORDER BY played_at DESC
  `,
    )
    .all(daysBack) as Array<{ date: string; id: number; result: string; opponentTag: string }>;

  const map = new Map<string, DaySession>();
  for (const r of rows) {
    const existing = map.get(r.date) ?? {
      date: r.date,
      games: 0,
      wins: 0,
      losses: 0,
      opponents: [] as string[],
      gameIds: [] as number[],
    };
    existing.games += 1;
    if (r.result === "win") existing.wins += 1;
    else if (r.result === "loss") existing.losses += 1;
    existing.gameIds.push(r.id);
    if (!existing.opponents.includes(r.opponentTag)) existing.opponents.push(r.opponentTag);
    map.set(r.date, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export function getSessionReport(date: string): string | null {
  const row = getDb().prepare("SELECT content FROM session_reports WHERE date = ?").get(date) as
    | { content: string }
    | undefined;
  return row?.content ?? null;
}

export function setSessionReport(date: string, content: string): void {
  getDb().prepare("INSERT OR REPLACE INTO session_reports (date, content) VALUES (?, ?)").run(date, content);
}

export function getGamesOnDate(date: string): RecentGame[] {
  return getDb()
    .prepare(
      `
    SELECT
      g.id, g.replay_path as replayPath,
      g.played_at as playedAt, g.stage,
      g.player_character as playerCharacter,
      g.opponent_character as opponentCharacter,
      g.opponent_tag as opponentTag,
      g.opponent_connect_code as opponentConnectCode,
      g.result,
      g.player_final_stocks as playerFinalStocks,
      g.player_final_percent as playerFinalPercent,
      g.opponent_final_stocks as opponentFinalStocks,
      g.opponent_final_percent as opponentFinalPercent,
      g.duration_seconds as durationSeconds,
      gs.neutral_win_rate as neutralWinRate,
      gs.l_cancel_rate as lCancelRate,
      gs.openings_per_kill as openingsPerKill,
      gs.avg_damage_per_opening as avgDamagePerOpening,
      gs.conversion_rate as conversionRate,
      gs.avg_death_percent as avgDeathPercent,
      gs.power_shield_count as powerShieldCount,
      gs.edgeguard_attempts as edgeguardAttempts,
      gs.edgeguard_success_rate as edgeguardSuccessRate,
      gs.recovery_success_rate as recoverySuccessRate,
      gs.total_damage_dealt as totalDamageDealt,
      gs.total_damage_taken as totalDamageTaken,
      gs.wavedash_count as wavedashCount,
      gs.dash_dance_frames as dashDanceFrames,
      NULL as killMove
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    WHERE substr(g.played_at, 1, 10) = ?
    ORDER BY g.played_at ASC
  `,
    )
    .all(date) as RecentGame[];
}

export type TrendMetric =
  | "neutralWinRate"
  | "lCancelRate"
  | "conversionRate"
  | "avgDamagePerOpening"
  | "openingsPerKill"
  | "avgDeathPercent";

const METRIC_COLUMN: Record<TrendMetric, string> = {
  neutralWinRate: "gs.neutral_win_rate",
  lCancelRate: "gs.l_cancel_rate",
  conversionRate: "gs.conversion_rate",
  avgDamagePerOpening: "gs.avg_damage_per_opening",
  openingsPerKill: "gs.openings_per_kill",
  avgDeathPercent: "gs.avg_death_percent",
};

export function getTrendSeries(metric: TrendMetric, range: "7d" | "30d" | "all", filterChar: string | null): number[] {
  const column = METRIC_COLUMN[metric];
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (range === "7d") where.push("g.played_at >= date('now', '-7 days')");
  else if (range === "30d") where.push("g.played_at >= date('now', '-30 days')");
  if (filterChar && filterChar !== "all") {
    where.push("g.opponent_character = ?");
    params.push(filterChar);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `
    SELECT ${column} as v
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    ${whereClause}
    ORDER BY g.played_at ASC
  `;
  const rows = getDb()
    .prepare(sql)
    .all(...params) as Array<{ v: number }>;
  return rows.map((r) => r.v);
}

export { DB_PATH, DATA_DIR };
