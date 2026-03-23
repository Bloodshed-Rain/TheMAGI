import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

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
    games_won INTEGER NOT NULL DEFAULT 0,
    ai_summary TEXT
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

  CREATE TABLE IF NOT EXISTS practice_plans (
    id INTEGER PRIMARY KEY,
    coaching_analysis_id INTEGER REFERENCES coaching_analyses(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    drill_1 TEXT,
    drill_2 TEXT,
    drill_3 TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned'))
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
      if (!columns.some(c => c.name === "power_shield_count")) {
        db.exec("ALTER TABLE game_stats ADD COLUMN power_shield_count INTEGER NOT NULL DEFAULT 0");
      }
    },
  },
  {
    version: 2,
    description: "Add edgeguard_attempts and edgeguard_success_rate to game_stats",
    up: (db) => {
      const columns = db.pragma("table_info(game_stats)") as { name: string }[];
      if (!columns.some(c => c.name === "edgeguard_attempts")) {
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
      if (!columns.some(c => c.name === "shield_pressure_sequences")) {
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

  const row = db.prepare("SELECT version FROM schema_version WHERE id = 1").get() as
    | { version: number }
    | undefined;

  if (!row) {
    // First run — determine starting version by inspecting existing state.
    // If the ad-hoc columns already exist, we know those migrations were
    // effectively applied before we had the version table.
    let startVersion = 0;
    const columns = db.pragma("table_info(game_stats)") as { name: string }[];
    if (columns.some(c => c.name === "edgeguard_attempts")) {
      startVersion = 2;
    } else if (columns.some(c => c.name === "power_shield_count")) {
      startVersion = 1;
    }
    db.prepare(
      "INSERT INTO schema_version (id, version) VALUES (1, ?)",
    ).run(startVersion);
    return startVersion;
  }

  return row.version;
}

function setSchemaVersion(db: Database.Database, version: number): void {
  db.prepare(
    "UPDATE schema_version SET version = ?, updated_at = datetime('now') WHERE id = 1",
  ).run(version);
}

/**
 * Run all pending migrations in a single transaction.
 * Each migration's version must be strictly greater than the current version.
 */
function runMigrations(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db);

  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) return;

  const migrate = db.transaction(() => {
    for (const migration of pending) {
      console.log(`[db] Running migration v${migration.version}: ${migration.description}`);
      migration.up(db);
      setSchemaVersion(db, migration.version);
    }
  });

  migrate();
  console.log(`[db] Migrations complete. Schema version: ${pending[pending.length - 1]!.version}`);
}

// ── Database instance ────────────────────────────────────────────────

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    ensureDataDir();
    try {
      db = new Database(DB_PATH);
      db.pragma("journal_mode = WAL");
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
    params.neutralWins, params.neutralLosses, params.neutralWinRate, params.counterHits,
    params.openingsPerKill, params.totalOpenings, params.totalConversions, params.conversionRate,
    params.avgDamagePerOpening, params.killConversions,
    params.lCancelRate, params.wavedashCount, params.dashDanceFrames,
    params.avgStagePositionX, params.timeOnPlatform, params.timeInAir, params.timeAtLedge,
    params.totalDamageTaken, params.totalDamageDealt, params.avgDeathPercent,
    params.recoveryAttempts, params.recoverySuccessRate,
    params.ledgeEntropy, params.knockdownEntropy, params.shieldPressureEntropy,
    params.powerShieldCount,
    params.edgeguardAttempts, params.edgeguardSuccessRate,
    params.shieldPressureSequences, params.shieldPressureAvgDamage,
    params.shieldBreaks, params.shieldPokeRate,
    params.diSurvivalScore, params.diComboScore,
    params.diAvgComboLengthReceived, params.diAvgComboLengthDealt,
  );
}

export function insertCoachingAnalysis(
  gameId: number | null,
  sessionId: number | null,
  modelUsed: string,
  analysisText: string,
): number {
  const stmt = getDb().prepare(`
    INSERT INTO coaching_analyses (game_id, session_id, model_used, analysis_text)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(gameId, sessionId, modelUsed, analysisText);
  return Number(result.lastInsertRowid);
}

// ── Session management ───────────────────────────────────────────────

export function createSession(startedAt: string): number {
  const stmt = getDb().prepare(
    "INSERT INTO sessions (started_at) VALUES (?)",
  );
  const result = stmt.run(startedAt);
  return Number(result.lastInsertRowid);
}

export function updateSession(
  sessionId: number,
  endedAt: string,
  gamesPlayed: number,
  gamesWon: number,
): void {
  getDb().prepare(`
    UPDATE sessions SET ended_at = ?, games_played = ?, games_won = ? WHERE id = ?
  `).run(endedAt, gamesPlayed, gamesWon, sessionId);
}

// ── Trend queries ────────────────────────────────────────────────────

export interface TrendPoint {
  playedAt: string;
  value: number;
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
    "neutral_win_rate", "openings_per_kill", "conversion_rate",
    "avg_damage_per_opening", "l_cancel_rate", "recovery_success_rate",
    "ledge_entropy", "knockdown_entropy", "shield_pressure_entropy",
    "avg_death_percent", "total_damage_dealt", "total_damage_taken",
    "wavedash_count", "dash_dance_frames", "time_on_platform",
    "time_in_air", "time_at_ledge", "avg_stage_position_x",
    "neutral_wins", "neutral_losses", "counter_hits",
    "total_openings", "total_conversions", "kill_conversions",
    "recovery_attempts", "power_shield_count",
    "edgeguard_attempts", "edgeguard_success_rate",
  ];
  if (!allowedColumns.includes(statColumn)) {
    throw new Error(`Invalid stat column: ${statColumn}`);
  }

  const rows = getDb().prepare(`
    SELECT g.played_at as playedAt, gs.${statColumn} as value
    FROM game_stats gs
    JOIN games g ON gs.game_id = g.id
    WHERE g.played_at IS NOT NULL ${where}
    ORDER BY g.played_at DESC
    LIMIT ?
  `).all(...params, limit) as TrendPoint[];

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
  const where = playerCharacter
    ? "WHERE g.player_character = ?"
    : "";
  const params = playerCharacter ? [playerCharacter] : [];

  return getDb().prepare(`
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
  `).all(...params) as MatchupRecord[];
}

export interface StageRecord {
  stage: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

export function getStageRecords(): StageRecord[] {
  return getDb().prepare(`
    SELECT
      g.stage,
      SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames,
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 4) as winRate
    FROM games g
    GROUP BY g.stage
    ORDER BY totalGames DESC
  `).all() as StageRecord[];
}

export function getTotalGames(): number {
  const row = getDb().prepare("SELECT COUNT(*) as count FROM games").get() as { count: number };
  return row.count;
}

export function getOverallRecord(): { wins: number; losses: number; totalGames: number } {
  const row = getDb().prepare(`
    SELECT
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames
    FROM games
  `).get() as { wins: number; losses: number; totalGames: number };
  return row;
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
  result: string;
  playerFinalStocks: number;
  opponentFinalStocks: number;
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
  wavedashCount: number;
  dashDanceFrames: number;
  ledgeEntropy: number;
  knockdownEntropy: number;
  shieldPressureEntropy: number;
}

export function getRecentGames(limit: number = 100): RecentGame[] {
  return getDb().prepare(`
    SELECT
      g.id, g.replay_path as replayPath,
      g.played_at as playedAt, g.stage,
      g.player_character as playerCharacter,
      g.opponent_character as opponentCharacter,
      g.opponent_tag as opponentTag,
      g.result,
      g.player_final_stocks as playerFinalStocks,
      g.opponent_final_stocks as opponentFinalStocks,
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
      gs.wavedash_count as wavedashCount,
      gs.dash_dance_frames as dashDanceFrames,
      gs.ledge_entropy as ledgeEntropy,
      gs.knockdown_entropy as knockdownEntropy,
      gs.shield_pressure_entropy as shieldPressureEntropy
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    ORDER BY g.played_at DESC
    LIMIT ?
  `).all(limit) as RecentGame[];
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
    return getDb().prepare(`
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
    `).all(`%${opponent}%`, `%${opponent}%`) as OpponentRecord[];
  }

  return getDb().prepare(`
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
  `).all() as OpponentRecord[];
}

// ── Coaching analysis retrieval ──────────────────────────────────────

export interface StoredAnalysis {
  id: number;
  modelUsed: string;
  analysisText: string;
  createdAt: string;
}

export function getLatestAnalysis(limit: number = 1): StoredAnalysis[] {
  return getDb().prepare(`
    SELECT id, model_used as modelUsed, analysis_text as analysisText, created_at as createdAt
    FROM coaching_analyses
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as StoredAnalysis[];
}

export function getAnalysisById(id: number): StoredAnalysis | undefined {
  return getDb().prepare(`
    SELECT id, model_used as modelUsed, analysis_text as analysisText, created_at as createdAt
    FROM coaching_analyses
    WHERE id = ?
  `).get(id) as StoredAnalysis | undefined;
}

// ── Set detection ────────────────────────────────────────────────────

export interface DetectedSet {
  opponentTag: string;
  opponentCharacter: string;
  gameIds: number[];
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
  const games = getDb().prepare(`
    SELECT
      id, opponent_tag, opponent_connect_code, opponent_character,
      result, played_at
    FROM games
    WHERE played_at IS NOT NULL
    ORDER BY played_at ASC
  `).all() as {
    id: number;
    opponent_tag: string;
    opponent_connect_code: string | null;
    opponent_character: string;
    result: string;
    played_at: string;
  }[];

  if (games.length === 0) return [];

  const gapMs = gapMinutes * 60 * 1000;
  const sets: DetectedSet[] = [];
  let currentSet: DetectedSet = {
    opponentTag: games[0]!.opponent_tag,
    opponentCharacter: games[0]!.opponent_character,
    gameIds: [games[0]!.id],
    startedAt: games[0]!.played_at,
    wins: games[0]!.result === "win" ? 1 : 0,
    losses: games[0]!.result === "loss" ? 1 : 0,
    draws: games[0]!.result === "draw" ? 1 : 0,
  };

  for (let i = 1; i < games.length; i++) {
    const game = games[i]!;
    const prev = games[i - 1]!;
    const prevTime = new Date(prev.played_at).getTime();
    const currTime = new Date(game.played_at).getTime();
    const sameOpponent =
      (game.opponent_connect_code && game.opponent_connect_code === prev.opponent_connect_code) ||
      game.opponent_tag === prev.opponent_tag;
    const withinGap = (currTime - prevTime) < gapMs;

    if (sameOpponent && withinGap) {
      currentSet.gameIds.push(game.id);
      if (game.result === "win") currentSet.wins++;
      else if (game.result === "loss") currentSet.losses++;
      else currentSet.draws++;
      // Track all opponent characters used in the set
      if (game.opponent_character !== currentSet.opponentCharacter && !currentSet.opponentCharacter.includes(game.opponent_character)) {
        currentSet.opponentCharacter += `, ${game.opponent_character}`;
      }
    } else {
      sets.push(currentSet);
      currentSet = {
        opponentTag: game.opponent_tag,
        opponentCharacter: game.opponent_character,
        gameIds: [game.id],
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
  const games = database.prepare(`
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
  `).all(opponentKey, opponentKey) as OpponentDetailGame[];

  if (games.length === 0) return null;

  // Get the tag and connect code from the first game row
  const meta = database.prepare(`
    SELECT opponent_tag, opponent_connect_code
    FROM games
    WHERE opponent_connect_code = ? OR opponent_tag = ?
    ORDER BY played_at DESC
    LIMIT 1
  `).get(opponentKey, opponentKey) as { opponent_tag: string; opponent_connect_code: string | null } | undefined;

  if (!meta) return null;

  const wins = games.filter(g => g.result === "win").length;
  const losses = games.filter(g => g.result === "loss").length;

  // Stage breakdown
  const stageBreakdown = database.prepare(`
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
  `).all(opponentKey, opponentKey) as OpponentStageBreakdown[];

  // Character breakdown (opponent's characters)
  const characterBreakdown = database.prepare(`
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
  `).all(opponentKey, opponentKey) as OpponentCharacterBreakdown[];

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
    DELETE FROM practice_plans;
    DELETE FROM coaching_analyses;
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
  return getDb().prepare(`
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
  `).all() as CharacterOverview[];
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
  return getDb().prepare(`
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
  `).all(character) as CharacterMatchup[];
}

export interface CharacterStageStats {
  stage: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

export function getCharacterStageStats(character: string): CharacterStageStats[] {
  return getDb().prepare(`
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
  `).all(character) as CharacterStageStats[];
}

// ── Character signature stats ────────────────────────────────────────

export function insertSignatureStats(gameId: number, signatureJson: string): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO character_signature_stats (game_id, signature_json)
    VALUES (?, ?)
  `).run(gameId, signatureJson);
}

export function getCharacterSignatureAggregates(character: string): any {
  const rows = getDb().prepare(`
    SELECT css.signature_json
    FROM character_signature_stats css
    JOIN games g ON css.game_id = g.id
    WHERE g.player_character = ?
  `).all(character) as { signature_json: string }[];

  return rows.map(r => JSON.parse(r.signature_json));
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
}

export function getCharacterGameStats(character: string): CharacterGameStat[] {
  return getDb().prepare(`
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
      gs.dash_dance_frames as dashDanceFrames
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    WHERE g.player_character = ?
    ORDER BY g.played_at DESC
  `).all(character) as CharacterGameStat[];
}

// ── Player history for coaching context ──────────────────────────────

import type { PlayerHistory } from "./pipeline/types.js";
export type { PlayerHistory } from "./pipeline/types.js";

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
  const overallRecord = database.prepare(`
    SELECT
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames
    FROM games
    WHERE player_tag = ? OR player_connect_code = ?
  `).get(targetPlayer, targetPlayer) as { wins: number; losses: number; totalGames: number } | undefined;

  if (!overallRecord || overallRecord.totalGames === 0) {
    return null;
  }

  // Character win rates (player's own characters)
  const characterWinRates = database.prepare(`
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
  `).all(targetPlayer, targetPlayer) as PlayerHistory["characterWinRates"];

  // Top 3 most-played matchups with win rates
  const topMatchups = database.prepare(`
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
  `).all(targetPlayer, targetPlayer) as PlayerHistory["topMatchups"];

  // Recent stats (last N games) — subquery ensures LIMIT applies before aggregation
  const recentStats = database.prepare(`
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
  `).get(targetPlayer, targetPlayer, recentLimit) as PlayerHistory["recentStats"];

  // Overall stats (all games)
  const overallStats = database.prepare(`
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
  `).get(targetPlayer, targetPlayer) as PlayerHistory["overallStats"];

  // Current streak — walk recent results to count consecutive wins or losses
  const recentResults = database.prepare(`
    SELECT result
    FROM games
    WHERE (player_tag = ? OR player_connect_code = ?)
      AND played_at IS NOT NULL
    ORDER BY played_at DESC
    LIMIT 50
  `).all(targetPlayer, targetPlayer) as { result: string }[];

  let currentStreak: PlayerHistory["currentStreak"] = null;
  if (recentResults.length > 0) {
    const firstResult = recentResults[0]!.result;
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

export { DB_PATH, DATA_DIR };
