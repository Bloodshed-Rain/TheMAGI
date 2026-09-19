import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import type { AggregateStats, PlayerHistory } from "./pipeline/index.js";
import type { CharacterEventProfile } from "./characterEventProfile.js";
import { moveIdToName } from "./pipeline/helpers.js";
import { buildReplaySearchTerms, buildReplaySignatureSearchKeys } from "./replaySearch.js";

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
    analysis_status TEXT NOT NULL DEFAULT 'ok' CHECK (analysis_status IN ('ok', 'failed', 'unavailable')),
    analysis_error TEXT,
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
    scope TEXT NOT NULL DEFAULT 'game',
    scope_identifier TEXT,
    title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_games_replay_hash ON games(replay_hash);
  CREATE INDEX IF NOT EXISTS idx_games_session_id ON games(session_id);
  CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at);
  CREATE INDEX IF NOT EXISTS idx_games_player_character ON games(player_character);
  CREATE INDEX IF NOT EXISTS idx_games_opponent_character ON games(opponent_character);
  CREATE INDEX IF NOT EXISTS idx_games_opponent_tag ON games(opponent_tag);
  CREATE INDEX IF NOT EXISTS idx_games_stage ON games(stage);
  CREATE INDEX IF NOT EXISTS idx_games_played_at_desc ON games(played_at DESC);
  CREATE INDEX IF NOT EXISTS idx_games_player_character_played_at ON games(player_character, played_at DESC);
  CREATE INDEX IF NOT EXISTS idx_games_opponent_connect_played_at ON games(opponent_connect_code, played_at DESC);
  CREATE INDEX IF NOT EXISTS idx_coaching_scope_identifier_created ON coaching_analyses(scope, scope_identifier, created_at DESC);

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

  CREATE TABLE IF NOT EXISTS training_log_entries (
    id INTEGER PRIMARY KEY,
    logged_at TEXT NOT NULL DEFAULT (datetime('now')),
    activity_type TEXT NOT NULL,
    minutes INTEGER NOT NULL DEFAULT 0,
    focus TEXT NOT NULL DEFAULT '',
    energy INTEGER,
    confidence INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS game_review_notes (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    author TEXT NOT NULL DEFAULT 'Player',
    category TEXT NOT NULL DEFAULT 'review',
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_training_log_logged_at ON training_log_entries(logged_at DESC);
  CREATE INDEX IF NOT EXISTS idx_game_review_notes_game ON game_review_notes(game_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS conversions (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    attacker_is_player INTEGER NOT NULL,
    start_frame INTEGER NOT NULL,
    end_frame INTEGER,
    start_percent REAL NOT NULL,
    end_percent REAL NOT NULL,
    damage REAL NOT NULL,
    move_count INTEGER NOT NULL,
    opener_move_id INTEGER,
    last_move_id INTEGER,
    opening_type TEXT NOT NULL,
    did_kill INTEGER NOT NULL DEFAULT 0,
    moves_json TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS stock_deaths (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    victim_is_player INTEGER NOT NULL,
    stock_number INTEGER NOT NULL,
    start_frame INTEGER NOT NULL,
    end_frame INTEGER,
    start_percent REAL NOT NULL,
    death_percent REAL,
    killer_move_id INTEGER,
    death_direction TEXT,
    died INTEGER NOT NULL DEFAULT 0,
    verdict TEXT,
    di_score REAL,
    stick_x REAL,
    stick_y REAL,
    launch_angle_deg REAL,
    resource_fault INTEGER NOT NULL DEFAULT 0,
    final_hit_frame INTEGER
  );

  CREATE TABLE IF NOT EXISTS throw_di (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    victim_is_player INTEGER NOT NULL,
    frame INTEGER NOT NULL,
    throw_direction TEXT NOT NULL,
    percent REAL NOT NULL,
    stick_x REAL NOT NULL,
    stick_y REAL NOT NULL,
    sector INTEGER NOT NULL,
    no_di INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_throw_di_game ON throw_di(game_id);
  CREATE INDEX IF NOT EXISTS idx_throw_di_lookup ON throw_di(victim_is_player, throw_direction);

  CREATE TABLE IF NOT EXISTS recovery_spans (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    recovering_is_player INTEGER NOT NULL,
    start_frame INTEGER NOT NULL,
    end_frame INTEGER NOT NULL,
    start_x REAL NOT NULL,
    start_y REAL NOT NULL,
    launch_quadrant TEXT NOT NULL,
    dj_frame INTEGER,
    dj_early INTEGER NOT NULL DEFAULT 0,
    route TEXT,
    upb_delay INTEGER,
    airdodge_used INTEGER NOT NULL DEFAULT 0,
    landing TEXT NOT NULL,
    edgeguarder_depth TEXT NOT NULL,
    edgeguarder_invincible_ledge_frames INTEGER NOT NULL DEFAULT 0,
    contested INTEGER NOT NULL DEFAULT 0,
    hit_during_recovery INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_recovery_spans_game ON recovery_spans(game_id);
  CREATE INDEX IF NOT EXISTS idx_recovery_spans_lookup ON recovery_spans(recovering_is_player, landing);

  CREATE TABLE IF NOT EXISTS shield_blocks (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    defender_is_player INTEGER NOT NULL,
    block_frame INTEGER NOT NULL,
    attack_kind TEXT NOT NULL,
    attack_label TEXT NOT NULL,
    defender_actionable_frame INTEGER,
    attacker_actionable_frame INTEGER,
    frame_gap INTEGER,
    in_grab_range INTEGER NOT NULL DEFAULT 0,
    choice TEXT,
    grade TEXT NOT NULL,
    string_id INTEGER NOT NULL,
    string_final INTEGER NOT NULL DEFAULT 1,
    punished_attacker INTEGER NOT NULL DEFAULT 0,
    got_hit INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_shield_blocks_game ON shield_blocks(game_id);
  CREATE INDEX IF NOT EXISTS idx_shield_blocks_lookup ON shield_blocks(defender_is_player, attack_label, grade);

  CREATE TABLE IF NOT EXISTS whiff_events (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    whiffer_is_player INTEGER NOT NULL,
    start_frame INTEGER NOT NULL,
    vulnerable_end_frame INTEGER NOT NULL,
    attack_label TEXT NOT NULL,
    attack_kind TEXT NOT NULL,
    min_distance REAL NOT NULL,
    opportunity INTEGER NOT NULL DEFAULT 0,
    punished INTEGER NOT NULL DEFAULT 0,
    reaction_delay INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_whiff_events_game ON whiff_events(game_id);
  CREATE INDEX IF NOT EXISTS idx_whiff_events_lookup ON whiff_events(whiffer_is_player, opportunity, attack_label);

  CREATE TABLE IF NOT EXISTS habit_instances (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    is_player INTEGER NOT NULL,
    situation TEXT NOT NULL,
    option TEXT NOT NULL,
    frame INTEGER NOT NULL,
    percent REAL NOT NULL,
    cornered INTEGER NOT NULL DEFAULT 0,
    pressured INTEGER NOT NULL DEFAULT 0,
    punished INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_conversions_game ON conversions(game_id);
  CREATE INDEX IF NOT EXISTS idx_conversions_attacker ON conversions(attacker_is_player, opening_type);
  CREATE INDEX IF NOT EXISTS idx_stock_deaths_game ON stock_deaths(game_id);
  CREATE INDEX IF NOT EXISTS idx_habit_instances_game ON habit_instances(game_id);
  CREATE INDEX IF NOT EXISTS idx_habit_instances_lookup ON habit_instances(is_player, situation, option);
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
  {
    version: 7,
    description: "Reclassify quit-out/timeout 'draw' games as win/loss from final stocks and percent",
    up: (db) => {
      // Historical imports marked every game where both players still had
      // stocks as a draw — which is every LRAS quit-out. The quitter's
      // identity wasn't stored, so infer the winner the same way the game
      // resolves timeouts: stock lead first, then lower percent. Exact ties
      // stay draws.
      db.exec(`
        UPDATE games SET result = CASE
          WHEN player_final_stocks > opponent_final_stocks THEN 'win'
          WHEN player_final_stocks < opponent_final_stocks THEN 'loss'
          WHEN CAST(player_final_percent AS INTEGER) < CAST(opponent_final_percent AS INTEGER) THEN 'win'
          WHEN CAST(player_final_percent AS INTEGER) > CAST(opponent_final_percent AS INTEGER) THEN 'loss'
          ELSE 'draw'
        END
        WHERE result = 'draw' AND end_method IN ('LRAS', 'timeout')
      `);
      // Games that clearly ran to completion (exactly one player at 0 stocks)
      // are decisive even when the replay lacked winner data.
      db.exec(`
        UPDATE games SET result = CASE WHEN player_final_stocks > 0 THEN 'win' ELSE 'loss' END
        WHERE result = 'draw'
          AND ((player_final_stocks = 0) + (opponent_final_stocks = 0)) = 1
      `);
    },
  },
  {
    version: 8,
    description: "Sub-30s quit-outs are false starts — revert them to draws",
    up: (db) => {
      // Mirrors FALSE_START_MAX_SECONDS in pipeline/helpers.ts and the
      // MIN_GAME_SECONDS handwarmer cutoff used by set detection: a quit
      // inside 30 seconds with both players alive is a restart, not a game.
      db.exec(`
        UPDATE games SET result = 'draw'
        WHERE end_method = 'LRAS'
          AND duration_seconds < 30
          AND player_final_stocks > 0 AND opponent_final_stocks > 0
          AND result IN ('win', 'loss')
      `);
    },
  },
  {
    version: 9,
    description: "Add training log and per-game review notes",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS training_log_entries (
          id INTEGER PRIMARY KEY,
          logged_at TEXT NOT NULL DEFAULT (datetime('now')),
          activity_type TEXT NOT NULL,
          minutes INTEGER NOT NULL DEFAULT 0,
          focus TEXT NOT NULL DEFAULT '',
          energy INTEGER,
          confidence INTEGER,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS game_review_notes (
          id INTEGER PRIMARY KEY,
          game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          author TEXT NOT NULL DEFAULT 'Player',
          category TEXT NOT NULL DEFAULT 'review',
          content TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_training_log_logged_at ON training_log_entries(logged_at DESC);
        CREATE INDEX IF NOT EXISTS idx_game_review_notes_game ON game_review_notes(game_id, created_at DESC);
      `);
    },
  },
  {
    version: 10,
    description: "Add per-instance event tables: conversions, stock_deaths, habit_instances",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS conversions (
          id INTEGER PRIMARY KEY,
          game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          attacker_is_player INTEGER NOT NULL,
          start_frame INTEGER NOT NULL,
          end_frame INTEGER,
          start_percent REAL NOT NULL,
          end_percent REAL NOT NULL,
          damage REAL NOT NULL,
          move_count INTEGER NOT NULL,
          opener_move_id INTEGER,
          last_move_id INTEGER,
          opening_type TEXT NOT NULL,
          did_kill INTEGER NOT NULL DEFAULT 0,
          moves_json TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS stock_deaths (
          id INTEGER PRIMARY KEY,
          game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          victim_is_player INTEGER NOT NULL,
          stock_number INTEGER NOT NULL,
          start_frame INTEGER NOT NULL,
          end_frame INTEGER,
          start_percent REAL NOT NULL,
          death_percent REAL,
          killer_move_id INTEGER,
          death_direction TEXT,
          died INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS habit_instances (
          id INTEGER PRIMARY KEY,
          game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          is_player INTEGER NOT NULL,
          situation TEXT NOT NULL,
          option TEXT NOT NULL,
          frame INTEGER NOT NULL,
          percent REAL NOT NULL,
          cornered INTEGER NOT NULL DEFAULT 0,
          pressured INTEGER NOT NULL DEFAULT 0,
          punished INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_conversions_game ON conversions(game_id);
        CREATE INDEX IF NOT EXISTS idx_conversions_attacker ON conversions(attacker_is_player, opening_type);
        CREATE INDEX IF NOT EXISTS idx_stock_deaths_game ON stock_deaths(game_id);
        CREATE INDEX IF NOT EXISTS idx_habit_instances_game ON habit_instances(game_id);
        CREATE INDEX IF NOT EXISTS idx_habit_instances_lookup ON habit_instances(is_player, situation, option);
      `);
    },
  },
  {
    version: 11,
    description: "Add measured-DI columns to stock_deaths and the throw_di table",
    up: (db) => {
      const columns = db.pragma("table_info(stock_deaths)") as { name: string }[];
      if (!columns.some((c) => c.name === "verdict")) {
        db.exec(`
          ALTER TABLE stock_deaths ADD COLUMN verdict TEXT;
          ALTER TABLE stock_deaths ADD COLUMN di_score REAL;
          ALTER TABLE stock_deaths ADD COLUMN stick_x REAL;
          ALTER TABLE stock_deaths ADD COLUMN stick_y REAL;
          ALTER TABLE stock_deaths ADD COLUMN launch_angle_deg REAL;
          ALTER TABLE stock_deaths ADD COLUMN resource_fault INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE stock_deaths ADD COLUMN final_hit_frame INTEGER;
        `);
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS throw_di (
          id INTEGER PRIMARY KEY,
          game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          victim_is_player INTEGER NOT NULL,
          frame INTEGER NOT NULL,
          throw_direction TEXT NOT NULL,
          percent REAL NOT NULL,
          stick_x REAL NOT NULL,
          stick_y REAL NOT NULL,
          sector INTEGER NOT NULL,
          no_di INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_throw_di_game ON throw_di(game_id);
        CREATE INDEX IF NOT EXISTS idx_throw_di_lookup ON throw_di(victim_is_player, throw_direction);
      `);
    },
  },
  {
    version: 12,
    description: "Add recovery_spans table (recovery blueprint + edgeguard commitment)",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS recovery_spans (
          id INTEGER PRIMARY KEY,
          game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          recovering_is_player INTEGER NOT NULL,
          start_frame INTEGER NOT NULL,
          end_frame INTEGER NOT NULL,
          start_x REAL NOT NULL,
          start_y REAL NOT NULL,
          launch_quadrant TEXT NOT NULL,
          dj_frame INTEGER,
          dj_early INTEGER NOT NULL DEFAULT 0,
          route TEXT,
          upb_delay INTEGER,
          airdodge_used INTEGER NOT NULL DEFAULT 0,
          landing TEXT NOT NULL,
          edgeguarder_depth TEXT NOT NULL,
          edgeguarder_invincible_ledge_frames INTEGER NOT NULL DEFAULT 0,
          contested INTEGER NOT NULL DEFAULT 0,
          hit_during_recovery INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_recovery_spans_game ON recovery_spans(game_id);
        CREATE INDEX IF NOT EXISTS idx_recovery_spans_lookup ON recovery_spans(recovering_is_player, landing);
      `);
    },
  },
  {
    version: 13,
    description: "Add shield_blocks table (shield frame-gap audit)",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS shield_blocks (
          id INTEGER PRIMARY KEY,
          game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          defender_is_player INTEGER NOT NULL,
          block_frame INTEGER NOT NULL,
          attack_kind TEXT NOT NULL,
          attack_label TEXT NOT NULL,
          defender_actionable_frame INTEGER,
          attacker_actionable_frame INTEGER,
          frame_gap INTEGER,
          in_grab_range INTEGER NOT NULL DEFAULT 0,
          choice TEXT,
          grade TEXT NOT NULL,
          string_id INTEGER NOT NULL,
          string_final INTEGER NOT NULL DEFAULT 1,
          punished_attacker INTEGER NOT NULL DEFAULT 0,
          got_hit INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_shield_blocks_game ON shield_blocks(game_id);
        CREATE INDEX IF NOT EXISTS idx_shield_blocks_lookup ON shield_blocks(defender_is_player, attack_label, grade);
      `);
    },
  },
  {
    version: 14,
    description: "Add whiff_events table (whiff-punish ledger)",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS whiff_events (
          id INTEGER PRIMARY KEY,
          game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          whiffer_is_player INTEGER NOT NULL,
          start_frame INTEGER NOT NULL,
          vulnerable_end_frame INTEGER NOT NULL,
          attack_label TEXT NOT NULL,
          attack_kind TEXT NOT NULL,
          min_distance REAL NOT NULL,
          opportunity INTEGER NOT NULL DEFAULT 0,
          punished INTEGER NOT NULL DEFAULT 0,
          reaction_delay INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_whiff_events_game ON whiff_events(game_id);
        CREATE INDEX IF NOT EXISTS idx_whiff_events_lookup ON whiff_events(whiffer_is_player, opportunity, attack_label);
      `);
    },
  },
  {
    version: 15,
    description: "Fail-closed analysis_status on games — never treat failed analysis as real stats",
    up: (db) => {
      const columns = db.pragma("table_info(games)") as { name: string }[];
      if (!columns.some((c) => c.name === "analysis_status")) {
        db.exec(
          "ALTER TABLE games ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'ok' CHECK (analysis_status IN ('ok', 'failed', 'unavailable'))",
        );
      }
      if (!columns.some((c) => c.name === "analysis_error")) {
        db.exec("ALTER TABLE games ADD COLUMN analysis_error TEXT");
      }
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_games_analysis_status ON games(analysis_status)",
      );
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

/** True only when a successful analysis (with real stats) already exists for this hash. */
export function successfulReplayExists(hash: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM games WHERE replay_hash = ? AND analysis_status = 'ok'")
    .get(hash);
  return row !== undefined;
}

/**
 * Remove a prior fail-closed row so a re-import can replace it with real stats.
 * No-op when the hash is already ok or missing.
 */
export function deleteFailedGameByHash(hash: string): boolean {
  const row = getDb()
    .prepare("SELECT id, analysis_status as analysisStatus FROM games WHERE replay_hash = ?")
    .get(hash) as { id: number; analysisStatus: string } | undefined;
  if (!row || row.analysisStatus === "ok") return false;
  // game_stats / child tables cascade or are absent for failed rows
  getDb().prepare("DELETE FROM games WHERE id = ?").run(row.id);
  return true;
}

export type AnalysisStatus = "ok" | "failed" | "unavailable";

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
  /** Defaults to 'ok'. Failed / unavailable rows must not carry success-shaped game_stats. */
  analysisStatus?: AnalysisStatus;
  analysisError?: string | null;
}

export function insertGame(params: InsertGameParams): number {
  const analysisStatus: AnalysisStatus = params.analysisStatus ?? "ok";
  const analysisError = params.analysisError ?? null;

  const stmt = getDb().prepare(`
    INSERT INTO games (
      session_id, replay_path, replay_hash, played_at,
      stage, duration_seconds,
      player_character, opponent_character,
      player_tag, player_connect_code, opponent_tag, opponent_connect_code,
      result, end_method,
      player_final_stocks, player_final_percent,
      opponent_final_stocks, opponent_final_percent,
      game_number,
      analysis_status, analysis_error
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?,
      ?, ?
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
    analysisStatus,
    analysisError,
  );

  return Number(result.lastInsertRowid);
}

/**
 * Persist a fail-closed game row with NO game_stats.
 * Used when Slippi analysis fails or the target player cannot be matched —
 * so Magi never stores zeros that look like real L-cancel / conversion rates.
 */
export function insertFailedGameAnalysis(params: {
  sessionId?: number | null;
  replayPath: string;
  replayHash: string;
  playedAt?: string | null;
  analysisStatus?: Exclude<AnalysisStatus, "ok">;
  analysisError: string;
  playerTag?: string | null;
}): number {
  const status = params.analysisStatus ?? "failed";
  const err = params.analysisError.length > 500 ? params.analysisError.slice(0, 497) + "..." : params.analysisError;
  return insertGame({
    sessionId: params.sessionId ?? null,
    replayPath: params.replayPath,
    replayHash: params.replayHash,
    playedAt: params.playedAt ?? null,
    stage: "Unknown",
    durationSeconds: 0,
    playerCharacter: "Unknown",
    opponentCharacter: "Unknown",
    playerTag: params.playerTag?.trim() || "Unknown",
    playerConnectCode: null,
    opponentTag: "Unknown",
    opponentConnectCode: null,
    result: "draw",
    endMethod: "unknown",
    playerFinalStocks: 0,
    playerFinalPercent: 0,
    opponentFinalStocks: 0,
    opponentFinalPercent: 0,
    gameNumber: 1,
    analysisStatus: status,
    analysisError: err,
  });
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

// ── Per-instance event persistence (Phase 0 decision-grading infra) ──
// Rows come from pipeline frameEvents; the caller maps player slots to
// the target-player perspective and runs these inside its transaction.

export interface ConversionEventRow {
  attackerIsPlayer: boolean;
  startFrame: number;
  endFrame: number | null;
  startPercent: number;
  endPercent: number;
  damage: number;
  moveCount: number;
  openerMoveId: number | null;
  lastMoveId: number | null;
  openingType: string;
  didKill: boolean;
  movesJson: string;
}

export function insertConversionEvents(gameId: number, rows: ConversionEventRow[]): void {
  if (rows.length === 0) return;
  const stmt = getDb().prepare(`
    INSERT INTO conversions (
      game_id, attacker_is_player, start_frame, end_frame,
      start_percent, end_percent, damage, move_count,
      opener_move_id, last_move_id, opening_type, did_kill, moves_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      gameId,
      r.attackerIsPlayer ? 1 : 0,
      r.startFrame,
      r.endFrame,
      r.startPercent,
      r.endPercent,
      r.damage,
      r.moveCount,
      r.openerMoveId,
      r.lastMoveId,
      r.openingType,
      r.didKill ? 1 : 0,
      r.movesJson,
    );
  }
}

export interface StockDeathRow {
  victimIsPlayer: boolean;
  stockNumber: number;
  startFrame: number;
  endFrame: number | null;
  startPercent: number;
  deathPercent: number | null;
  killerMoveId: number | null;
  deathDirection: string | null;
  died: boolean;
  verdict: string | null;
  diScore: number | null;
  stickX: number | null;
  stickY: number | null;
  launchAngleDeg: number | null;
  resourceFault: boolean;
  finalHitFrame: number | null;
}

export function insertStockDeaths(gameId: number, rows: StockDeathRow[]): void {
  if (rows.length === 0) return;
  const stmt = getDb().prepare(`
    INSERT INTO stock_deaths (
      game_id, victim_is_player, stock_number, start_frame, end_frame,
      start_percent, death_percent, killer_move_id, death_direction, died,
      verdict, di_score, stick_x, stick_y, launch_angle_deg, resource_fault, final_hit_frame
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      gameId,
      r.victimIsPlayer ? 1 : 0,
      r.stockNumber,
      r.startFrame,
      r.endFrame,
      r.startPercent,
      r.deathPercent,
      r.killerMoveId,
      r.deathDirection,
      r.died ? 1 : 0,
      r.verdict,
      r.diScore,
      r.stickX,
      r.stickY,
      r.launchAngleDeg,
      r.resourceFault ? 1 : 0,
      r.finalHitFrame,
    );
  }
}

export interface ThrowDIRow {
  victimIsPlayer: boolean;
  frame: number;
  throwDirection: string;
  percent: number;
  stickX: number;
  stickY: number;
  sector: number;
  noDI: boolean;
}

export function insertThrowDIRows(gameId: number, rows: ThrowDIRow[]): void {
  if (rows.length === 0) return;
  const stmt = getDb().prepare(`
    INSERT INTO throw_di (
      game_id, victim_is_player, frame, throw_direction, percent, stick_x, stick_y, sector, no_di
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      gameId,
      r.victimIsPlayer ? 1 : 0,
      r.frame,
      r.throwDirection,
      r.percent,
      r.stickX,
      r.stickY,
      r.sector,
      r.noDI ? 1 : 0,
    );
  }
}

export interface RecoverySpanRow {
  recoveringIsPlayer: boolean;
  startFrame: number;
  endFrame: number;
  startX: number;
  startY: number;
  launchQuadrant: string;
  djFrame: number | null;
  djEarly: boolean;
  route: string | null;
  upbDelay: number | null;
  airdodgeUsed: boolean;
  landing: string;
  edgeguarderDepth: string;
  edgeguarderInvincibleLedgeFrames: number;
  contested: boolean;
  hitDuringRecovery: boolean;
}

export function insertRecoverySpans(gameId: number, rows: RecoverySpanRow[]): void {
  if (rows.length === 0) return;
  const stmt = getDb().prepare(`
    INSERT INTO recovery_spans (
      game_id, recovering_is_player, start_frame, end_frame, start_x, start_y,
      launch_quadrant, dj_frame, dj_early, route, upb_delay, airdodge_used,
      landing, edgeguarder_depth, edgeguarder_invincible_ledge_frames, contested, hit_during_recovery
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      gameId,
      r.recoveringIsPlayer ? 1 : 0,
      r.startFrame,
      r.endFrame,
      r.startX,
      r.startY,
      r.launchQuadrant,
      r.djFrame,
      r.djEarly ? 1 : 0,
      r.route,
      r.upbDelay,
      r.airdodgeUsed ? 1 : 0,
      r.landing,
      r.edgeguarderDepth,
      r.edgeguarderInvincibleLedgeFrames,
      r.contested ? 1 : 0,
      r.hitDuringRecovery ? 1 : 0,
    );
  }
}

export interface ShieldBlockRow {
  defenderIsPlayer: boolean;
  blockFrame: number;
  attackKind: string;
  attackLabel: string;
  defenderActionableFrame: number | null;
  attackerActionableFrame: number | null;
  frameGap: number | null;
  inGrabRange: boolean;
  choice: string | null;
  grade: string;
  stringId: number;
  stringFinal: boolean;
  punishedAttacker: boolean;
  gotHit: boolean;
}

export function insertShieldBlocks(gameId: number, rows: ShieldBlockRow[]): void {
  if (rows.length === 0) return;
  const stmt = getDb().prepare(`
    INSERT INTO shield_blocks (
      game_id, defender_is_player, block_frame, attack_kind, attack_label,
      defender_actionable_frame, attacker_actionable_frame, frame_gap, in_grab_range,
      choice, grade, string_id, string_final, punished_attacker, got_hit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      gameId,
      r.defenderIsPlayer ? 1 : 0,
      r.blockFrame,
      r.attackKind,
      r.attackLabel,
      r.defenderActionableFrame,
      r.attackerActionableFrame,
      r.frameGap,
      r.inGrabRange ? 1 : 0,
      r.choice,
      r.grade,
      r.stringId,
      r.stringFinal ? 1 : 0,
      r.punishedAttacker ? 1 : 0,
      r.gotHit ? 1 : 0,
    );
  }
}

export interface WhiffEventRow {
  whifferIsPlayer: boolean;
  startFrame: number;
  vulnerableEndFrame: number;
  attackLabel: string;
  attackKind: string;
  minDistance: number;
  opportunity: boolean;
  punished: boolean;
  reactionDelay: number | null;
}

export function insertWhiffEvents(gameId: number, rows: WhiffEventRow[]): void {
  if (rows.length === 0) return;
  const stmt = getDb().prepare(`
    INSERT INTO whiff_events (
      game_id, whiffer_is_player, start_frame, vulnerable_end_frame,
      attack_label, attack_kind, min_distance, opportunity, punished, reaction_delay
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      gameId,
      r.whifferIsPlayer ? 1 : 0,
      r.startFrame,
      r.vulnerableEndFrame,
      r.attackLabel,
      r.attackKind,
      r.minDistance,
      r.opportunity ? 1 : 0,
      r.punished ? 1 : 0,
      r.reactionDelay,
    );
  }
}

// ── Backfill support ─────────────────────────────────────────────────

export interface BackfillCandidate {
  id: number;
  replayPath: string;
  replayHash: string;
  playerTag: string;
}

/**
 * Games whose per-instance event rows are missing (or all games when
 * `all` is true). stock_deaths is the marker table: every successfully
 * parsed game writes at least two stock records, so absence = never
 * backfilled.
 */
export function getBackfillCandidates(all: boolean, limit?: number): BackfillCandidate[] {
  const where = all ? "" : "WHERE NOT EXISTS (SELECT 1 FROM stock_deaths sd WHERE sd.game_id = g.id)";
  const limitSql = limit != null && limit > 0 ? `LIMIT ${Math.floor(limit)}` : "";
  const rows = getDb()
    .prepare(
      `SELECT g.id as id, g.replay_path as replayPath, g.replay_hash as replayHash, g.player_tag as playerTag
       FROM games g ${where} ORDER BY g.id ${limitSql}`,
    )
    .all() as BackfillCandidate[];
  return rows;
}

/** Remove all per-instance event rows for a game (before re-inserting). */
export function deleteFrameEventRows(gameId: number): void {
  const db = getDb();
  for (const table of [
    "conversions",
    "stock_deaths",
    "habit_instances",
    "throw_di",
    "recovery_spans",
    "shield_blocks",
    "whiff_events",
  ]) {
    db.prepare(`DELETE FROM ${table} WHERE game_id = ?`).run(gameId);
  }
}

export interface HabitInstanceRow {
  isPlayer: boolean;
  situation: string;
  option: string;
  frame: number;
  percent: number;
  cornered: boolean;
  pressured: boolean;
  punished: boolean;
}

export function insertHabitInstances(gameId: number, rows: HabitInstanceRow[]): void {
  if (rows.length === 0) return;
  const stmt = getDb().prepare(`
    INSERT INTO habit_instances (
      game_id, is_player, situation, option, frame, percent, cornered, pressured, punished
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      gameId,
      r.isPlayer ? 1 : 0,
      r.situation,
      r.option,
      r.frame,
      r.percent,
      r.cornered ? 1 : 0,
      r.pressured ? 1 : 0,
      r.punished ? 1 : 0,
    );
  }
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
    winRate: stats.wins + stats.losses > 0 ? stats.wins / (stats.wins + stats.losses) : 0,
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
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  /** True when analysis_status is ok AND game_stats row exists */
  statsAvailable: boolean;
  // game_stats — null/undefined when analysis failed or unavailable
  neutralWins: number | null;
  neutralLosses: number | null;
  neutralWinRate: number | null;
  counterHits: number | null;
  openingsPerKill: number | null;
  totalOpenings: number | null;
  totalConversions: number | null;
  conversionRate: number | null;
  avgDamagePerOpening: number | null;
  killConversions: number | null;
  lCancelRate: number | null;
  wavedashCount: number | null;
  dashDanceFrames: number | null;
  avgStagePositionX: number | null;
  timeOnPlatform: number | null;
  timeInAir: number | null;
  timeAtLedge: number | null;
  totalDamageTaken: number | null;
  totalDamageDealt: number | null;
  avgDeathPercent: number | null;
  recoveryAttempts: number | null;
  recoverySuccessRate: number | null;
  ledgeEntropy: number | null;
  knockdownEntropy: number | null;
  shieldPressureEntropy: number | null;
  powerShieldCount: number | null;
  edgeguardAttempts: number | null;
  edgeguardSuccessRate: number | null;
  shieldPressureSequences: number | null;
  shieldPressureAvgDamage: number | null;
  shieldBreaks: number | null;
  shieldPokeRate: number | null;
  diSurvivalScore: number | null;
  diComboScore: number | null;
  diAvgComboLengthReceived: number | null;
  diAvgComboLengthDealt: number | null;
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
      g.analysis_status as analysisStatus,
      g.analysis_error as analysisError,
      CASE WHEN g.analysis_status = 'ok' AND gs.game_id IS NOT NULL THEN 1 ELSE 0 END as statsAvailable,
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
    LEFT JOIN game_stats gs ON gs.game_id = g.id
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

  const statsFlag = (row as { statsAvailable?: number }).statsAvailable;
  return {
    ...row,
    statsAvailable: Boolean(statsFlag),
    analysisStatus: (row as { analysisStatus?: AnalysisStatus }).analysisStatus ?? "ok",
    analysisError: (row as { analysisError?: string | null }).analysisError ?? null,
    coachingAnalyses: analyses,
  };
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
    WHERE g.analysis_status = 'ok' AND g.result IN ('win', 'loss')
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
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate
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
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate
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
    WHERE analysis_status = 'ok'
  `,
    )
    .get() as { wins: number | null; losses: number | null; totalGames: number };
  return {
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    totalGames: row.totalGames ?? 0,
  };
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
           ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate,
           COUNT(*) as games
    FROM games g
    GROUP BY g.player_character
    HAVING SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END) >= 3
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
           ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate,
           COUNT(*) as games
    FROM games g
    GROUP BY g.opponent_character
    HAVING SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END) >= 3
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
           ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate,
           COUNT(*) as games
    FROM games g
    GROUP BY g.opponent_character
    HAVING SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END) >= 3
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
           ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate,
           COUNT(*) as games
    FROM games g
    GROUP BY g.stage
    HAVING SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END) >= 3
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
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  statsAvailable: boolean;
  /** Null when analysis failed / unavailable — UI must show empty/error, not 0%. */
  neutralWinRate: number | null;
  lCancelRate: number | null;
  openingsPerKill: number | null;
  avgDamagePerOpening: number | null;
  conversionRate: number | null;
  avgDeathPercent: number | null;
  powerShieldCount: number | null;
  edgeguardAttempts: number | null;
  edgeguardSuccessRate: number | null;
  recoverySuccessRate: number | null;
  totalDamageDealt: number | null;
  totalDamageTaken: number | null;
  wavedashCount: number | null;
  dashDanceFrames: number | null;
  killMove: string | null;
}

export function getRecentGames(limit: number = 100): RecentGame[] {
  const rows = getDb()
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
      g.analysis_status as analysisStatus,
      g.analysis_error as analysisError,
      CASE WHEN g.analysis_status = 'ok' AND gs.game_id IS NOT NULL THEN 1 ELSE 0 END as statsAvailableFlag,
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
    LEFT JOIN game_stats gs ON gs.game_id = g.id
    ORDER BY g.played_at DESC
    LIMIT ?
  `,
    )
    .all(limit) as Array<Omit<RecentGame, "statsAvailable"> & { statsAvailableFlag: number }>;

  return rows.map(({ statsAvailableFlag, ...rest }) => ({
    ...rest,
    analysisStatus: rest.analysisStatus ?? "ok",
    analysisError: rest.analysisError ?? null,
    statsAvailable: Boolean(statsAvailableFlag),
  }));
}

export interface LibraryGameFilters {
  search?: string;
  char?: string;
  stage?: string;
  result?: string;
  limit?: number;
  offset?: number;
}

export interface LibraryGamesPage {
  games: LibraryGameResult[];
  total: number;
  totalUnfiltered: number;
  wins: number;
  losses: number;
  uniqueOpponents: number;
  charactersPlayed: number;
  characters: string[];
  stages: string[];
}

export interface LibrarySearchMatch {
  id: number;
  type: string;
  label: string;
  description: string;
  startFrame: number;
  timestamp: string;
  didKill: boolean;
}

export type LibraryGameResult = RecentGame & {
  searchMatches: LibrarySearchMatch[];
  searchTechniqueMatch: boolean;
};

function normalizedSearchSql(expression: string): string {
  return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(${expression}, '-', ' '), '_', ' '), '#', ' '), '.', ' '))`;
}

function buildHighlightSearchPredicate(alias: string, searchTerms: string[]): { predicate: string; params: string[] } {
  const fields = ["type", "label", "description", "character", "victim", "moves_json"];
  const clauses: string[] = [];
  const params: string[] = [];

  for (const term of searchTerms) {
    for (const field of fields) {
      clauses.push(`${normalizedSearchSql(`${alias}.${field}`)} LIKE ?`);
      params.push(`%${term}%`);
    }
  }

  return { predicate: clauses.length > 0 ? `(${clauses.join(" OR ")})` : "0", params };
}

function buildSignatureSearchPredicate(alias: string, signatureKeys: string[]): string {
  const safeKeys = signatureKeys.filter((key) => /^[A-Za-z][A-Za-z0-9]*$/.test(key));
  if (safeKeys.length === 0) return "0";
  return `(${safeKeys
    .map((key) => `COALESCE(CAST(json_extract(${alias}.signature_json, '$.${key}') AS REAL), 0) > 0`)
    .join(" OR ")})`;
}

function buildLibraryWhere(filters: LibraryGameFilters): {
  where: string;
  params: string[];
  searchTerms: string[];
  signatureKeys: string[];
} {
  const conditions: string[] = [];
  const params: string[] = [];
  const search = filters.search?.trim();
  const searchTerms = buildReplaySearchTerms(search ?? "");
  const signatureKeys = buildReplaySignatureSearchKeys(search ?? "");

  if (search) {
    const gameFields = ["opponent_tag", "opponent_connect_code", "player_character", "opponent_character", "stage"];
    const searchClauses = ["g.opponent_tag LIKE ?", "g.opponent_connect_code LIKE ?"];
    const searchParams = [`%${search}%`, `%${search}%`];

    for (const term of searchTerms) {
      for (const field of gameFields) {
        searchClauses.push(`${normalizedSearchSql(`g.${field}`)} LIKE ?`);
        searchParams.push(`%${term}%`);
      }
    }

    const highlightSearch = buildHighlightSearchPredicate("hs", searchTerms);
    searchClauses.push(`EXISTS (SELECT 1 FROM highlights hs WHERE hs.game_id = g.id AND ${highlightSearch.predicate})`);
    searchParams.push(...highlightSearch.params);
    if (signatureKeys.length > 0) {
      searchClauses.push(
        `EXISTS (SELECT 1 FROM character_signature_stats css WHERE css.game_id = g.id AND ${buildSignatureSearchPredicate("css", signatureKeys)})`,
      );
    }
    conditions.push(`(${searchClauses.join(" OR ")})`);
    params.push(...searchParams);
  }
  if (filters.char && filters.char !== "all") {
    conditions.push("g.opponent_character = ?");
    params.push(filters.char);
  }
  if (filters.stage && filters.stage !== "all") {
    conditions.push("g.stage = ?");
    params.push(filters.stage);
  }
  if (filters.result && filters.result !== "all") {
    conditions.push("g.result = ?");
    params.push(filters.result);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
    searchTerms,
    signatureKeys,
  };
}

function getLibrarySearchMatches(gameIds: number[], searchTerms: string[]): Map<number, LibrarySearchMatch[]> {
  const matchesByGame = new Map<number, LibrarySearchMatch[]>();
  if (gameIds.length === 0 || searchTerms.length === 0) return matchesByGame;

  const placeholders = gameIds.map(() => "?").join(", ");
  const highlightSearch = buildHighlightSearchPredicate("h", searchTerms);
  const rows = getDb()
    .prepare(
      `
      SELECT h.id, h.game_id as gameId, h.type, h.label, h.description,
             h.start_frame as startFrame, h.timestamp, h.did_kill as didKill
      FROM highlights h
      WHERE h.game_id IN (${placeholders})
        AND ${highlightSearch.predicate}
      ORDER BY h.game_id, h.start_frame ASC
    `,
    )
    .all(...gameIds, ...highlightSearch.params) as Array<
    Omit<LibrarySearchMatch, "didKill"> & {
      gameId: number;
      didKill: number;
    }
  >;

  for (const row of rows) {
    const current = matchesByGame.get(row.gameId) ?? [];
    current.push({
      id: row.id,
      type: row.type,
      label: row.label,
      description: row.description,
      startFrame: row.startFrame,
      timestamp: row.timestamp,
      didKill: row.didKill === 1,
    });
    matchesByGame.set(row.gameId, current);
  }
  return matchesByGame;
}

function getLibraryTechniqueMatchGameIds(gameIds: number[], signatureKeys: string[]): Set<number> {
  if (gameIds.length === 0 || signatureKeys.length === 0) return new Set();
  const placeholders = gameIds.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `
      SELECT css.game_id as gameId
      FROM character_signature_stats css
      WHERE css.game_id IN (${placeholders})
        AND ${buildSignatureSearchPredicate("css", signatureKeys)}
    `,
    )
    .all(...gameIds) as Array<{ gameId: number }>;
  return new Set(rows.map((row) => row.gameId));
}

export function getLibraryGames(filters: LibraryGameFilters = {}): LibraryGamesPage {
  const db = getDb();
  const { where, params, searchTerms, signatureKeys } = buildLibraryWhere(filters);
  const limit = Math.min(Math.max(Math.floor(filters.limit ?? 100), 1), 250);
  const offset = Math.max(Math.floor(filters.offset ?? 0), 0);

  const totalUnfiltered = (db.prepare("SELECT COUNT(*) as total FROM games").get() as { total: number }).total;

  const summary = db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN g.analysis_status = 'ok' AND g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.analysis_status = 'ok' AND g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(DISTINCT CASE WHEN g.analysis_status = 'ok' THEN COALESCE(g.opponent_connect_code, g.opponent_tag) END) as uniqueOpponents,
      COUNT(DISTINCT CASE WHEN g.analysis_status = 'ok' THEN g.player_character END) as charactersPlayed
    FROM games g
    ${where}
  `,
    )
    .get(...params) as {
    total: number;
    wins: number | null;
    losses: number | null;
    uniqueOpponents: number;
    charactersPlayed: number;
  };

  const gameRows = db
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
      g.analysis_status as analysisStatus,
      g.analysis_error as analysisError,
      CASE WHEN g.analysis_status = 'ok' AND gs.game_id IS NOT NULL THEN 1 ELSE 0 END as statsAvailableFlag,
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
    LEFT JOIN game_stats gs ON gs.game_id = g.id
    ${where}
    ORDER BY g.played_at DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(...params, limit, offset) as Array<Omit<RecentGame, "statsAvailable"> & { statsAvailableFlag: number }>;

  const games: RecentGame[] = gameRows.map(({ statsAvailableFlag, ...rest }) => ({
    ...rest,
    analysisStatus: rest.analysisStatus ?? "ok",
    analysisError: rest.analysisError ?? null,
    statsAvailable: Boolean(statsAvailableFlag),
  }));

  const searchMatches = getLibrarySearchMatches(
    games.map((game) => game.id),
    searchTerms,
  );
  const techniqueMatchGameIds = getLibraryTechniqueMatchGameIds(
    games.map((game) => game.id),
    signatureKeys,
  );
  const gamesWithMatches: LibraryGameResult[] = games.map((game) => ({
    ...game,
    searchMatches: searchMatches.get(game.id) ?? [],
    searchTechniqueMatch: techniqueMatchGameIds.has(game.id),
  }));

  const characters = db
    .prepare(
      `
    SELECT DISTINCT opponent_character as value
    FROM games
    ORDER BY opponent_character ASC
  `,
    )
    .all()
    .map((row: any) => row.value as string);

  const stages = db
    .prepare(
      `
    SELECT DISTINCT stage as value
    FROM games
    ORDER BY stage ASC
  `,
    )
    .all()
    .map((row: any) => row.value as string);

  return {
    games: gamesWithMatches,
    total: summary?.total ?? 0,
    totalUnfiltered,
    wins: summary?.wins ?? 0,
    losses: summary?.losses ?? 0,
    uniqueOpponents: summary?.uniqueOpponents ?? 0,
    charactersPlayed: summary?.charactersPlayed ?? 0,
    characters,
    stages,
  };
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
  const search = opponent?.trim();
  const query = `
    WITH opponent_records AS (
      SELECT
        opponent_tag as opponentTag,
        opponent_connect_code as opponentConnectCode,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
        COUNT(*) as totalGames,
        ROUND(CAST(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate,
        GROUP_CONCAT(DISTINCT opponent_character) as characters,
        MAX(played_at) as lastPlayed
      FROM games
      GROUP BY COALESCE(opponent_connect_code, opponent_tag)
    )
    SELECT *
    FROM opponent_records
    ${
      search
        ? `
    WHERE opponentTag LIKE ? OR opponentConnectCode LIKE ? OR characters LIKE ?`
        : ""
    }
    ORDER BY totalGames DESC
  `;

  if (!search) return getDb().prepare(query).all() as OpponentRecord[];

  const likeSearch = `%${search}%`;
  return getDb().prepare(query).all(likeSearch, likeSearch, likeSearch) as OpponentRecord[];
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
  avgNeutralWinRate: number;
  avgLCancelRate: number;
  avgOpeningsPerKill: number;
  avgEdgeguardSuccessRate: number;
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

  const summary = database
    .prepare(
      `
    SELECT
      SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames,
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate,
      ROUND(AVG(gs.neutral_win_rate), 4) as avgNeutralWinRate,
      ROUND(AVG(gs.l_cancel_rate), 4) as avgLCancelRate,
      ROUND(AVG(gs.openings_per_kill), 2) as avgOpeningsPerKill,
      ROUND(AVG(gs.edgeguard_success_rate), 4) as avgEdgeguardSuccessRate
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    WHERE g.opponent_connect_code = ? OR g.opponent_tag = ?
  `,
    )
    .get(opponentKey, opponentKey) as {
    wins: number | null;
    losses: number | null;
    totalGames: number;
    winRate: number | null;
    avgNeutralWinRate: number | null;
    avgLCancelRate: number | null;
    avgOpeningsPerKill: number | null;
    avgEdgeguardSuccessRate: number | null;
  };

  if (!summary || summary.totalGames === 0) return null;

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
    LIMIT 50
  `,
    )
    .all(opponentKey, opponentKey) as OpponentDetailGame[];

  // Stage breakdown
  const stageBreakdown = database
    .prepare(
      `
    SELECT
      g.stage,
      SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      COUNT(*) as totalGames,
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate
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
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate
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
    wins: summary.wins ?? 0,
    losses: summary.losses ?? 0,
    totalGames: summary.totalGames,
    winRate: summary.winRate ?? 0,
    avgNeutralWinRate: summary.avgNeutralWinRate ?? 0,
    avgLCancelRate: summary.avgLCancelRate ?? 0,
    avgOpeningsPerKill: summary.avgOpeningsPerKill ?? 0,
    avgEdgeguardSuccessRate: summary.avgEdgeguardSuccessRate ?? 0,
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
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate,
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
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate,
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
      ROUND(CAST(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN g.result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate
    FROM games g
    WHERE g.player_character = ?
    GROUP BY g.stage
    ORDER BY gamesPlayed DESC
  `,
    )
    .all(character) as CharacterStageStats[];
}

// ── Character event profile (v10-v14 per-instance aggregates) ────────

/** Resolve a slippi move id to a short human name ("uair", "bthrow"...). */
function moveName(moveId: number): string {
  return moveIdToName[moveId] ?? `Move #${moveId}`;
}

/**
 * Aggregate the per-instance event tables (conversions, stock_deaths,
 * habit_instances, throw_di, recovery_spans, shield_blocks, whiff_events)
 * for every game played on `character`. All *_is_player flags are already
 * target-player-perspective, so opponent-side rows (is_player = 0) feed the
 * edgeguard / pressure-received / whiff-capture buckets. Stored enum strings
 * pass through untouched — src/characterEventProfile.ts documents the
 * vocabulary the pipeline writes.
 */
export function getCharacterEventProfile(character: string): CharacterEventProfile {
  const db = getDb();

  const totalGames = (
    db.prepare("SELECT COUNT(*) as n FROM games WHERE player_character = ?").get(character) as { n: number }
  ).n;

  const gamesWithEvents = (
    db
      .prepare(
        `
    SELECT COUNT(DISTINCT e.game_id) as n FROM (
      SELECT game_id FROM conversions
      UNION SELECT game_id FROM stock_deaths
      UNION SELECT game_id FROM habit_instances
      UNION SELECT game_id FROM throw_di
      UNION SELECT game_id FROM recovery_spans
      UNION SELECT game_id FROM shield_blocks
      UNION SELECT game_id FROM whiff_events
    ) e
    JOIN games g ON g.id = e.game_id
    WHERE g.player_character = ?
  `,
      )
      .get(character) as { n: number }
  ).n;

  // ── Habits (own defensive choices, with condition splits) ──────────
  const habits = db
    .prepare(
      `
    SELECT
      h.situation, h.option,
      COUNT(*) as total,
      SUM(h.punished) as punished,
      SUM(h.cornered) as cornered,
      SUM(CASE WHEN h.cornered = 1 AND h.punished = 1 THEN 1 ELSE 0 END) as corneredPunished,
      SUM(h.pressured) as pressured,
      SUM(CASE WHEN h.pressured = 1 AND h.punished = 1 THEN 1 ELSE 0 END) as pressuredPunished
    FROM habit_instances h
    JOIN games g ON g.id = h.game_id
    WHERE g.player_character = ? AND h.is_player = 1
    GROUP BY h.situation, h.option
    ORDER BY h.situation, total DESC
  `,
    )
    .all(character) as CharacterEventProfile["habits"];

  // ── Deaths (own stocks lost) ───────────────────────────────────────
  const deathTotals = db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      ROUND(AVG(sd.death_percent), 2) as avgDeathPercent,
      COALESCE(SUM(sd.resource_fault), 0) as resourceFaults
    FROM stock_deaths sd
    JOIN games g ON g.id = sd.game_id
    WHERE g.player_character = ? AND sd.victim_is_player = 1 AND sd.died = 1
  `,
    )
    .get(character) as { total: number; avgDeathPercent: number | null; resourceFaults: number };

  const verdicts = db
    .prepare(
      `
    SELECT sd.verdict, COUNT(*) as count
    FROM stock_deaths sd
    JOIN games g ON g.id = sd.game_id
    WHERE g.player_character = ? AND sd.victim_is_player = 1 AND sd.died = 1 AND sd.verdict IS NOT NULL
    GROUP BY sd.verdict
    ORDER BY count DESC
  `,
    )
    .all(character) as { verdict: string; count: number }[];

  const killerMoveRows = db
    .prepare(
      `
    SELECT sd.killer_move_id as moveId, COUNT(*) as count, ROUND(AVG(sd.death_percent), 2) as avgDeathPercent
    FROM stock_deaths sd
    JOIN games g ON g.id = sd.game_id
    WHERE g.player_character = ? AND sd.victim_is_player = 1 AND sd.died = 1 AND sd.killer_move_id IS NOT NULL
    GROUP BY sd.killer_move_id
    ORDER BY count DESC
    LIMIT 8
  `,
    )
    .all(character) as { moveId: number; count: number; avgDeathPercent: number | null }[];

  const directions = db
    .prepare(
      `
    SELECT sd.death_direction as direction, COUNT(*) as count
    FROM stock_deaths sd
    JOIN games g ON g.id = sd.game_id
    WHERE g.player_character = ? AND sd.victim_is_player = 1 AND sd.died = 1 AND sd.death_direction IS NOT NULL
    GROUP BY sd.death_direction
    ORDER BY count DESC
  `,
    )
    .all(character) as { direction: string; count: number }[];

  const throwDI = db
    .prepare(
      `
    SELECT td.throw_direction as direction, COUNT(*) as total, COALESCE(SUM(td.no_di), 0) as noDI
    FROM throw_di td
    JOIN games g ON g.id = td.game_id
    WHERE g.player_character = ? AND td.victim_is_player = 1
    GROUP BY td.throw_direction
    ORDER BY total DESC
  `,
    )
    .all(character) as { direction: string; total: number; noDI: number }[];

  // ── Recovery (own spans) + edgeguards (opponent spans) ─────────────
  const recoveryTotals = db
    .prepare(
      `
    SELECT
      COUNT(*) as ownSpans,
      COALESCE(SUM(rs.dj_early), 0) as djEarlyTotal,
      COALESCE(SUM(CASE WHEN rs.dj_early = 1 AND rs.landing = 'death' THEN 1 ELSE 0 END), 0) as djEarlyDied,
      COALESCE(SUM(rs.contested), 0) as contestedTotal,
      COALESCE(SUM(CASE WHEN rs.contested = 1 AND rs.landing = 'death' THEN 1 ELSE 0 END), 0) as contestedDied
    FROM recovery_spans rs
    JOIN games g ON g.id = rs.game_id
    WHERE g.player_character = ? AND rs.recovering_is_player = 1
  `,
    )
    .get(character) as {
    ownSpans: number;
    djEarlyTotal: number;
    djEarlyDied: number;
    contestedTotal: number;
    contestedDied: number;
  };

  const routes = db
    .prepare(
      `
    SELECT rs.route, COUNT(*) as total,
      SUM(CASE WHEN rs.landing = 'death' THEN 1 ELSE 0 END) as died
    FROM recovery_spans rs
    JOIN games g ON g.id = rs.game_id
    WHERE g.player_character = ? AND rs.recovering_is_player = 1 AND rs.route IS NOT NULL
    GROUP BY rs.route
    ORDER BY total DESC
  `,
    )
    .all(character) as { route: string; total: number; died: number }[];

  const landings = db
    .prepare(
      `
    SELECT rs.landing, COUNT(*) as count
    FROM recovery_spans rs
    JOIN games g ON g.id = rs.game_id
    WHERE g.player_character = ? AND rs.recovering_is_player = 1
    GROUP BY rs.landing
    ORDER BY count DESC
  `,
    )
    .all(character) as { landing: string; count: number }[];

  const edgeguardTotals = db
    .prepare(
      `
    SELECT
      COUNT(*) as opportunities,
      COALESCE(SUM(CASE WHEN rs.edgeguarder_invincible_ledge_frames > 0 THEN 1 ELSE 0 END), 0) as invincibleLedgeSpans
    FROM recovery_spans rs
    JOIN games g ON g.id = rs.game_id
    WHERE g.player_character = ? AND rs.recovering_is_player = 0
  `,
    )
    .get(character) as { opportunities: number; invincibleLedgeSpans: number };

  const edgeguardByDepth = db
    .prepare(
      `
    SELECT rs.edgeguarder_depth as depth, COUNT(*) as total,
      SUM(CASE WHEN rs.landing = 'death' THEN 1 ELSE 0 END) as kills
    FROM recovery_spans rs
    JOIN games g ON g.id = rs.game_id
    WHERE g.player_character = ? AND rs.recovering_is_player = 0
    GROUP BY rs.edgeguarder_depth
    ORDER BY total DESC
  `,
    )
    .all(character) as { depth: string; total: number; kills: number }[];

  // ── Shield: own blocks (defense) + own attacks blocked (pressure) ──
  const shieldDefenseTotal = (
    db
      .prepare(
        `
    SELECT COUNT(*) as n
    FROM shield_blocks sb
    JOIN games g ON g.id = sb.game_id
    WHERE g.player_character = ? AND sb.defender_is_player = 1
  `,
      )
      .get(character) as { n: number }
  ).n;

  const shieldGrades = db
    .prepare(
      `
    SELECT sb.grade, COUNT(*) as count
    FROM shield_blocks sb
    JOIN games g ON g.id = sb.game_id
    WHERE g.player_character = ? AND sb.defender_is_player = 1
    GROUP BY sb.grade
    ORDER BY count DESC
  `,
    )
    .all(character) as { grade: string; count: number }[];

  const shieldDefenseByMove = db
    .prepare(
      `
    SELECT
      sb.attack_label as attackLabel,
      COUNT(*) as blocks,
      SUM(CASE WHEN sb.grade = 'punish-taken' THEN 1 ELSE 0 END) as punishTaken,
      SUM(CASE WHEN sb.grade = 'punish-missed' THEN 1 ELSE 0 END) as punishMissed,
      ROUND(AVG(sb.frame_gap), 2) as avgFrameGap
    FROM shield_blocks sb
    JOIN games g ON g.id = sb.game_id
    WHERE g.player_character = ? AND sb.defender_is_player = 1
    GROUP BY sb.attack_label
    ORDER BY blocks DESC
  `,
    )
    .all(character) as CharacterEventProfile["shield"]["defense"]["byMove"];

  const shieldPressureTotal = (
    db
      .prepare(
        `
    SELECT COUNT(*) as n
    FROM shield_blocks sb
    JOIN games g ON g.id = sb.game_id
    WHERE g.player_character = ? AND sb.defender_is_player = 0
  `,
      )
      .get(character) as { n: number }
  ).n;

  const shieldPressureByMove = db
    .prepare(
      `
    SELECT
      sb.attack_label as attackLabel,
      COUNT(*) as blocks,
      COALESCE(SUM(sb.punished_attacker), 0) as punishedByDefender,
      ROUND(AVG(sb.frame_gap), 2) as avgFrameGap
    FROM shield_blocks sb
    JOIN games g ON g.id = sb.game_id
    WHERE g.player_character = ? AND sb.defender_is_player = 0
    GROUP BY sb.attack_label
    ORDER BY blocks DESC
  `,
    )
    .all(character) as CharacterEventProfile["shield"]["pressure"]["byMove"];

  // ── Whiffs: opponent whiffs = capture, own whiffs = exposure ───────
  const capture = db
    .prepare(
      `
    SELECT COUNT(*) as opportunities, COALESCE(SUM(w.punished), 0) as punished
    FROM whiff_events w
    JOIN games g ON g.id = w.game_id
    WHERE g.player_character = ? AND w.whiffer_is_player = 0 AND w.opportunity = 1
  `,
    )
    .get(character) as { opportunities: number; punished: number };

  const captureDelays = db
    .prepare(
      `
    SELECT w.reaction_delay as delay
    FROM whiff_events w
    JOIN games g ON g.id = w.game_id
    WHERE g.player_character = ? AND w.whiffer_is_player = 0 AND w.opportunity = 1 AND w.reaction_delay IS NOT NULL
    ORDER BY w.reaction_delay
  `,
    )
    .all(character) as { delay: number }[];

  let captureMedianReactionDelay: number | null = null;
  if (captureDelays.length > 0) {
    const mid = Math.floor(captureDelays.length / 2);
    captureMedianReactionDelay =
      captureDelays.length % 2 === 1
        ? captureDelays[mid]!.delay
        : (captureDelays[mid - 1]!.delay + captureDelays[mid]!.delay) / 2;
  }

  const exposure = db
    .prepare(
      `
    SELECT
      w.attack_label as attackLabel,
      COUNT(*) as total,
      COALESCE(SUM(w.opportunity), 0) as opportunities,
      COALESCE(SUM(w.punished), 0) as punished
    FROM whiff_events w
    JOIN games g ON g.id = w.game_id
    WHERE g.player_character = ? AND w.whiffer_is_player = 1
    GROUP BY w.attack_label
    ORDER BY total DESC
    LIMIT 12
  `,
    )
    .all(character) as CharacterEventProfile["whiffs"]["exposure"];

  // ── Conversions (own offense) ──────────────────────────────────────
  const conversionTotals = db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN c.end_percent >= 100 AND c.did_kill = 0 THEN 1 ELSE 0 END), 0) as squanderedKillPercent
    FROM conversions c
    JOIN games g ON g.id = c.game_id
    WHERE g.player_character = ? AND c.attacker_is_player = 1
  `,
    )
    .get(character) as { total: number; squanderedKillPercent: number };

  const byOpeningType = db
    .prepare(
      `
    SELECT
      c.opening_type as openingType,
      COUNT(*) as count,
      ROUND(AVG(c.damage), 2) as avgDamage,
      COALESCE(SUM(c.did_kill), 0) as kills
    FROM conversions c
    JOIN games g ON g.id = c.game_id
    WHERE g.player_character = ? AND c.attacker_is_player = 1
    GROUP BY c.opening_type
    ORDER BY count DESC
  `,
    )
    .all(character) as { openingType: string; count: number; avgDamage: number | null; kills: number }[];

  const killMoveRows = db
    .prepare(
      `
    SELECT c.last_move_id as moveId, COUNT(*) as count, ROUND(AVG(c.end_percent), 2) as avgKillPercent
    FROM conversions c
    JOIN games g ON g.id = c.game_id
    WHERE g.player_character = ? AND c.attacker_is_player = 1 AND c.did_kill = 1 AND c.last_move_id IS NOT NULL
    GROUP BY c.last_move_id
    ORDER BY count DESC
    LIMIT 8
  `,
    )
    .all(character) as { moveId: number; count: number; avgKillPercent: number | null }[];

  // ── Trivia ─────────────────────────────────────────────────────────
  const gameTrivia = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(g.duration_seconds), 0) as totalPlaytimeSeconds,
      MAX(g.duration_seconds) as longestGameSeconds,
      COALESCE(SUM(CASE WHEN g.result = 'win' AND g.player_final_stocks = 4 THEN 1 ELSE 0 END), 0) as fourStockWins
    FROM games g
    WHERE g.player_character = ?
  `,
    )
    .get(character) as { totalPlaytimeSeconds: number; longestGameSeconds: number | null; fourStockWins: number };

  // time_in_air / time_at_ledge are stored as fractions of the game
  // (playerSummary's ratio(frames, playableFrames)) — fraction × duration = seconds.
  const statsTrivia = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(gs.total_damage_dealt), 0) as totalDamageDealt,
      COALESCE(SUM(gs.wavedash_count), 0) as totalWavedashes,
      ROUND(COALESCE(SUM(gs.time_in_air * g.duration_seconds), 0), 1) as airtimeSeconds,
      ROUND(COALESCE(SUM(gs.time_at_ledge * g.duration_seconds), 0), 1) as ledgeSeconds
    FROM game_stats gs
    JOIN games g ON g.id = gs.game_id
    WHERE g.player_character = ?
  `,
    )
    .get(character) as {
    totalDamageDealt: number;
    totalWavedashes: number;
    airtimeSeconds: number;
    ledgeSeconds: number;
  };

  const sdCount = (
    db
      .prepare(
        `
    SELECT COUNT(*) as n
    FROM stock_deaths sd
    JOIN games g ON g.id = sd.game_id
    WHERE g.player_character = ? AND sd.victim_is_player = 1 AND sd.verdict = 'SD'
  `,
      )
      .get(character) as { n: number }
  ).n;

  return {
    character,
    totalGames,
    gamesWithEvents,
    habits,
    deaths: {
      total: deathTotals.total,
      avgDeathPercent: deathTotals.total > 0 ? deathTotals.avgDeathPercent : null,
      verdicts,
      resourceFaults: deathTotals.resourceFaults,
      killerMoves: killerMoveRows.map((r) => ({
        moveId: r.moveId,
        moveName: moveName(r.moveId),
        count: r.count,
        avgDeathPercent: r.avgDeathPercent,
      })),
      directions,
      throwDI,
    },
    recovery: {
      ownSpans: recoveryTotals.ownSpans,
      routes,
      djEarly: { total: recoveryTotals.djEarlyTotal, died: recoveryTotals.djEarlyDied },
      contested: { total: recoveryTotals.contestedTotal, died: recoveryTotals.contestedDied },
      landings,
      edgeguard: {
        opportunities: edgeguardTotals.opportunities,
        byDepth: edgeguardByDepth,
        invincibleLedgeSpans: edgeguardTotals.invincibleLedgeSpans,
      },
    },
    shield: {
      defense: { total: shieldDefenseTotal, grades: shieldGrades, byMove: shieldDefenseByMove },
      pressure: { total: shieldPressureTotal, byMove: shieldPressureByMove },
    },
    whiffs: {
      captureOpportunities: capture.opportunities,
      capturePunished: capture.punished,
      captureMedianReactionDelay,
      exposure,
    },
    conversions: {
      total: conversionTotals.total,
      byOpeningType,
      killMoves: killMoveRows.map((r) => ({
        moveId: r.moveId,
        moveName: moveName(r.moveId),
        count: r.count,
        avgKillPercent: r.avgKillPercent,
      })),
      squanderedKillPercent: conversionTotals.squanderedKillPercent,
    },
    trivia: {
      totalPlaytimeSeconds: gameTrivia.totalPlaytimeSeconds,
      totalDamageDealt: statsTrivia.totalDamageDealt,
      totalWavedashes: statsTrivia.totalWavedashes,
      airtimeSeconds: statsTrivia.airtimeSeconds,
      ledgeSeconds: statsTrivia.ledgeSeconds,
      sdCount,
      fourStockWins: gameTrivia.fourStockWins,
      longestGameSeconds: gameTrivia.longestGameSeconds,
      totalLasersOrProjectiles: null,
    },
  };
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
      ROUND(CAST(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate
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
      ROUND(CAST(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS REAL) / MAX(SUM(CASE WHEN result IN ('win', 'loss') THEN 1 ELSE 0 END), 1), 4) as winRate
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
  /** Games whose result is neither win nor loss (draw / unparsed) — keeps games == wins + losses + draws. */
  draws: number;
  opponents: string[];
  gameIds: number[];
  gameResults: { id: number; result: string }[];
}

export function getSessionsByDay(daysBack: number = 90): DaySession[] {
  const rows = getDb()
    .prepare(
      `
    SELECT
      date(played_at, 'localtime') as date,
      id,
      result,
      opponent_tag as opponentTag
    FROM games
    WHERE date(played_at, 'localtime') >= date('now', 'localtime', '-' || ? || ' days')
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
      draws: 0,
      opponents: [] as string[],
      gameIds: [] as number[],
      gameResults: [] as { id: number; result: string }[],
    };
    existing.games += 1;
    if (r.result === "win") existing.wins += 1;
    else if (r.result === "loss") existing.losses += 1;
    else existing.draws += 1;
    existing.gameIds.push(r.id);
    existing.gameResults.push({ id: r.id, result: r.result });
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
    WHERE date(g.played_at, 'localtime') = ?
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

const TREND_METRICS = Object.keys(METRIC_COLUMN) as TrendMetric[];

export type TrendSeriesBundle = Record<TrendMetric, TrendPoint[]>;

function buildTrendWhere(
  range: "7d" | "30d" | "all",
  filterChar: string | null,
): { whereClause: string; params: string[] } {
  const where: string[] = [];
  const params: string[] = [];
  if (range === "7d") where.push("g.played_at >= date('now', '-7 days')");
  else if (range === "30d") where.push("g.played_at >= date('now', '-30 days')");
  if (filterChar && filterChar !== "all") {
    where.push("g.opponent_character = ?");
    params.push(filterChar);
  }
  return {
    whereClause: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

export function getTrendSeries(
  metric: TrendMetric,
  range: "7d" | "30d" | "all",
  filterChar: string | null,
): TrendPoint[] {
  const column = METRIC_COLUMN[metric];
  const { whereClause, params } = buildTrendWhere(range, filterChar);
  const sql = `
    SELECT ${column} as value, g.played_at as playedAt
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    ${whereClause}
    ORDER BY g.played_at ASC
  `;
  return getDb()
    .prepare(sql)
    .all(...params) as TrendPoint[];
}

export function getTrendSeriesBundle(range: "7d" | "30d" | "all", filterChar: string | null): TrendSeriesBundle {
  const { whereClause, params } = buildTrendWhere(range, filterChar);
  const rows = getDb()
    .prepare(
      `
    SELECT
      gs.neutral_win_rate as neutralWinRate,
      gs.l_cancel_rate as lCancelRate,
      gs.conversion_rate as conversionRate,
      gs.avg_damage_per_opening as avgDamagePerOpening,
      gs.openings_per_kill as openingsPerKill,
      gs.avg_death_percent as avgDeathPercent,
      g.played_at as playedAt
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    ${whereClause}
    ORDER BY g.played_at ASC
  `,
    )
    .all(...params) as Array<{ playedAt: string } & Record<TrendMetric, number>>;

  const bundle: TrendSeriesBundle = {
    neutralWinRate: [],
    lCancelRate: [],
    conversionRate: [],
    avgDamagePerOpening: [],
    openingsPerKill: [],
    avgDeathPercent: [],
  };
  for (const row of rows) {
    for (const metric of TREND_METRICS) {
      bundle[metric].push({ playedAt: row.playedAt, value: row[metric] });
    }
  }
  return bundle;
}

// ── Performance Lab ───────────────────────────────────────────────

/**
 * These metrics deliberately stay close to replay-derived facts. MAGI uses
 * them to prioritize review, not to make causal claims about a loss.
 */
export type PerformanceMetricKey =
  | "neutralWinRate"
  | "conversionRate"
  | "avgDamagePerOpening"
  | "openingsPerKill"
  | "recoverySuccessRate"
  | "avgDeathPercent"
  | "lCancelRate"
  | "edgeguardSuccessRate"
  | "diSurvivalScore";

export interface PerformanceMetric {
  key: PerformanceMetricKey;
  label: string;
  current: number;
  baseline: number | null;
  delta: number | null;
  higherIsBetter: boolean;
  winValue: number | null;
  lossValue: number | null;
}

export interface PerformanceReviewGame {
  id: number;
  playedAt: string | null;
  playerCharacter: string;
  opponentCharacter: string;
  opponentTag: string;
  stage: string;
  playerFinalStocks: number;
  opponentFinalStocks: number;
  reviewReason: string;
  priority: "high" | "medium";
  noteCount: number;
}

export interface PerformanceHub {
  sample: { currentGames: number; baselineGames: number; gamesScanned: number };
  metrics: PerformanceMetric[];
  insights: Array<{ kind: "progress" | "focus" | "winSignal"; title: string; detail: string }>;
  reviewQueue: PerformanceReviewGame[];
}

interface PerformanceGameRow {
  id: number;
  playedAt: string | null;
  playerCharacter: string;
  opponentCharacter: string;
  opponentTag: string;
  stage: string;
  result: "win" | "loss" | "draw";
  playerFinalStocks: number;
  opponentFinalStocks: number;
  neutralWinRate: number;
  conversionRate: number;
  avgDamagePerOpening: number;
  openingsPerKill: number;
  recoverySuccessRate: number;
  avgDeathPercent: number;
  lCancelRate: number;
  edgeguardSuccessRate: number;
  diSurvivalScore: number;
  noteCount: number;
}

const PERFORMANCE_METRICS: Array<{
  key: PerformanceMetricKey;
  label: string;
  higherIsBetter: boolean;
  /** Used only to compare the relative size of different metric changes. */
  comparisonUnit: number;
}> = [
  { key: "neutralWinRate", label: "Neutral", higherIsBetter: true, comparisonUnit: 0.05 },
  { key: "conversionRate", label: "Conversion", higherIsBetter: true, comparisonUnit: 0.05 },
  { key: "avgDamagePerOpening", label: "Damage / opening", higherIsBetter: true, comparisonUnit: 4 },
  { key: "openingsPerKill", label: "Openings / kill", higherIsBetter: false, comparisonUnit: 0.4 },
  { key: "recoverySuccessRate", label: "Recovery", higherIsBetter: true, comparisonUnit: 0.05 },
  { key: "avgDeathPercent", label: "Survival", higherIsBetter: true, comparisonUnit: 8 },
  { key: "lCancelRate", label: "L-cancel", higherIsBetter: true, comparisonUnit: 0.05 },
  { key: "edgeguardSuccessRate", label: "Edgeguard", higherIsBetter: true, comparisonUnit: 0.05 },
  { key: "diSurvivalScore", label: "DI survival", higherIsBetter: true, comparisonUnit: 0.05 },
];

function averagePerformanceMetric(rows: PerformanceGameRow[], key: PerformanceMetricKey): number {
  if (rows.length === 0) return 0;
  return rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
}

/**
 * Current form is the most recent half of the sample (up to ten games),
 * compared with the immediately preceding half. That keeps the comparison
 * useful for newer players without pretending a tiny sample is conclusive.
 */
export function getPerformanceHub(sampleSize: number = 10): PerformanceHub {
  const safeSampleSize = Math.max(1, Math.min(Math.floor(sampleSize), 20));
  const rows = getDb()
    .prepare(
      `
      SELECT
        g.id, g.played_at as playedAt, g.player_character as playerCharacter,
        g.opponent_character as opponentCharacter, g.opponent_tag as opponentTag,
        g.stage, g.result, g.player_final_stocks as playerFinalStocks,
        g.opponent_final_stocks as opponentFinalStocks,
        gs.neutral_win_rate as neutralWinRate,
        gs.conversion_rate as conversionRate,
        gs.avg_damage_per_opening as avgDamagePerOpening,
        gs.openings_per_kill as openingsPerKill,
        gs.recovery_success_rate as recoverySuccessRate,
        gs.avg_death_percent as avgDeathPercent,
        gs.l_cancel_rate as lCancelRate,
        gs.edgeguard_success_rate as edgeguardSuccessRate,
        gs.di_survival_score as diSurvivalScore,
        (SELECT COUNT(*) FROM game_review_notes n WHERE n.game_id = g.id) as noteCount
      FROM games g
      JOIN game_stats gs ON gs.game_id = g.id
      ORDER BY g.played_at DESC, g.id DESC
      LIMIT ?
    `,
    )
    .all(safeSampleSize * 4) as PerformanceGameRow[];

  const currentCount = rows.length === 0 ? 0 : Math.min(safeSampleSize, Math.ceil(rows.length / 2));
  const currentRows = rows.slice(0, currentCount);
  const baselineRows = rows.slice(currentCount, currentCount + currentCount);
  const winRows = rows.filter((row) => row.result === "win");
  const lossRows = rows.filter((row) => row.result === "loss");

  const metrics: PerformanceMetric[] = PERFORMANCE_METRICS.map((definition) => {
    const current = averagePerformanceMetric(currentRows, definition.key);
    const baseline = baselineRows.length ? averagePerformanceMetric(baselineRows, definition.key) : null;
    return {
      key: definition.key,
      label: definition.label,
      current,
      baseline,
      delta: baseline == null ? null : current - baseline,
      higherIsBetter: definition.higherIsBetter,
      winValue: winRows.length ? averagePerformanceMetric(winRows, definition.key) : null,
      lossValue: lossRows.length ? averagePerformanceMetric(lossRows, definition.key) : null,
    };
  });

  const metricByKey = new Map(metrics.map((metric) => [metric.key, metric]));
  const normalizedTrend = (metric: PerformanceMetric): number => {
    const definition = PERFORMANCE_METRICS.find((item) => item.key === metric.key)!;
    if (metric.delta == null) return 0;
    return (metric.higherIsBetter ? metric.delta : -metric.delta) / definition.comparisonUnit;
  };
  const normalizedWinSignal = (metric: PerformanceMetric): number => {
    const definition = PERFORMANCE_METRICS.find((item) => item.key === metric.key)!;
    if (metric.winValue == null || metric.lossValue == null) return 0;
    const rawDifference = metric.higherIsBetter
      ? metric.winValue - metric.lossValue
      : metric.lossValue - metric.winValue;
    return rawDifference / definition.comparisonUnit;
  };

  const insights: PerformanceHub["insights"] = [];
  if (baselineRows.length > 0) {
    const sortedByTrend = [...metrics].sort((a, b) => normalizedTrend(b) - normalizedTrend(a));
    const strongest = sortedByTrend[0];
    const focus = sortedByTrend[sortedByTrend.length - 1];
    if (strongest && normalizedTrend(strongest) > 0.25) {
      insights.push({
        kind: "progress",
        title: `${strongest.label} is trending up`,
        detail: `Your last ${currentRows.length} games are ahead of the previous ${baselineRows.length}. Keep this stable while you add one new focus.`,
      });
    }
    if (focus && normalizedTrend(focus) < -0.25) {
      insights.push({
        kind: "focus",
        title: `Make ${focus.label.toLowerCase()} this block's focus`,
        detail: `It moved the furthest in the wrong direction versus your recent baseline. Review the queue before adding more drills.`,
      });
    }
  } else if (currentRows.length > 0) {
    insights.push({
      kind: "progress",
      title: "Build a trustworthy baseline",
      detail: `MAGI has ${currentRows.length} game${currentRows.length === 1 ? "" : "s"} so far. Import another session to unlock current-form comparisons.`,
    });
  }

  const strongestWinSignal = [...metrics].sort((a, b) => normalizedWinSignal(b) - normalizedWinSignal(a))[0];
  if (strongestWinSignal && normalizedWinSignal(strongestWinSignal) > 0.25) {
    insights.push({
      kind: "winSignal",
      title: `${strongestWinSignal.label} separates recent wins`,
      detail:
        "This is a pattern in your replay data, not proof of cause. Use it as a review question and test it in your next block.",
    });
  }

  const reviewQueue = lossRows
    .map((game) => {
      const gaps = PERFORMANCE_METRICS.map((definition) => {
        const metric = metricByKey.get(definition.key)!;
        if (metric.winValue == null) return { definition, score: 0 };
        const difference = definition.higherIsBetter
          ? metric.winValue - game[definition.key]
          : game[definition.key] - metric.winValue;
        return { definition, score: Math.max(0, difference / definition.comparisonUnit) };
      }).sort((a, b) => b.score - a.score);
      const biggestGap = gaps[0]!;
      const generic =
        game.neutralWinRate < 0.5
          ? "Neutral fell below 50% in this game."
          : "Review the key stock and identify the repeatable decision.";
      return {
        id: game.id,
        playedAt: game.playedAt,
        playerCharacter: game.playerCharacter,
        opponentCharacter: game.opponentCharacter,
        opponentTag: game.opponentTag,
        stage: game.stage,
        playerFinalStocks: game.playerFinalStocks,
        opponentFinalStocks: game.opponentFinalStocks,
        reviewReason:
          biggestGap.score > 0.15 ? `${biggestGap.definition.label} trailed your recent win baseline.` : generic,
        priority: biggestGap.score > 0.8 ? ("high" as const) : ("medium" as const),
        noteCount: game.noteCount,
        score: biggestGap.score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ score: _, ...game }) => game);

  return {
    sample: { currentGames: currentRows.length, baselineGames: baselineRows.length, gamesScanned: rows.length },
    metrics,
    insights,
    reviewQueue,
  };
}

// ── Training and review log ────────────────────────────────────────

export interface TrainingLogEntry {
  id: number;
  loggedAt: string;
  activityType: string;
  minutes: number;
  focus: string;
  energy: number | null;
  confidence: number | null;
  notes: string;
  createdAt: string;
}

export interface CreateTrainingLogEntry {
  loggedAt?: string;
  activityType: string;
  minutes: number;
  focus?: string;
  energy?: number | null;
  confidence?: number | null;
  notes?: string;
}

function optionalRating(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(5, Math.round(value)));
}

export function listTrainingLogEntries(limit: number = 30): TrainingLogEntry[] {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 200));
  return getDb()
    .prepare(
      `
      SELECT id, logged_at as loggedAt, activity_type as activityType, minutes, focus,
             energy, confidence, notes, created_at as createdAt
      FROM training_log_entries
      ORDER BY logged_at DESC, id DESC
      LIMIT ?
    `,
    )
    .all(safeLimit) as TrainingLogEntry[];
}

export function createTrainingLogEntry(input: CreateTrainingLogEntry): TrainingLogEntry {
  const activityType = input.activityType.trim().slice(0, 40);
  if (!activityType) throw new Error("Choose the kind of work you did.");

  const focus = (input.focus ?? "").trim().slice(0, 180);
  const notes = (input.notes ?? "").trim().slice(0, 4000);
  const minutes = Number.isFinite(input.minutes) ? Math.max(0, Math.min(1440, Math.round(input.minutes))) : 0;
  const loggedAt = input.loggedAt?.trim() || new Date().toISOString();
  const row = getDb()
    .prepare(
      `
      INSERT INTO training_log_entries (logged_at, activity_type, minutes, focus, energy, confidence, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id, logged_at as loggedAt, activity_type as activityType, minutes, focus,
                energy, confidence, notes, created_at as createdAt
    `,
    )
    .get(
      loggedAt,
      activityType,
      minutes,
      focus,
      optionalRating(input.energy),
      optionalRating(input.confidence),
      notes,
    ) as TrainingLogEntry;
  return row;
}

export interface GameReviewNote {
  id: number;
  gameId: number;
  author: string;
  category: string;
  content: string;
  createdAt: string;
}

export function listGameReviewNotes(gameId: number): GameReviewNote[] {
  return getDb()
    .prepare(
      `
      SELECT id, game_id as gameId, author, category, content, created_at as createdAt
      FROM game_review_notes
      WHERE game_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    )
    .all(gameId) as GameReviewNote[];
}

export function addGameReviewNote(
  gameId: number,
  input: { content: string; author?: string; category?: string },
): GameReviewNote {
  const content = input.content.trim().slice(0, 4000);
  if (!content) throw new Error("Write a note before saving it.");
  const author = (input.author?.trim() || "Player").slice(0, 80);
  const category = (input.category?.trim() || "review").slice(0, 40);
  return getDb()
    .prepare(
      `
      INSERT INTO game_review_notes (game_id, author, category, content)
      VALUES (?, ?, ?, ?)
      RETURNING id, game_id as gameId, author, category, content, created_at as createdAt
    `,
    )
    .get(gameId, author, category, content) as GameReviewNote;
}

// ── Practice plans ──────────────────────────────────────────────────

export interface PracticePlan {
  id: number;
  name: string;
  weaknessSummary: string | null;
  createdAt: string;
  drills: PracticeDrill[];
}
export interface PracticeDrill {
  id: number;
  name: string;
  target: string;
  completed: boolean;
  sortOrder: number;
}

export function insertPracticePlan(
  name: string,
  weaknessSummary: string | null,
  drills: Array<{ name: string; target: string }>,
): PracticePlan {
  const db = getDb();
  return db.transaction(() => {
    const planRow = db
      .prepare("INSERT INTO practice_plans (name, weakness_summary) VALUES (?, ?) RETURNING id, created_at")
      .get(name, weaknessSummary) as { id: number; created_at: string };
    const insertDrill = db.prepare(
      "INSERT INTO practice_drills (plan_id, name, target, sort_order) VALUES (?, ?, ?, ?) RETURNING id",
    );
    const drillRows: PracticeDrill[] = drills.map((d, i) => {
      const row = insertDrill.get(planRow.id, d.name, d.target, i) as { id: number };
      return { id: row.id, name: d.name, target: d.target, completed: false, sortOrder: i };
    });
    return { id: planRow.id, name, weaknessSummary, createdAt: planRow.created_at, drills: drillRows };
  })();
}

export function listPracticePlans(): PracticePlan[] {
  const db = getDb();
  const plans = db
    .prepare(
      "SELECT id, name, weakness_summary as weaknessSummary, created_at as createdAt FROM practice_plans ORDER BY created_at DESC",
    )
    .all() as Array<{ id: number; name: string; weaknessSummary: string | null; createdAt: string }>;
  if (plans.length === 0) return [];
  const drills = db
    .prepare(
      "SELECT id, plan_id as planId, name, target, completed, sort_order as sortOrder FROM practice_drills ORDER BY plan_id, sort_order",
    )
    .all() as Array<{
    id: number;
    planId: number;
    name: string;
    target: string;
    completed: number;
    sortOrder: number;
  }>;
  const drillsByPlan = new Map<number, PracticeDrill[]>();
  for (const drill of drills) {
    const planDrills = drillsByPlan.get(drill.planId) ?? [];
    planDrills.push({
      id: drill.id,
      name: drill.name,
      target: drill.target,
      completed: drill.completed === 1,
      sortOrder: drill.sortOrder,
    });
    drillsByPlan.set(drill.planId, planDrills);
  }
  return plans.map((p) => ({
    ...p,
    drills: drillsByPlan.get(p.id) ?? [],
  }));
}

export function setDrillCompletion(drillId: number, completed: boolean): void {
  getDb()
    .prepare("UPDATE practice_drills SET completed = ? WHERE id = ?")
    .run(completed ? 1 : 0, drillId);
}

export function deletePracticePlan(planId: number): void {
  getDb().prepare("DELETE FROM practice_plans WHERE id = ?").run(planId);
}

// ── Oracle messages ─────────────────────────────────────────────────

export interface OracleMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export function listOracleMessages(): OracleMessage[] {
  return getDb()
    .prepare("SELECT id, role, content, created_at as createdAt FROM oracle_messages ORDER BY created_at ASC")
    .all() as OracleMessage[];
}

export function appendOracleMessage(role: "user" | "assistant", content: string): OracleMessage {
  const row = getDb()
    .prepare("INSERT INTO oracle_messages (role, content) VALUES (?, ?) RETURNING id, created_at")
    .get(role, content) as { id: number; created_at: string };
  return { id: row.id, role, content, createdAt: row.created_at };
}

export function appendOracleExchange(
  userContent: string,
  assistantContent: string,
): { user: OracleMessage; assistant: OracleMessage } {
  const db = getDb();
  return db.transaction(() => ({
    user: appendOracleMessage("user", userContent),
    assistant: appendOracleMessage("assistant", assistantContent),
  }))();
}

export function clearOracleMessages(): void {
  getDb().prepare("DELETE FROM oracle_messages").run();
}

export { DB_PATH, DATA_DIR };
