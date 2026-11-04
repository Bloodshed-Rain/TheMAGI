// Shared context for the game/set coaching prompt: lifetime profile plus the
// target player's measured recurring patterns (character-wide history and the
// same-matchup subset). Every coaching entry point (IPC handlers, importer,
// auto-analysis) goes through here so the prompt always gets the same data.

import { findPlayerIdx, type GameResult, type PlayerHistory } from "./pipeline";
import type { RecurringPatterns } from "./pipeline/patterns";
import { getPatternData, getPlayerHistory } from "./db";

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

export function buildCoachingContext(
  gameResults: GameResult[],
  targetTag: string,
  excludeGameIds: number[] = [],
): { playerHistory: PlayerHistory | undefined; patterns: RecurringPatterns | null } {
  let playerHistory: PlayerHistory | undefined;
  try {
    playerHistory = getPlayerHistory(targetTag) ?? undefined;
  } catch {
    playerHistory = undefined;
  }

  const characters: string[] = [];
  const opponents: string[] = [];
  for (const r of gameResults) {
    const idx = findPlayerIdx(r.gameSummary, targetTag);
    characters.push(r.gameSummary.players[idx].character);
    opponents.push(r.gameSummary.players[idx === 0 ? 1 : 0].character);
  }
  const character = mostCommon(characters);
  const patterns = character ? getRecurringPatterns(character, mostCommon(opponents), excludeGameIds) : null;

  return { playerHistory, patterns };
}
