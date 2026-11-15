import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import {
  BEST_CHARACTER_MIN_DECIDED_GAMES,
  EMPTY_CHARACTER_TOTALS,
  STANDOUT_MIN_RELATIVE_GAP,
  closestToQualifying,
  compareToOtherCharacters,
  describeStandouts,
  pickBestCharacter,
  rankCharactersByRecord,
  sumCharacterTotals,
  wilsonLowerBound,
  type CharacterTotals,
} from "../src/bestCharacter";

const DB_SOURCE = fs.readFileSync(path.resolve(__dirname, "../src/db.ts"), "utf-8");

function functionSource(name: string): string {
  const start = DB_SOURCE.indexOf(`export function ${name}(`);
  expect(start, `${name} exists in db.ts`).toBeGreaterThan(-1);
  const next = DB_SOURCE.indexOf("\nexport function ", start + 1);
  return DB_SOURCE.slice(start, next === -1 ? undefined : next);
}

function totals(overrides: Partial<CharacterTotals> = {}): CharacterTotals {
  return {
    neutralWins: 500,
    neutralExchanges: 1000,
    conversions: 400,
    openings: 1000,
    damageOnOpenings: 20000,
    recoverySuccesses: 300,
    recoveryAttempts: 500,
    edgeguardKills: 50,
    edgeguardAttempts: 500,
    ...overrides,
  };
}

describe("wilsonLowerBound", () => {
  it("matches the 95% Wilson score interval", () => {
    // 8 of 10: lower bound 0.4902 (standard worked example).
    expect(wilsonLowerBound(8, 10)).toBeCloseTo(0.4902, 4);
    // 389 of 766 at z = 1.96.
    expect(wilsonLowerBound(389, 766)).toBeCloseTo(0.4725, 4);
  });

  it("is 0 with no decided games and never exceeds the plain win rate", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
    expect(wilsonLowerBound(0, 25)).toBe(0);
    expect(wilsonLowerBound(30, 40)).toBeLessThan(30 / 40);
    expect(wilsonLowerBound(40, 40)).toBeLessThan(1);
  });
});

describe("rankCharactersByRecord", () => {
  it("ranks a large solid record above a small perfect one", () => {
    const ranked = rankCharactersByRecord([
      { character: "Pichu", wins: 10, losses: 0 },
      { character: "Fox", wins: 400, losses: 100 },
    ]);
    expect(ranked.map((r) => r.character)).toEqual(["Fox", "Pichu"]);
    expect(ranked[0]).toMatchObject({ decidedGames: 500, winRate: 0.8 });
  });

  it("still lets the better win rate win when both samples are large", () => {
    const best = pickBestCharacter([
      { character: "Marth", wins: 504, losses: 600 },
      { character: "Peach", wins: 389, losses: 377 },
      { character: "Roy", wins: 21, losses: 60 },
    ]);
    expect(best?.character).toBe("Peach");
  });

  it("NEGATIVE: a character below the decided-game minimum is never ranked, whatever its win rate", () => {
    const short = BEST_CHARACTER_MIN_DECIDED_GAMES - 1;
    expect(rankCharactersByRecord([{ character: "Falco", wins: short, losses: 0 }])).toEqual([]);
    expect(pickBestCharacter([{ character: "Falco", wins: short, losses: 0 }])).toBeNull();
    const best = pickBestCharacter([
      { character: "Falco", wins: short, losses: 0 },
      { character: "Sheik", wins: 4, losses: 6 },
    ]);
    expect(best?.character).toBe("Sheik");
  });

  it("NEGATIVE: draws and unfinished games are not decided games", () => {
    // 9 decided games however many other rows the character has: wins + losses is all that counts.
    expect(pickBestCharacter([{ character: "Fox", wins: 5, losses: 4 }])).toBeNull();
  });

  it("orders ties the same way whatever the input order: more decided games, then name", () => {
    const a = [
      { character: "Zelda", wins: 10, losses: 10 },
      { character: "Bowser", wins: 10, losses: 10 },
      { character: "Luigi", wins: 0, losses: 12 },
      { character: "Kirby", wins: 0, losses: 30 },
    ];
    const forward = rankCharactersByRecord(a).map((r) => r.character);
    const backward = rankCharactersByRecord([...a].reverse()).map((r) => r.character);
    expect(forward).toEqual(["Bowser", "Zelda", "Kirby", "Luigi"]);
    expect(backward).toEqual(forward);
  });
});

describe("closestToQualifying", () => {
  it("names the character with the most decided games", () => {
    expect(
      closestToQualifying([
        { character: "Fox", wins: 2, losses: 2 },
        { character: "Marth", wins: 1, losses: 5 },
      ]),
    ).toEqual({ character: "Marth", decidedGames: 6 });
  });

  it("is null when no game was decided", () => {
    expect(closestToQualifying([{ character: "Fox", wins: 0, losses: 0 }])).toBeNull();
  });
});

describe("compareToOtherCharacters", () => {
  it("picks the largest relative lead and the largest relative shortfall", () => {
    const mine = totals({ damageOnOpenings: 24000, edgeguardKills: 30, neutralWins: 520 });
    const others = totals();
    const c = compareToOtherCharacters(mine, others);
    // damage per opening 24.0 vs 20.0 (+20%) beats neutral 52% vs 50% (+4%, under the threshold anyway).
    expect(c.strongest).toMatchObject({ key: "damagePerOpening", value: 24, otherValue: 20 });
    expect(c.strongest?.relativeGap).toBeCloseTo(0.2, 10);
    // edgeguards 6% vs 10% (-40%).
    expect(c.weakest).toMatchObject({ key: "edgeguard", num: 30, den: 500, otherNum: 50, otherDen: 500 });
    expect(c.weakest?.relativeGap).toBeCloseTo(-0.4, 10);
    expect(describeStandouts(c)).toBe(
      "You do more damage per opening with them than with your other characters, but you also need to work on finishing your edgeguards.",
    );
  });

  it("pools counts instead of averaging rates", () => {
    // 1 of 2 and 99 of 198 pooled is 100 of 200 = 50%, not the mean of two rates weighted equally.
    const pooled = sumCharacterTotals([
      { recoverySuccesses: 0, recoveryAttempts: 2 },
      { recoverySuccesses: 100, recoveryAttempts: 198 },
    ]);
    expect(pooled.recoverySuccesses / pooled.recoveryAttempts).toBe(0.5);
    expect(sumCharacterTotals([])).toEqual(EMPTY_CHARACTER_TOTALS);
  });

  it("NEGATIVE: a gap under the threshold is neither a strength nor a weakness", () => {
    const just = STANDOUT_MIN_RELATIVE_GAP - 0.01;
    const mine = totals({ neutralWins: 500 * (1 + just), edgeguardKills: 50 * (1 - just) });
    const c = compareToOtherCharacters(mine, totals());
    expect(c.measures).toHaveLength(5);
    expect(c.strongest).toBeNull();
    expect(c.weakest).toBeNull();
    expect(describeStandouts(c)).toBe("Every measured area is within 5% of your other characters.");
  });

  it("NEGATIVE: a measure without enough events on either side is not compared", () => {
    const mine = totals({ edgeguardKills: 0, edgeguardAttempts: 49 });
    const c = compareToOtherCharacters(mine, totals());
    expect(c.measures.map((m) => m.key)).not.toContain("edgeguard");
    expect(c.weakest).toBeNull();

    const thinOthers = compareToOtherCharacters(totals(), totals({ recoverySuccesses: 0, recoveryAttempts: 10 }));
    expect(thinOthers.measures.map((m) => m.key)).not.toContain("recovery");
  });

  it("NEGATIVE: with no other character there is nothing to compare and no sentence", () => {
    const c = compareToOtherCharacters(totals(), EMPTY_CHARACTER_TOTALS);
    expect(c).toEqual({ measures: [], strongest: null, weakest: null });
    expect(describeStandouts(c)).toBe("");
  });

  it("says so when only one side stands out", () => {
    const onlyGood = compareToOtherCharacters(totals({ conversions: 500 }), totals());
    expect(onlyGood.weakest).toBeNull();
    expect(describeStandouts(onlyGood)).toBe(
      "You turn more of your openings into multi-hit punishes with them than with your other characters. Nothing measured trails your other characters by 5% or more.",
    );
    const onlyBad = compareToOtherCharacters(totals({ recoverySuccesses: 200 }), totals());
    expect(onlyBad.strongest).toBeNull();
    expect(describeStandouts(onlyBad)).toBe(
      "Nothing measured is ahead of your other characters by 5% or more, and you need to work on your recovery.",
    );
  });
});

describe("database side of the best-character panel", () => {
  it("getCharacterList pools event counts per character", () => {
    const src = functionSource("getCharacterList");
    expect(src).toContain("SUM(gs.neutral_wins) as neutralWins");
    expect(src).toContain("SUM(gs.neutral_wins + gs.neutral_losses) as neutralExchanges");
    expect(src).toContain("SUM(gs.total_conversions) as conversions");
    expect(src).toContain("SUM(gs.total_openings) as openings");
    expect(src).toContain("SUM(gs.avg_damage_per_opening * gs.total_openings) as damageOnOpenings");
    expect(src).toContain("SUM(ROUND(gs.recovery_success_rate * gs.recovery_attempts)) as recoverySuccesses");
    expect(src).toContain("SUM(ROUND(gs.edgeguard_success_rate * gs.edgeguard_attempts)) as edgeguardKills");
  });

  it("NEGATIVE: the panel's counts never come from the per-game L-cancel rate or death percent", () => {
    // Both store 0 for a game with no attempts / no deaths, so they cannot be pooled exactly.
    const src = functionSource("getCharacterList");
    const pooled = src.slice(src.indexOf("SUM(gs.neutral_wins) as neutralWins"), src.indexOf("FROM games g"));
    expect(pooled).not.toContain("l_cancel_rate");
    expect(pooled).not.toContain("avg_death_percent");
    expect(pooled).not.toContain("openings_per_kill");
  });

  it("getDashboardHighlights uses the shared ranker, not its own win-rate ordering", () => {
    const src = functionSource("getDashboardHighlights");
    expect(src).toContain("pickBestCharacter(getCharacterList())");
    expect(src).not.toContain("GROUP BY g.player_character");
  });
});
