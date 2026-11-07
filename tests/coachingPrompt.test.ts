import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import {
  processGame,
  assembleUserPrompt,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_AGGREGATE,
  formatRecurringPatterns,
  patternsFromFrameEvents,
  type PatternData,
} from "../src/pipeline";
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

describe("coaching system prompts (v2)", () => {
  it("asks for findings, not recaps, in the headings the coaching cards understand", () => {
    for (const heading of ["## The Read", "## Fix This First", "## Also Worth Fixing", "## Exploit Next Game", "## Practice Plan"]) {
      expect(SYSTEM_PROMPT).toContain(heading);
    }
    expect(SYSTEM_PROMPT).not.toContain("## Game Overview");
    expect(SYSTEM_PROMPT).not.toContain("Coach's Wisdom");
  });

  it("no longer claims stick inputs are unobservable (measured DI exists)", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/stick inputs[^.]*not observable/i);
    expect(SYSTEM_PROMPT_AGGREGATE).not.toMatch(/stick inputs[^.]*not observable/i);
  });

  it("keeps the strict Ken Combo and observed-sequence definitions in both prompts", () => {
    for (const p of [SYSTEM_PROMPT, SYSTEM_PROMPT_AGGREGATE]) {
      expect(p).toContain("FAIR→FAIR→DAIR finishing sequence whose final DAIR takes the stock");
      expect(p).toContain("does not establish multishine or waveshine inputs");
      expect(p).toContain("does not distinguish tipper from sourspot");
    }
  });
});

describe("assembleUserPrompt (v2)", () => {
  it("drops fields superseded by measured sections", () => {
    const prompt = assembleUserPrompt([result], tag);
    expect(prompt).not.toContain('"diQuality"');
    expect(prompt).not.toContain('"edgeguardSuccessRate"');
    expect(prompt).not.toContain('"recoverySuccessRate"');
    expect(prompt).not.toContain('"keyMoments"'); // printed once, as the timeline
  });

  it("does not print an L-cancel rate for a player with zero L-cancel attempts", () => {
    const players = result.gameSummary.players;
    const zeroed = {
      ...result,
      gameSummary: {
        ...result.gameSummary,
        players: [{ ...players[0], lCancelRate: 0, lCancelAttempts: 0 }, players[1]] as typeof players,
      },
    };
    const prompt = assembleUserPrompt([zeroed], tag);
    const firstSummary = prompt.split("\n").find((l) => l.startsWith(`{"tag":${JSON.stringify(players[0].tag)}`))!;
    expect(firstSummary).not.toContain("lCancelRate");
  });

  it("shows the this-game pattern column even without stored history, labelled as one sample", () => {
    const prompt = assembleUserPrompt([result], tag);
    expect(prompt).toContain("RECURRING PATTERNS");
    expect(prompt).toContain("not an established habit");
  });

  it("includes the history columns when recurring patterns are supplied", () => {
    const character = withLedge(emptyPatterns("all Peach"), 20, 100);
    const prompt = assembleUserPrompt([result], tag, undefined, { character, matchup: null });
    expect(prompt).toContain("all Peach = 50 games");
  });
});

describe("formatRecurringPatterns", () => {
  it("POSITIVE: flags a this-game rate far from the player's history", () => {
    const game = { ...withLedge(emptyPatterns("this game", 1), 4, 5), currentGames: 1 };
    const history = withLedge(emptyPatterns("all Marth"), 20, 100);
    const text = formatRecurringPatterns({ character: history, matchup: null }, game).join("\n");
    expect(text).toMatch(/roll — share: this game 4\/5 \(80%\) · all Marth 20% of 100 {2}◄ this game \+60 pts vs usual/);
  });

  it("NEGATIVE: does not flag a this-game rate with too few samples", () => {
    const game = withLedge(emptyPatterns("this game", 1), 2, 3);
    const history = withLedge(emptyPatterns("all Marth"), 20, 100);
    const rollLine = formatRecurringPatterns({ character: history, matchup: null }, game).find((l) =>
      l.includes("roll — share"),
    )!;
    expect(rollLine).not.toContain("◄");
  });

  it("NEGATIVE: hides history cells with a tiny denominator", () => {
    const history = withLedge(emptyPatterns("vs Fox"), 1, 3);
    const character = withLedge(emptyPatterns("all Marth"), 20, 100);
    const text = formatRecurringPatterns({ character, matchup: history }).join("\n");
    expect(text).not.toContain("vs Fox 33% of 3");
    expect(text).toContain("all Marth 20% of 100");
  });

  it("says plainly when no history games carry current-detector death/punish data", () => {
    const history = { ...withLedge(emptyPatterns("all Marth"), 20, 100), currentGames: 0 };
    const text = formatRecurringPatterns({ character: history, matchup: null }).join("\n");
    expect(text).toContain("do not infer it");
  });

  it("builds a single-game column whose counts match the frame events", () => {
    const slot = 0 as const;
    const data = patternsFromFrameEvents(result.frameEvents, slot, "this game");
    const habitTotal = data.habits.reduce((s, h) => s + h.total, 0);
    expect(habitTotal).toBe(result.frameEvents.habits.filter((h) => h.playerSlot === slot).length);
    expect(data.deaths.total).toBe(result.frameEvents.stocks.filter((s) => s.victimSlot === slot && s.died).length);
  });
});

describe("coaching cards understand the v2 headings", () => {
  it("classifies each v2 section", () => {
    const md = [
      "## The Read",
      "a",
      "## Fix This First",
      "b",
      "## Also Worth Fixing",
      "c",
      "## Exploit Next Game",
      "d",
      "## Keep Doing",
      "e",
      "## Practice Plan",
      "f",
    ].join("\n");
    expect(parseCoachingSections(md).map((s) => s.type)).toEqual([
      "read",
      "fix-first",
      "also-fix",
      "exploit",
      "keep",
      "practice-plan",
    ]);
  });

  it("still classifies cached v1 analyses", () => {
    const md = "## 1. **Game Overview**\nx\n## Coach's Wisdom\ny";
    expect(parseCoachingSections(md).map((s) => s.type)).toEqual(["overview", "wisdom"]);
  });
});
