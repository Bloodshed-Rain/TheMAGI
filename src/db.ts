import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

// ── Database path ────────────────────────────────────────────────────

const DATA_DIR = path.join(os.homedir(), ".coach-clippi");
const DB_PATH = path.join(DATA_DIR, "coach-clippi.db");

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
    shield_pressure_entropy REAL NOT NULL
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
`;

// ── Database instance ────────────────────────────────────────────────

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    ensureDataDir();
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
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
      ledge_entropy, knockdown_entropy, shield_pressure_entropy
    ) VALUES (
      ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?
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
    "recovery_attempts",
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
  neutralWinRate: number;
  lCancelRate: number;
  openingsPerKill: number;
  avgDamagePerOpening: number;
  conversionRate: number;
  avgDeathPercent: number;
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
      gs.neutral_win_rate as neutralWinRate,
      gs.l_cancel_rate as lCancelRate,
      gs.openings_per_kill as openingsPerKill,
      gs.avg_damage_per_opening as avgDamagePerOpening,
      gs.conversion_rate as conversionRate,
      gs.avg_death_percent as avgDeathPercent
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
      if (game.result === "loss") currentSet.losses++;
    } else {
      sets.push(currentSet);
      currentSet = {
        opponentTag: game.opponent_tag,
        opponentCharacter: game.opponent_character,
        gameIds: [game.id],
        startedAt: game.played_at,
        wins: game.result === "win" ? 1 : 0,
        losses: game.result === "loss" ? 1 : 0,
      };
    }
  }
  sets.push(currentSet);

  return sets;
}

// ── Clear all data ───────────────────────────────────────────────────

export function clearAllGames(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM practice_plans;
    DELETE FROM coaching_analyses;
    DELETE FROM game_stats;
    DELETE FROM games;
    DELETE FROM sessions;
  `);
}

export { DB_PATH, DATA_DIR };
