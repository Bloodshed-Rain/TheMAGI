import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import { processGame } from "../src/pipeline";
import type { GameFrameEvents, ConversionRecord } from "../src/pipeline";
import type { FramesType, StockType } from "@slippi/slippi-js/node";
import { isHabitPunished, stockWasLost, toStockRecords } from "../src/pipeline/frameEvents";

const TEST_REPLAYS_DIR = path.resolve(__dirname, "fixtures");

function getTestReplay(): string {
  const files = fs.readdirSync(TEST_REPLAYS_DIR).filter((f) => f.endsWith(".slp"));
  if (files.length === 0) throw new Error("No test replays found");
  return path.join(TEST_REPLAYS_DIR, files[0]!);
}

// Parse once — every suite below asserts against the same result.
const result = processGame(getTestReplay(), 1);
const events: GameFrameEvents = result.frameEvents;
const lastFrameApprox = result.gameSummary.duration * 60 + 200;

const KNOCKDOWN_OPTIONS = [
  "tech in place",
  "tech roll forward",
  "tech roll backward",
  "getup",
  "getup attack",
  "getup roll forward",
  "getup roll backward",
];
const LEDGE_OPTIONS = ["stand", "getup attack", "roll", "jump", "ledgedash", "drop aerial", "regrab", "drop"];
const OOS_OPTIONS = [
  "roll forward",
  "roll backward",
  "spot dodge",
  "grab OOS",
  "jump OOS",
  "aerial OOS",
  "special OOS",
  "attack OOS",
  "hold shield",
  "drop shield",
];

describe("frameEvents: conversions", () => {
  it("mirrors the game's conversions with valid records", () => {
    expect(events.conversions.length).toBeGreaterThan(0);
    for (const c of events.conversions) {
      expect([0, 1]).toContain(c.attackerSlot);
      expect(c.damage).toBeGreaterThanOrEqual(0);
      expect(c.moveCount).toBe(c.moves.length);
      if (c.endFrame != null) expect(c.endFrame).toBeGreaterThanOrEqual(c.startFrame);
      expect(typeof c.openingType).toBe("string");
      if (c.moveCount > 0) {
        expect(c.openerMoveId).toBe(c.moves[0]!.moveId);
        expect(c.lastMoveId).toBe(c.moves[c.moves.length - 1]!.moveId);
      }
    }
  });

  it("has kill conversions when stocks were taken", () => {
    const kills = events.conversions.filter((c) => c.didKill);
    const deaths = events.stocks.filter((s) => s.died);
    if (deaths.length > 0) {
      expect(kills.length).toBeGreaterThan(0);
    }
  });
});

describe("frameEvents: stock records", () => {
  it("has one record per stock for both players", () => {
    const slots = new Set(events.stocks.map((s) => s.victimSlot));
    expect(slots.size).toBe(2);
    expect(events.stocks.length).toBeGreaterThanOrEqual(2);
    expect(events.stocks.length).toBeLessThanOrEqual(8);
  });

  it("death counts reconcile with final stocks", () => {
    for (const slot of [0, 1] as const) {
      const records = events.stocks.filter((s) => s.victimSlot === slot);
      const deaths = records.filter((s) => s.died).length;
      const finalStocks = result.gameSummary.result.finalStocks[slot];
      expect(deaths).toBe(records.length - (finalStocks > 0 ? 1 : 0));
    }
  });

  it("dead stocks carry death data; surviving stocks do not", () => {
    for (const s of events.stocks) {
      if (s.died) {
        expect(s.deathPercent).not.toBeNull();
        if (s.deathDirection != null) {
          expect(["up", "down", "left", "right"]).toContain(s.deathDirection);
        }
      } else {
        expect(s.deathPercent).toBeNull();
        expect(s.deathDirection).toBeNull();
      }
    }
  });
});

describe("frameEvents: habit instances", () => {
  it("only contains known situation/option combinations", () => {
    for (const h of events.habits) {
      expect([0, 1]).toContain(h.playerSlot);
      expect(h.percent).toBeGreaterThanOrEqual(0);
      expect(h.frame).toBeLessThanOrEqual(lastFrameApprox);
      if (h.situation === "knockdown") {
        expect(KNOCKDOWN_OPTIONS).toContain(h.option);
      } else if (h.situation === "ledge") {
        expect(LEDGE_OPTIONS).toContain(h.option);
      } else if (h.situation === "oos") {
        expect(OOS_OPTIONS).toContain(h.option);
      } else {
        throw new Error(`Unknown situation: ${h.situation}`);
      }
    }
  });

  it("is sorted chronologically", () => {
    for (let i = 1; i < events.habits.length; i++) {
      expect(events.habits[i]!.frame).toBeGreaterThanOrEqual(events.habits[i - 1]!.frame);
    }
  });

  it("every option followed by a new conversion against the player is punished (superset of the v1 rule)", () => {
    for (const h of events.habits) {
      const newConversion = events.conversions.some(
        (c) => c.attackerSlot !== h.playerSlot && c.startFrame >= h.frame && c.startFrame <= h.frame + 45,
      );
      if (newConversion) expect(h.punished).toBe(true);
    }
  });

  it("habit profiles in derivedInsights aggregate the same instances", () => {
    for (const slot of [0, 1] as const) {
      const insights = result.derivedInsights[slot];
      const ledgeInstances = events.habits.filter((h) => h.playerSlot === slot && h.situation === "ledge");
      const profileTotal = insights.afterLedgeGrab.options.reduce((s, o) => s + o.frequency, 0);
      expect(profileTotal).toBe(ledgeInstances.length);
    }
  });
});

describe("frameEvents: attack instances", () => {
  it("finds attacks for both players with sane frame ordering", () => {
    for (const slot of [0, 1] as const) {
      const attacks = events.attacks[slot];
      expect(attacks.length).toBeGreaterThan(0);
      for (let i = 0; i < attacks.length; i++) {
        const a = attacks[i]!;
        expect(a.endFrame).toBeGreaterThanOrEqual(a.startFrame);
        expect(["grounded", "aerial", "special", "grab"]).toContain(a.kind);
        if (a.firstActionableFrame != null) {
          expect(a.firstActionableFrame).toBeGreaterThan(a.endFrame);
        }
        if (i > 0) {
          // Merged instances must not overlap and must respect the merge gap.
          expect(a.startFrame).toBeGreaterThan(attacks[i - 1]!.endFrame + 3);
        }
      }
    }
  });

  it("some attacks connected and some whiffed in a real game", () => {
    const all = [...events.attacks[0], ...events.attacks[1]];
    expect(all.some((a) => a.connected)).toBe(true);
    expect(all.some((a) => !a.connected)).toBe(true);
  });
});

describe("frameEvents: neutral segments", () => {
  it("returns sorted, non-overlapping segments of minimum length", () => {
    expect(events.neutralSegments.length).toBeGreaterThan(0);
    for (let i = 0; i < events.neutralSegments.length; i++) {
      const seg = events.neutralSegments[i]!;
      expect(seg.endFrame - seg.startFrame).toBeGreaterThanOrEqual(14);
      if (i > 0) {
        expect(seg.startFrame).toBeGreaterThan(events.neutralSegments[i - 1]!.endFrame);
      }
    }
  });
});

// ── Synthetic-frame regression tests (v2 event definitions) ───────────

type SyntheticPost = { actionStateId: number; positionX?: number; positionY?: number };

/** Minimal FramesType stand-in: frames[f].players[idx].post for one player index. */
function syntheticFrames(length: number, playerIndex: number, postAt: (f: number) => SyntheticPost): FramesType {
  const frames: Record<number, unknown> = {};
  for (let f = 0; f < length; f++) {
    frames[f] = { frame: f, players: { [playerIndex]: { pre: {}, post: { positionX: 0, positionY: 0, ...postAt(f) } } } };
  }
  return frames as unknown as FramesType;
}

const STANDING = 14; // Wait
const DAMAGE_HI = 75; // DamageHi1 (State.DAMAGE_START)
const CAPTURE_PULLED_HI = 223; // State.CAPTURE_START

describe("frameEvents v2: habit punished = hit or grabbed within 45f", () => {
  const habit = { playerSlot: 0 as const, frame: 100 };

  it("POSITIVE: hit inside the window with no NEW conversion (tech chase continuing a punish)", () => {
    const frames = syntheticFrames(300, 0, (f) => ({ actionStateId: f === 120 ? DAMAGE_HI : STANDING }));
    expect(isHabitPunished(habit, frames, 0, [], 299)).toBe(true);
  });

  it("POSITIVE: grabbed inside the window", () => {
    const frames = syntheticFrames(300, 0, (f) => ({ actionStateId: f === 130 ? CAPTURE_PULLED_HI : STANDING }));
    expect(isHabitPunished(habit, frames, 0, [], 299)).toBe(true);
  });

  it("POSITIVE: a conversion against the player starting inside the window still counts", () => {
    const frames = syntheticFrames(300, 0, () => ({ actionStateId: STANDING }));
    const conv = { attackerSlot: 1, startFrame: 110 } as ConversionRecord;
    expect(isHabitPunished(habit, frames, 0, [conv], 299)).toBe(true);
  });

  it("NEGATIVE: hit after the window closes", () => {
    const frames = syntheticFrames(300, 0, (f) => ({ actionStateId: f === 150 ? DAMAGE_HI : STANDING }));
    expect(isHabitPunished(habit, frames, 0, [], 299)).toBe(false);
  });

  it("NEGATIVE: never hit, and the player's OWN conversion in the window does not count", () => {
    const frames = syntheticFrames(300, 0, () => ({ actionStateId: STANDING }));
    const own = { attackerSlot: 0, startFrame: 110 } as ConversionRecord;
    expect(isHabitPunished(habit, frames, 0, [own], 299)).toBe(false);
  });
});

describe("frameEvents v2: stock death detection", () => {
  const base = { playerIndex: 0, startFrame: 0, startPercent: 0, currentPercent: 40, count: 4 };

  it("POSITIVE: deathAnimation 0 (DeadDown) with no kill conversion is a bottom-blast-zone death", () => {
    const stock = { ...base, endFrame: 500, endPercent: 40, deathAnimation: 0 } as unknown as StockType;
    const [rec] = toStockRecords([stock], [], 0, 0);
    expect(stockWasLost(stock)).toBe(true);
    expect(rec!.died).toBe(true);
    expect(rec!.deathDirection).toBe("down");
    expect(rec!.killerMoveId).toBeNull();
  });

  it("NEGATIVE: a stock that survived to game end (no endFrame) is not a death", () => {
    const stock = { ...base, endFrame: undefined, endPercent: undefined, deathAnimation: undefined } as unknown as StockType;
    const [rec] = toStockRecords([stock], [], 0, 0);
    expect(stockWasLost(stock)).toBe(false);
    expect(rec!.died).toBe(false);
    expect(rec!.deathDirection).toBeNull();
  });
});

describe("frameEvents v2: punish window extends past long options", () => {
  const CLIFF_ROLL_SLOW = 258;
  // Ledge roll from frame 100, actionable again at frame 160.
  const roll = (hitAt: number | null) =>
    syntheticFrames(400, 0, (f) => ({
      actionStateId: hitAt != null && f === hitAt ? DAMAGE_HI : f >= 100 && f < 160 ? CLIFF_ROLL_SLOW : STANDING,
    }));
  const habit = { playerSlot: 0 as const, frame: 100 };

  it("POSITIVE: hit right as the roll ends (outside a fixed 45f window) is punished", () => {
    expect(isHabitPunished(habit, roll(170), 0, [], 399)).toBe(true);
  });

  it("NEGATIVE: hit well after the roll ended (>20f) is not attributed to the roll", () => {
    expect(isHabitPunished(habit, roll(190), 0, [], 399)).toBe(false);
  });
});
