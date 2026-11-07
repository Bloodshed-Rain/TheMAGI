// Shared context for the game/set coaching prompt: the player's record in
// this exact matchup (background only) plus their measured recurring
// patterns (character-wide history and the same-matchup subset). Every
// single-game and set coaching entry point (IPC handlers, importer,
// auto-analysis) goes through here so the prompt always gets the same data.
//
// Lifetime record, other characters and overall trends are deliberately NOT
// part of a game or set review — they belong to the career analysis
// (analyze:career) and the character/stage/opponent scopes.

import { findPlayerIdx, type GameResult, type CoachingBackground } from "./pipeline";
import type { RecurringPatterns } from "./pipeline/patterns";
import { getAggregateStats, getPatternData } from "./db";

/** Recent games per history column. Habits drift; a rolling window keeps them current. */
const CHARACTER_HISTORY_GAMES = 150;
const MATCHUP_HISTORY_GAMES = 100;

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  // Later games win ties — the most recent character is the relevant one.
  for (const v of values) {
    const n = counts.get(v)!;
    if (n >= bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

export function getRecurringPatterns(
  character: string,
  opponentCharacter: string | null,
  excludeGameIds: number[] = [],
): RecurringPatterns | null {
  try {
    const characterData = getPatternData({
      label: `all ${character}`,
      character,
      excludeGameIds,
      limit: CHARACTER_HISTORY_GAMES,
    });
    const matchup = opponentCharacter
      ? getPatternData({
          label: `vs ${opponentCharacter}`,
          character,
          opponentCharacter,
          excludeGameIds,
          limit: MATCHUP_HISTORY_GAMES,
        })
      : null;
    if (!characterData && !matchup) return null;
    return { character: characterData, matchup };
  } catch (err) {
    // History is an enhancement — never block an analysis on it.
    console.warn("[coaching] recurring patterns unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** The player's record as `character` vs `opponentCharacter`, leaving out the game(s) under review. */
export function getMatchupBackground(
  character: string,
  opponentCharacter: string,
  excludeGameIds: number[] = [],
): CoachingBackground | undefined {
  try {
    const stats = getAggregateStats({ character, opponentCharacter, excludeGameIds });
    if (!stats || stats.gamesPlayed <= 0) return undefined;
    return {
      matchupRecord: {
        character,
        opponentCharacter,
        wins: stats.wins,
        losses: stats.losses,
        games: stats.gamesPlayed,
      },
    };
  } catch (err) {
    console.warn("[coaching] matchup record unavailable:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

export function buildCoachingContext(
  gameResults: GameResult[],
  targetTag: string,
  excludeGameIds: number[] = [],
): { background: CoachingBackground | undefined; patterns: RecurringPatterns | null } {
  const characters: string[] = [];
  const opponents: string[] = [];
  for (const r of gameResults) {
    const idx = findPlayerIdx(r.gameSummary, targetTag);
    characters.push(r.gameSummary.players[idx].character);
    opponents.push(r.gameSummary.players[idx === 0 ? 1 : 0].character);
  }
  const character = mostCommon(characters);
  const opponent = mostCommon(opponents);
  const background = character && opponent ? getMatchupBackground(character, opponent, excludeGameIds) : undefined;
  const patterns = character ? getRecurringPatterns(character, opponent, excludeGameIds) : null;

  return { background, patterns };
}
