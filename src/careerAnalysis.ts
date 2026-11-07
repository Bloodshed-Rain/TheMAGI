// Shared main↔renderer contract for the all-games ("career") coaching
// analysis shown on the Dashboard. The prompt itself lives in
// src/pipeline/prompt.ts (SYSTEM_PROMPT_CAREER / assembleCareerPrompt); the
// handler is analyze:career in src/main/handlers/analysis.ts.

/** Fewer recorded games than this and the analysis is not offered at all. */
export const CAREER_ANALYSIS_MIN_GAMES = 10;
/** "Recent" column of the measured-pattern block: the newest N games. */
export const CAREER_RECENT_WINDOW_GAMES = 30;
/** Early-vs-recent drift compares the oldest N games with the newest N. */
export const CAREER_DRIFT_WINDOW_GAMES = 20;
/** Per-character pattern rows: the player's N most-played characters. */
export const CAREER_TOP_CHARACTERS = 3;
/** Per-matchup pattern rows: the N most common opponent characters. */
export const CAREER_TOP_MATCHUPS = 6;
/** Upper bound on games per pattern query ("all games"). */
export const CAREER_ALL_GAMES_LIMIT = 100000;

export type CareerAnalysisResult =
  | { insufficient: true; gamesPlayed: number; minGames: number }
  | {
      insufficient?: false;
      text: string;
      /** Games in the database when this text was generated. */
      gamesAnalyzed: number;
      /** Games in the database now; > gamesAnalyzed means a refresh would see new games. */
      gamesNow: number;
      modelUsed: string;
      createdAt: string;
      cached: boolean;
    };
