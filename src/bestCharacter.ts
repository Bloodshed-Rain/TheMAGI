// Single definition of "your best character", shared by the Dashboard panel
// (renderer) and getDashboardHighlights (main). Pure: no DB, no Electron.
//
// "Best" is decided by results only. A raw win rate would let a 3-0 pocket pick
// outrank 300 games at 60%, so characters are ranked by the lower bound of the
// 95% Wilson score interval on their win rate: the win rate the record
// supports once sample size is taken into account. Draws are not decided games
// and count toward neither side.

/** Decided (win or loss) games a character needs before it can be ranked at all. */
export const BEST_CHARACTER_MIN_DECIDED_GAMES = 10;

/** z for a two-sided 95% interval. */
const WILSON_Z = 1.96;

export interface CharacterRecord {
  character: string;
  wins: number;
  losses: number;
}

export interface RankedCharacter extends CharacterRecord {
  /** wins + losses. */
  decidedGames: number;
  /** wins / decidedGames, unrounded. */
  winRate: number;
  /** Lower bound of the 95% Wilson interval on winRate; the ranking key. */
  ratedWinRate: number;
}

/** Lower bound of the Wilson score interval for `wins` successes in `decided` trials. 0 when there are no trials. */
export function wilsonLowerBound(wins: number, decided: number, z: number = WILSON_Z): number {
  if (!(decided > 0)) return 0;
  const p = wins / decided;
  const z2 = z * z;
  const center = p + z2 / (2 * decided);
  const margin = z * Math.sqrt((p * (1 - p)) / decided + z2 / (4 * decided * decided));
  return Math.max(0, (center - margin) / (1 + z2 / decided));
}

/**
 * Every character with at least BEST_CHARACTER_MIN_DECIDED_GAMES decided games,
 * best first. Ties break on more decided games, then name, so the order never
 * depends on row order.
 */
export function rankCharactersByRecord(records: readonly CharacterRecord[]): RankedCharacter[] {
  return records
    .map((r) => {
      const wins = Math.max(0, r.wins || 0);
      const losses = Math.max(0, r.losses || 0);
      const decidedGames = wins + losses;
      return {
        character: r.character,
        wins,
        losses,
        decidedGames,
        winRate: decidedGames > 0 ? wins / decidedGames : 0,
        ratedWinRate: wilsonLowerBound(wins, decidedGames),
      };
    })
    .filter((r) => r.decidedGames >= BEST_CHARACTER_MIN_DECIDED_GAMES)
    .sort(
      (a, b) =>
        b.ratedWinRate - a.ratedWinRate ||
        b.decidedGames - a.decidedGames ||
        (a.character < b.character ? -1 : a.character > b.character ? 1 : 0),
    );
}

/** The top-ranked character, or null when no character has enough decided games yet. */
export function pickBestCharacter(records: readonly CharacterRecord[]): RankedCharacter | null {
  return rankCharactersByRecord(records)[0] ?? null;
}

/**
 * The character closest to qualifying (most decided games, then name), for the
 * "not enough games yet" state. Null when there are no decided games at all.
 */
export function closestToQualifying(
  records: readonly CharacterRecord[],
): { character: string; decidedGames: number } | null {
  let best: { character: string; decidedGames: number } | null = null;
  for (const r of records) {
    const decidedGames = Math.max(0, r.wins || 0) + Math.max(0, r.losses || 0);
    if (decidedGames === 0) continue;
    if (
      !best ||
      decidedGames > best.decidedGames ||
      (decidedGames === best.decidedGames && r.character < best.character)
    ) {
      best = { character: r.character, decidedGames };
    }
  }
  return best;
}

// ── What the best character does better and worse ──────────────────────
//
// "You do Y well with them / work on Z" is a comparison against the player's
// own other characters, never against an outside benchmark or a 0-100 chart
// score. Every figure is pooled from counts (wins of exchanges, kills of
// attempts), so a game with no attempts adds nothing instead of counting as 0%.

/** Counts pooled over every game with one character, or over a set of characters. */
export interface CharacterTotals {
  neutralWins: number;
  neutralExchanges: number;
  /** Openings that became a conversion of two or more hits (slippi-js successfulConversions). */
  conversions: number;
  openings: number;
  /** Damage dealt across those openings. */
  damageOnOpenings: number;
  recoverySuccesses: number;
  recoveryAttempts: number;
  edgeguardKills: number;
  edgeguardAttempts: number;
}

export const EMPTY_CHARACTER_TOTALS: CharacterTotals = {
  neutralWins: 0,
  neutralExchanges: 0,
  conversions: 0,
  openings: 0,
  damageOnOpenings: 0,
  recoverySuccesses: 0,
  recoveryAttempts: 0,
  edgeguardKills: 0,
  edgeguardAttempts: 0,
};

export function sumCharacterTotals(rows: readonly Partial<CharacterTotals>[]): CharacterTotals {
  const total = { ...EMPTY_CHARACTER_TOTALS };
  for (const row of rows) {
    for (const key of Object.keys(total) as (keyof CharacterTotals)[]) {
      const v = row[key];
      if (typeof v === "number" && Number.isFinite(v)) total[key] += v;
    }
  }
  return total;
}

export type StandoutKey = "neutral" | "conversion" | "damagePerOpening" | "recovery" | "edgeguard";

interface StandoutDef {
  key: StandoutKey;
  /** Short name of the measure. */
  label: string;
  /** Completes "You ___ with them than with your other characters". */
  doesWell: string;
  /** Completes "you also need to work on ___". */
  workOn: string;
  unit: "rate" | "damage";
  /** Events needed on EACH side before the measure is compared at all. */
  minSample: number;
  num: (t: CharacterTotals) => number;
  den: (t: CharacterTotals) => number;
}

/** Fixed order; also the tie-break when two measures have the same gap. */
const STANDOUT_DEFS: readonly StandoutDef[] = [
  {
    key: "neutral",
    label: "Neutral win rate",
    doesWell: "win neutral more often",
    workOn: "winning neutral",
    unit: "rate",
    minSample: 100,
    num: (t) => t.neutralWins,
    den: (t) => t.neutralExchanges,
  },
  {
    key: "conversion",
    label: "Openings converted",
    doesWell: "turn more of your openings into multi-hit punishes",
    workOn: "following up your openings",
    unit: "rate",
    minSample: 100,
    num: (t) => t.conversions,
    den: (t) => t.openings,
  },
  {
    key: "damagePerOpening",
    label: "Damage per opening",
    doesWell: "do more damage per opening",
    workOn: "your damage per opening",
    unit: "damage",
    minSample: 100,
    num: (t) => t.damageOnOpenings,
    den: (t) => t.openings,
  },
  {
    key: "recovery",
    label: "Recoveries that made it back",
    doesWell: "make it back to the stage more often",
    workOn: "your recovery",
    unit: "rate",
    minSample: 50,
    num: (t) => t.recoverySuccesses,
    den: (t) => t.recoveryAttempts,
  },
  {
    key: "edgeguard",
    label: "Edgeguards that took the stock",
    doesWell: "finish more of your edgeguards",
    workOn: "finishing your edgeguards",
    unit: "rate",
    minSample: 50,
    num: (t) => t.edgeguardKills,
    den: (t) => t.edgeguardAttempts,
  },
];

/** A measure is only called a strength or a weakness when it differs from the other characters by at least this much, relatively. */
export const STANDOUT_MIN_RELATIVE_GAP = 0.05;

export interface StandoutMeasure {
  key: StandoutKey;
  label: string;
  doesWell: string;
  workOn: string;
  unit: "rate" | "damage";
  /** This character: num / den. */
  value: number;
  num: number;
  den: number;
  /** The player's other characters combined: otherNum / otherDen. */
  otherValue: number;
  otherNum: number;
  otherDen: number;
  /** (value - otherValue) / otherValue. Higher is better for every measure. */
  relativeGap: number;
}

export interface StandoutComparison {
  /** Every measure with enough events on both sides, in fixed order. */
  measures: StandoutMeasure[];
  /** Largest gap at or above +STANDOUT_MIN_RELATIVE_GAP, else null. */
  strongest: StandoutMeasure | null;
  /** Largest shortfall at or below -STANDOUT_MIN_RELATIVE_GAP, else null. */
  weakest: StandoutMeasure | null;
}

/**
 * Compare one character's pooled counts with the player's other characters
 * combined. A measure is skipped unless both sides have `minSample` events, so
 * with no meaningful second character `measures` is empty.
 */
export function compareToOtherCharacters(mine: CharacterTotals, others: CharacterTotals): StandoutComparison {
  const measures: StandoutMeasure[] = [];
  for (const def of STANDOUT_DEFS) {
    const num = def.num(mine);
    const den = def.den(mine);
    const otherNum = def.num(others);
    const otherDen = def.den(others);
    if (den < def.minSample || otherDen < def.minSample) continue;
    const value = num / den;
    const otherValue = otherNum / otherDen;
    if (!(otherValue > 0)) continue;
    measures.push({
      key: def.key,
      label: def.label,
      doesWell: def.doesWell,
      workOn: def.workOn,
      unit: def.unit,
      value,
      num,
      den,
      otherValue,
      otherNum,
      otherDen,
      relativeGap: (value - otherValue) / otherValue,
    });
  }

  let strongest: StandoutMeasure | null = null;
  let weakest: StandoutMeasure | null = null;
  for (const m of measures) {
    if (m.relativeGap >= STANDOUT_MIN_RELATIVE_GAP && (!strongest || m.relativeGap > strongest.relativeGap)) {
      strongest = m;
    }
    if (m.relativeGap <= -STANDOUT_MIN_RELATIVE_GAP && (!weakest || m.relativeGap < weakest.relativeGap)) {
      weakest = m;
    }
  }
  return { measures, strongest, weakest };
}

/** The panel's sentence after "<X> is your best character." Empty when there is nothing to compare against. */
export function describeStandouts(comparison: StandoutComparison): string {
  const { measures, strongest, weakest } = comparison;
  if (measures.length === 0) return "";
  const gap = `${Math.round(STANDOUT_MIN_RELATIVE_GAP * 100)}%`;
  if (strongest && weakest) {
    return `You ${strongest.doesWell} with them than with your other characters, but you also need to work on ${weakest.workOn}.`;
  }
  if (strongest) {
    return `You ${strongest.doesWell} with them than with your other characters. Nothing measured trails your other characters by ${gap} or more.`;
  }
  if (weakest) {
    return `Nothing measured is ahead of your other characters by ${gap} or more, and you need to work on ${weakest.workOn}.`;
  }
  return `Every measured area is within ${gap} of your other characters.`;
}
