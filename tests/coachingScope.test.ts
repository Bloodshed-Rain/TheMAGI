// Every AI analysis is scoped to the data that invoked it: a single game
// reports that game, a character scope reports the games played AS that
// character, and the career analysis reports the whole record. These tests
// pin the prompt text and the data each assembler prints (and withholds).

import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import {
  processGame,
  assembleUserPrompt,
  assembleAggregatePrompt,
  assembleCareerPrompt,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_AGGREGATE,
  SYSTEM_PROMPT_CAREER,
  formatRecurringPatterns,
  formatPatternBreakdown,
  type PatternData,
  type CareerPromptData,
} from "../src/pipeline";
import { CAREER_ANALYSIS_MIN_GAMES, CAREER_RECENT_WINDOW_GAMES } from "../src/careerAnalysis";
import { parseCoachingSections } from "../src/renderer/utils/parseCoachingSections";

const FIXTURES = path.resolve(__dirname, "fixtures");
const replay = path.join(FIXTURES, fs.readdirSync(FIXTURES).find((f) => f.endsWith(".slp"))!);
const result = processGame(replay, 1);
const tag = result.gameSummary.players[0].tag;

function emptyPatterns(label: string, games = 50): PatternData {
  return {
    label,
    games,
    currentGames: games,
    habits: [],
    deaths: { total: 0, verdicts: {}, resourceFaults: 0, byKiller: [] },
    throwDI: [],
    whiffCapture: { opportunities: 0, punished: 0, unpunishedByMove: [] },
    whiffExposure: [],
    shieldDefense: { graded: 0, taken: 0, missed: 0, byMove: [] },
    shieldPressure: { graded: 0, unsafe: 0, punished: 0 },
    recovery: { spans: 0, died: 0, routes: [], djEarly: 0, djEarlyDied: 0 },
    edgeguard: { opportunities: 0, kills: 0, byDepth: [] },
  };
}

function withLedge(base: PatternData, roll: number, total: number): PatternData {
  return {
    ...base,
    habits: [
      { situation: "ledge", option: "roll", total: roll, punishedOf: roll, punished: 0 },
      { situation: "ledge", option: "stand", total: total - roll, punishedOf: total - roll, punished: 0 },
    ],
  };
}

describe("single-game scope", () => {
  it("SYSTEM_PROMPT anchors every finding in the reviewed game and lets history only name it", () => {
    expect(SYSTEM_PROMPT).toContain("SCOPE: THIS GAME (OR THIS SET)");
    expect(SYSTEM_PROMPT).toContain(
      "A pattern that exists in the player's history but did not occur in this game is not a finding here.",
    );
    expect(SYSTEM_PROMPT).toContain("decides what to CALL a finding, never whether it counts");
    // The old rule demoted this-game findings below history-wide habits.
    expect(SYSTEM_PROMPT).not.toContain("must not be the top finding");
  });

  it("POSITIVE: prints the matchup record as background, before the game and never as a lifetime profile", () => {
    const prompt = assembleUserPrompt([result], tag, {
      matchupRecord: { character: "Peach", opponentCharacter: "Fox", wins: 3, losses: 5, games: 8 },
    });
    expect(prompt).toContain(`before this game, ${tag}'s record as Peach vs Fox was 3W-5L over 8 games`);
    expect(prompt).toContain("Background only, do not recite");
    expect(prompt).not.toContain("Lifetime record");
    expect(prompt).not.toContain("Characters played");
    expect(prompt).not.toContain("Recent trend");
  });

  it("NEGATIVE: prints no background line without a matchup record, and none for an empty record", () => {
    expect(assembleUserPrompt([result], tag)).not.toContain("Background only");
    expect(
      assembleUserPrompt([result], tag, {
        matchupRecord: { character: "Peach", opponentCharacter: "Fox", wins: 0, losses: 0, games: 0 },
      }),
    ).not.toContain("Background only");
  });
});

describe("character / stage / opponent scope", () => {
  it("SYSTEM_PROMPT_AGGREGATE defines character scope as games played AS the character and bans other scopes", () => {
    expect(SYSTEM_PROMPT_AGGREGATE).toContain(
      "CHARACTER scope = the games the player played AS that character, never games against it.",
    );
    expect(SYSTEM_PROMPT_AGGREGATE).toContain("never recite the player's lifetime record");
    expect(SYSTEM_PROMPT_AGGREGATE).not.toContain("whole career");
  });

  it("assembleAggregatePrompt states the scope with its record and share of the lifetime, and nothing cross-scope", () => {
    const stats = { gamesPlayed: 85, wins: 48, losses: 37, avgNeutralWinRate: 0.51 };
    const prompt = assembleAggregatePrompt(stats, "character", "Fox", { lifetimeGames: 200 });
    expect(prompt).toContain(
      "Scope: CHARACTER — the player's games playing AS Fox: 48W-37L over 85 games (43% of the player's 200 recorded games).",
    );
    expect(prompt).not.toContain("Lifetime record");
    expect(prompt).not.toContain("Characters played");
    expect(assembleAggregatePrompt(stats, "opponent", "ABCD#123")).toContain(
      "the player's games against ABCD#123: 48W-37L over 85 games.",
    );
  });
});

describe("career (all recorded games) scope", () => {
  const sample = (): CareerPromptData => ({
    tag: "Mang0",
    overview: {
      games: 212,
      wins: 120,
      losses: 92,
      firstPlayedAt: "2025-01-02T18:00:00.000Z",
      lastPlayedAt: "2026-11-01T02:30:00.000Z",
      characters: [
        { character: "Falco", games: 150, wins: 90, losses: 60 },
        { character: "Fox", games: 62, wins: 30, losses: 32 },
      ],
      opponentCharacters: [{ opponentCharacter: "Marth", games: 70, wins: 40, losses: 30 }],
    },
    drift: {
      windowGames: 20,
      rows: [
        { label: "neutral win rate", early: 0.482, recent: 0.529, unit: "pct" },
        { label: "openings per kill", early: 7.4, recent: 6.1, unit: "num" },
      ],
    },
    recentVsAllLines: [
      "  roll — share: last 30 games 45% of 100 · all games 30% of 400  ◄ last 30 games +15 pts vs all games",
    ],
    byCharacterLines: ["  as Falco (150 games): deaths with no DI input 20% of 300"],
    byMatchupLines: ["  vs Marth (70 games): deaths with no DI input 31% of 140"],
    determinants: {
      gamesAnalyzed: 212,
      wins: 120,
      losses: 92,
      correlations: [{ metricA: "Edgeguard Success", metricB: "Win/Loss", coefficient: 0.41 }],
      situationalAverages: [{ label: "Short games (≤ 300s)", games: 106, metrics: { neutralWinRate: 0.5 } }],
      winLossDiffs: { "Neutral Win Rate": 0.08 },
    },
  });

  it("SYSTEM_PROMPT_CAREER asks for what only the whole record shows, under the career headings, with the evidence rules", () => {
    expect(SYSTEM_PROMPT_CAREER).toContain("ENTIRE recorded history");
    for (const heading of [
      "## The Read",
      "## Only the Full Record Shows",
      "## Fix This First",
      "## Also Worth Fixing",
      "## Keep Doing",
      "## Practice Plan",
    ]) {
      expect(SYSTEM_PROMPT_CAREER).toContain(heading);
    }
    expect(SYSTEM_PROMPT_CAREER).toContain("Never present one as a cause.");
    expect(SYSTEM_PROMPT_CAREER).toContain("FAIR→FAIR→DAIR finishing sequence whose final DAIR takes the stock");
    expect(SYSTEM_PROMPT_CAREER).not.toMatch(/matrix-esque|superhuman/i);
  });

  it("assembleCareerPrompt prints the record, both windows, every block and the sample sizes", () => {
    const prompt = assembleCareerPrompt(sample());
    expect(prompt).toContain("=== SCOPE: ALL RECORDED GAMES for Mang0 ===");
    expect(prompt).toContain("212 games (120W-92L), from 2025-01-02 to 2026-11-01.");
    expect(prompt).toContain("Characters played: Falco 150 games (90W-60L), Fox 62 games (30W-32L)");
    expect(prompt).toContain("oldest 20 games vs the newest 20");
    expect(prompt).toContain("  neutral win rate: early 48.2% → recent 52.9%");
    expect(prompt).toContain("  openings per kill: early 7.4 → recent 6.1");
    expect(prompt).toContain("◄ last 30 games +15 pts vs all games");
    expect(prompt).toContain("PER CHARACTER YOU PLAY");
    expect(prompt).toContain("PER OPPONENT CHARACTER");
    expect(prompt).toContain("over 120 wins and 92 losses");
    expect(prompt).toContain("Short games (≤ 300s), 106 games:");
    expect(prompt).toContain("Pearson r across 212 games");
    expect(prompt).toContain("  Edgeguard Success × Win/Loss: r = 0.41");
  });

  it("NEGATIVE: says correlations are omitted instead of inventing them, and skips absent blocks", () => {
    const data = sample();
    data.determinants = { ...data.determinants!, gamesAnalyzed: 15, correlations: [] };
    data.drift = null;
    data.byCharacterLines = [];
    const prompt = assembleCareerPrompt(data);
    expect(prompt).toContain("(Pairwise correlations omitted: 15 games is too few to report them.)");
    expect(prompt).not.toContain("Pearson r across");
    expect(prompt).not.toContain("EARLY vs RECENT");
    expect(prompt).not.toContain("PER CHARACTER YOU PLAY");
  });

  it("contract: the Dashboard analysis needs a floor of games and compares a recent window", () => {
    expect(CAREER_ANALYSIS_MIN_GAMES).toBeGreaterThanOrEqual(10);
    expect(CAREER_RECENT_WINDOW_GAMES).toBeGreaterThan(CAREER_ANALYSIS_MIN_GAMES);
  });
});

describe("formatRecurringPatterns names its columns in the deviation flag", () => {
  it("POSITIVE: a recent-window rate far from the career baseline is flagged with both labels", () => {
    const recent = withLedge(emptyPatterns("last 30 games", 30), 45, 100);
    const all = withLedge(emptyPatterns("all games", 400), 30, 100);
    const text = formatRecurringPatterns({ character: all, matchup: recent }).join("\n");
    expect(text).toContain("Each line reads: last 30 games · all games.");
    expect(text).toContain(
      "roll — share: last 30 games 45% of 100 · all games 30% of 100  ◄ last 30 games +15 pts vs all games",
    );
  });

  it("NEGATIVE: a gap under the threshold gets no flag", () => {
    const recent = withLedge(emptyPatterns("last 30 games", 30), 35, 100);
    const all = withLedge(emptyPatterns("all games", 400), 30, 100);
    const rollLine = formatRecurringPatterns({ character: all, matchup: recent }).find((l) =>
      l.includes("roll — share"),
    )!;
    expect(rollLine).toContain("last 30 games 35% of 100 · all games 30% of 100");
    expect(rollLine).not.toContain("◄");
  });
});

describe("formatPatternBreakdown", () => {
  it("POSITIVE: one row per scope with rates under the shared sample guards, low-n cells shown as raw fractions", () => {
    const row: PatternData = {
      ...emptyPatterns("vs Fox", 40),
      habits: [{ situation: "ledge", option: "roll", total: 40, punishedOf: 40, punished: 12 }],
      deaths: { total: 25, verdicts: { NO_DI: 10, GOOD_DI: 15 }, resourceFaults: 0, byKiller: [] },
      whiffCapture: { opportunities: 10, punished: 3, unpunishedByMove: [] },
    };
    expect(formatPatternBreakdown([row])).toEqual([
      "  vs Fox (40 games): ledge/knockdown/OOS options punished 30% of 40; deaths with no DI input 40% of 25; their punishable whiffs you punished 3/10 (low n)",
    ]);
  });

  it("NEGATIVE: a scope with nothing measured is omitted rather than printed empty", () => {
    expect(formatPatternBreakdown([emptyPatterns("vs Sheik", 12)])).toEqual([]);
  });
});

describe("coaching cards understand the career heading", () => {
  it("classifies 'Only the Full Record Shows' as the long-run section", () => {
    const md = "## The Read\na\n## Only the Full Record Shows\nb\n## Fix This First\nc";
    expect(parseCoachingSections(md).map((s) => s.type)).toEqual(["read", "long-run", "fix-first"]);
  });
});
