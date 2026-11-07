// better-sqlite3 is compiled for Electron's Node version, so (as in
// db.test.ts) these checks read the query source instead of running it.
// They pin what the career analysis is allowed to build insight on.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const DB_SOURCE = fs.readFileSync(path.resolve(__dirname, "../src/db.ts"), "utf-8");

function functionSource(name: string): string {
  const start = DB_SOURCE.indexOf(`export function ${name}(`);
  expect(start, `${name} exists in db.ts`).toBeGreaterThan(-1);
  const next = DB_SOURCE.indexOf("\nexport function ", start + 1);
  return DB_SOURCE.slice(start, next === -1 ? undefined : next);
}

describe("career determinants (getDeepInsightsData)", () => {
  const src = functionSource("getDeepInsightsData");

  it("NEGATIVE: never feeds a labeled approximation or a proxy score into correlations", () => {
    expect(src).not.toContain("power_shield_count");
    expect(src).not.toContain("di_survival_score");
    expect(src).not.toContain("di_combo_score");
  });

  it("POSITIVE: reports sample sizes and gates correlations on games and strength", () => {
    expect(src).toContain("gamesAnalyzed: rows.length");
    expect(src).toContain("rows.length >= DEEP_INSIGHTS_CORRELATION_MIN_GAMES");
    expect(src).toContain("Math.abs(r) >= DEEP_INSIGHTS_CORRELATION_MIN_R");
    expect(DB_SOURCE).toContain("export const DEEP_INSIGHTS_CORRELATION_MIN_GAMES = 20;");
    expect(DB_SOURCE).toContain("export const DEEP_INSIGHTS_CORRELATION_MIN_R = 0.25;");
    expect(src).toContain("games: games.length");
  });
});

describe("career drift (getCareerDrift)", () => {
  const src = functionSource("getCareerDrift");

  it("compares non-overlapping oldest and newest windows ordered by when the game was played", () => {
    expect(src).toContain("Math.min(Math.floor(windowGames), Math.floor(total / 2))");
    expect(src).toContain("if (w < 10) return null;");
    expect(src).toContain("ORDER BY COALESCE(g.played_at, g.created_at) ${order}, g.id ${order}");
  });

  it("NEGATIVE: leaves the per-game L-cancel rate out (a game with no attempts stores 0)", () => {
    const columns = DB_SOURCE.slice(
      DB_SOURCE.indexOf("const CAREER_DRIFT_COLUMNS"),
      DB_SOURCE.indexOf("export function getCareerDrift("),
    );
    expect(columns).not.toContain("l_cancel_rate");
    expect(columns).toContain('column: "neutral_win_rate"');
  });
});

describe("matchup background (getAggregateStats)", () => {
  it("can exclude the analyzed game ids so a record is 'before this game'", () => {
    const src = functionSource("getAggregateStats");
    expect(src).toContain("g.id NOT IN (SELECT value FROM json_each(?))");
    expect(DB_SOURCE).toContain("excludeGameIds?: number[];");
  });
});
