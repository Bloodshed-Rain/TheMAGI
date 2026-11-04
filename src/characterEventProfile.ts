// Shared contract for the per-character event analytics IPC surface.
// Single source of truth across main (src/db.ts, src/main/handlers/stats.ts,
// src/main/handlers/analysis.ts) and renderer (src/renderer/global.d.ts,
// src/renderer/pages/characters/*), following the cornermanLiveStats pattern.
//
// All aggregates are computed from the v10-v14 per-instance event tables
// (habit_instances, stock_deaths, throw_di, recovery_spans, shield_blocks,
// whiff_events, conversions) joined to games on player_character. The
// *_is_player flags in those tables are already normalized to the target
// player's perspective.

export interface HabitOptionAgg {
  /** Normalized situation key — see HABIT_SITUATION_ORDER. */
  situation: string;
  option: string;
  total: number;
  punished: number;
  cornered: number;
  corneredPunished: number;
  pressured: number;
  pressuredPunished: number;
}

export interface CharacterEventProfile {
  character: string;
  /** Games on record for this character (games table). */
  totalGames: number;
  /** Distinct games that have any event rows — i.e. backfill/import coverage. */
  gamesWithEvents: number;

  habits: HabitOptionAgg[];

  deaths: {
    /** stock_deaths where victim_is_player = 1 AND died = 1 */
    total: number;
    avgDeathPercent: number | null;
    /** DI verdict distribution — see DI_VERDICT_ORDER. */
    verdicts: Array<{ verdict: string; count: number }>;
    /** Deaths flagged resource_fault = 1 (died offstage with double jump unspent). */
    resourceFaults: number;
    /** Top killer moves, most frequent first (backend caps at ~8). */
    killerMoves: Array<{ moveId: number | null; moveName: string; count: number; avgDeathPercent: number | null }>;
    directions: Array<{ direction: string; count: number }>;
    /** Victim-side throw DI records grouped by throw direction. */
    throwDI: Array<{ direction: string; total: number; noDI: number }>;
  };

  recovery: {
    /** recovery_spans where recovering_is_player = 1 */
    ownSpans: number;
    routes: Array<{ route: string; total: number; died: number }>;
    djEarly: { total: number; died: number };
    contested: { total: number; died: number };
    landings: Array<{ landing: string; count: number }>;
    /** Opponent recovery spans = this player's edgeguard opportunities. */
    edgeguard: {
      opportunities: number;
      /** Kill rate by this player's deepest commitment — see EDGEGUARD_DEPTH_ORDER. */
      byDepth: Array<{ depth: string; total: number; kills: number }>;
      /** Opportunities spent holding ledge invincibility (invincible_ledge_frames > 0). */
      invincibleLedgeSpans: number;
    };
  };

  shield: {
    /** Own blocked hits (defender_is_player = 1): what happened after you shielded. */
    defense: {
      total: number;
      grades: Array<{ grade: string; count: number }>;
      /** Per blocked attack label: guaranteed punishes taken vs missed. */
      byMove: Array<{
        attackLabel: string;
        blocks: number;
        punishTaken: number;
        punishMissed: number;
        avgFrameGap: number | null;
      }>;
    };
    /** Own attacks blocked by the opponent (defender_is_player = 0): pressure safety. */
    pressure: {
      total: number;
      byMove: Array<{ attackLabel: string; blocks: number; punishedByDefender: number; avgFrameGap: number | null }>;
    };
  };

  whiffs: {
    /** Opponent whiffs flagged as real opportunities (whiffer_is_player = 0, opportunity = 1). */
    captureOpportunities: number;
    capturePunished: number;
    captureMedianReactionDelay: number | null;
    /** Own whiffs by attack label (whiffer_is_player = 1). */
    exposure: Array<{ attackLabel: string; total: number; opportunities: number; punished: number }>;
  };

  conversions: {
    /** conversions where attacker_is_player = 1 */
    total: number;
    byOpeningType: Array<{ openingType: string; count: number; avgDamage: number | null; kills: number }>;
    killMoves: Array<{ moveId: number | null; moveName: string; count: number; avgKillPercent: number | null }>;
    /** Conversions that pushed the opponent to >= 100% but did not kill. */
    squanderedKillPercent: number;
  };

  trivia: CharacterTrivia;
}

export interface CharacterTrivia {
  totalPlaytimeSeconds: number;
  totalDamageDealt: number;
  totalWavedashes: number;
  airtimeSeconds: number;
  ledgeSeconds: number;
  /** Self-destructs: stock_deaths verdict = 'SD'. */
  sdCount: number;
  /** Wins that ended with all four stocks intact. */
  fourStockWins: number;
  longestGameSeconds: number | null;
  totalLasersOrProjectiles: number | null;
}

export type CharacterBlurbResult =
  | { insufficient: true; gamesPlayed: number }
  | { insufficient?: false; text: string; modelUsed: string; createdAt: string; cached: boolean };

/**
 * Minimum sample sizes before a rate is trustworthy enough to render.
 * Renderer modules must consume these rather than hardcoding thresholds;
 * every displayed rate shows its n= denominator regardless.
 */
export const EVENT_SAMPLE_GUARDS = {
  habitSituationMin: 15,
  habitOptionMin: 5,
  habitPunishedRateMin: 8,
  deathVerdictMin: 20,
  killerMoveMin: 3,
  throwDirectionMin: 10,
  whiffCaptureMin: 25,
  shieldGradeMin: 30,
  shieldMoveMin: 8,
  recoveryRouteMin: 20,
  edgeguardCellMin: 8,
  blurbGamesMin: 10,
} as const;

// Display-order hints. The values below must match what the pipeline actually
// writes (frameEvents.ts, measuredDI.ts, recoveryEvents.ts, shieldEvents.ts) —
// the profile builder in db.ts normalizes stored strings to these keys, and if
// the pipeline's vocabulary differs, THIS file is updated so both sides agree.
// Renderer code should treat unknown strings as valid (append after known keys).
export const DI_VERDICT_ORDER = ["NO_DI", "WRONG_DI", "OK_DI", "GOOD_DI", "FAILED_RECOVERY", "SD", "UNKNOWN"] as const;
export const HABIT_SITUATION_ORDER = ["knockdown", "ledge", "oos"] as const;
export const RECOVERY_ROUTE_ORDER = ["high", "mid", "low"] as const;
export const EDGEGUARD_DEPTH_ORDER = ["onstage", "ledge", "shallow", "deep"] as const;
export const SHIELD_GRADE_ORDER = [
  "punish-taken",
  "punish-missed",
  "unsafe-challenge",
  "correct-hold",
  "neutral",
  "pressured",
  "unknown",
] as const;
