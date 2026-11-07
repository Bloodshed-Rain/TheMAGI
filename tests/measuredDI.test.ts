import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import { processGame, DI_DEADZONE, assembleUserPrompt, computeDeathVerdicts } from "../src/pipeline";
import type { GameResult, StockRecord } from "../src/pipeline";
import type { FramesType } from "@slippi/slippi-js/node";

const TEST_REPLAYS_DIR = path.resolve(__dirname, "fixtures");

const replays = fs
  .readdirSync(TEST_REPLAYS_DIR)
  .filter((f) => f.endsWith(".slp"))
  .map((f) => path.join(TEST_REPLAYS_DIR, f));

// Parse every fixture once; suites below assert over all of them.
const results: GameResult[] = replays.map((fp, i) => processGame(fp, i + 1));

const VERDICTS = ["NO_DI", "WRONG_DI", "OK_DI", "GOOD_DI", "FAILED_RECOVERY", "SD", "UNKNOWN"];
const THROW_DIRECTIONS = ["forward", "back", "up", "down"];

describe("measuredDI: death verdicts", () => {
  it("every died stock gets a verdict; surviving stocks get none", () => {
    for (const r of results) {
      for (const s of r.frameEvents.stocks) {
        if (s.died) {
          expect(s.verdict).not.toBeNull();
          expect(VERDICTS).toContain(s.verdict);
        } else {
          expect(s.verdict).toBeNull();
          expect(s.diScore).toBeNull();
          expect(s.resourceFault).toBe(false);
        }
      }
    }
  });

  it("scored verdicts have consistent stick + score data", () => {
    for (const r of results) {
      for (const s of r.frameEvents.stocks) {
        if (s.verdict === "GOOD_DI" || s.verdict === "OK_DI" || s.verdict === "WRONG_DI") {
          expect(s.diScore).not.toBeNull();
          expect(s.diScore!).toBeGreaterThanOrEqual(0);
          expect(s.diScore!).toBeLessThanOrEqual(1);
          const mag = Math.hypot(s.diStickX ?? 0, s.diStickY ?? 0);
          expect(mag).toBeGreaterThanOrEqual(DI_DEADZONE);
          expect(s.launchAngleDeg).not.toBeNull();
          expect(s.launchAngleDeg!).toBeGreaterThanOrEqual(-180);
          expect(s.launchAngleDeg!).toBeLessThanOrEqual(180);
          // Verdict thresholds must match the score.
          if (s.verdict === "GOOD_DI") expect(s.diScore!).toBeGreaterThanOrEqual(0.7);
          if (s.verdict === "WRONG_DI") expect(s.diScore!).toBeLessThan(0.3);
        }
        if (s.verdict === "NO_DI") {
          const mag = Math.hypot(s.diStickX ?? 0, s.diStickY ?? 0);
          expect(mag).toBeLessThan(DI_DEADZONE);
          expect(s.finalHitFrame).not.toBeNull();
        }
      }
    }
  });

  it("finds at least one gradeable death across the fixtures", () => {
    const graded = results
      .flatMap((r) => r.frameEvents.stocks)
      .filter((s) => s.died && s.verdict !== "UNKNOWN" && s.verdict !== "SD");
    expect(graded.length).toBeGreaterThan(0);
  });

  it("final hit frame sits inside the stock window", () => {
    for (const r of results) {
      for (const s of r.frameEvents.stocks) {
        if (s.finalHitFrame != null && s.endFrame != null) {
          expect(s.finalHitFrame).toBeGreaterThanOrEqual(s.startFrame);
          expect(s.finalHitFrame).toBeLessThanOrEqual(s.endFrame);
        }
      }
    }
  });
});

describe("measuredDI: throw DI records", () => {
  it("records are well-formed and sorted", () => {
    for (const r of results) {
      const t = r.frameEvents.throwDI;
      for (let i = 0; i < t.length; i++) {
        const rec = t[i]!;
        expect([0, 1]).toContain(rec.victimSlot);
        expect(THROW_DIRECTIONS).toContain(rec.throwDirection);
        expect(rec.sector).toBeGreaterThanOrEqual(0);
        expect(rec.sector).toBeLessThanOrEqual(7);
        expect(rec.percent).toBeGreaterThanOrEqual(0);
        expect(rec.noDI).toBe(Math.hypot(rec.stickX, rec.stickY) < DI_DEADZONE);
        if (i > 0) expect(rec.frame).toBeGreaterThanOrEqual(t[i - 1]!.frame);
      }
    }
  });

  it("games with grab-throw conversions produce throw DI records", () => {
    // Only assert when a throw move (52-55) appears in a conversion.
    for (const r of results) {
      const throwsLanded = r.frameEvents.conversions.some((c) => c.moves.some((m) => m.moveId >= 52 && m.moveId <= 55));
      if (throwsLanded) {
        expect(r.frameEvents.throwDI.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("measuredDI: surfaced to coaching", () => {
  it("prompt contains the Measured DI section when deaths exist", () => {
    const withDeath = results.find((r) => r.frameEvents.stocks.some((s) => s.died && s.verdict != null));
    if (!withDeath) return;
    const tag = withDeath.gameSummary.players[0].tag;
    const prompt = assembleUserPrompt([withDeath], tag);
    expect(prompt).toContain("Measured DI");
  });

  it("death key moments carry DI verdict text when gradeable", () => {
    for (const r of results) {
      for (const slot of [0, 1] as const) {
        const gradeable = r.frameEvents.stocks.filter(
          (s) =>
            s.victimSlot === slot &&
            s.died &&
            (s.verdict === "NO_DI" || s.verdict === "WRONG_DI" || s.verdict === "GOOD_DI"),
        );
        if (gradeable.length === 0) continue;
        const deathMoments = r.derivedInsights[slot].keyMoments.filter((m) => m.type === "death");
        // At least one death moment should carry the measured-DI annotation.
        if (deathMoments.length > 0) {
          expect(deathMoments.some((m) => m.description.includes("DI"))).toBe(true);
        }
      }
    }
  });
});

// ── Synthetic-frame regression tests (v2 death verdicts) ──────────────

type Post = {
  actionStateId: number;
  positionX?: number;
  positionY?: number;
  hitlagRemaining?: number;
  jumpsRemaining?: number;
  isAirborne?: boolean;
};
type Pre = { joystickX?: number; joystickY?: number };

const BATTLEFIELD = 31;
const DAMAGE_FLY_HI = 88;
const FALL_SPECIAL = 35;
const DEAD_DOWN = 0;
const DEAD_UP_STAR = 4;

function frames(length: number, at: (f: number) => { post: Post; pre?: Pre }): FramesType {
  const out: Record<number, unknown> = {};
  for (let f = 0; f < length; f++) {
    const { post, pre } = at(f);
    out[f] = { frame: f, players: { 0: { pre: { joystickX: 0, joystickY: 0, ...pre }, post: { positionX: 0, positionY: 0, hitlagRemaining: 0, jumpsRemaining: 1, isAirborne: false, ...post } } } };
  }
  return out as unknown as FramesType;
}

function stock(overrides: Partial<StockRecord>): StockRecord {
  return {
    victimSlot: 0,
    stockNumber: 4,
    startFrame: 0,
    endFrame: 300,
    startPercent: 0,
    deathPercent: 140,
    killerMoveId: 9,
    deathDirection: "up",
    died: true,
    verdict: null,
    diScore: null,
    diStickX: null,
    diStickY: null,
    launchAngleDeg: null,
    resourceFault: false,
    finalHitFrame: null,
    ...overrides,
  };
}

/** Hit with hitlag on frames 96-100 (stick held right), launched straight up, Star KO from 170, stock lost at 300. */
const starKO = frames(301, (f) => {
  if (f < 96) return { post: { actionStateId: 14 } };
  if (f <= 100) return { post: { actionStateId: DAMAGE_FLY_HI, hitlagRemaining: 101 - f }, pre: { joystickX: 1, joystickY: 0 } };
  if (f < 170) return { post: { actionStateId: DAMAGE_FLY_HI, positionX: 0, positionY: (f - 100) * 3, isAirborne: true } };
  return { post: { actionStateId: DEAD_UP_STAR, positionY: 210, isAirborne: true } };
});

/** Hit offstage at frame 100, then up-B into helpless fall offstage with the double jump unspent; DeadDown at 300, stock lost at 310. */
function offstageFall(withHit: boolean): FramesType {
  return frames(311, (f) => {
    if (f < 96) return { post: { actionStateId: 14 } };
    if (f <= 100)
      return withHit
        ? { post: { actionStateId: DAMAGE_FLY_HI, hitlagRemaining: 101 - f, positionX: -80 } }
        : { post: { actionStateId: 14, positionX: -80 } };
    if (f < 130) return { post: { actionStateId: withHit ? DAMAGE_FLY_HI : 29, positionX: -80 - (f - 100) * 2, positionY: 10, isAirborne: true } };
    if (f < 300) return { post: { actionStateId: FALL_SPECIAL, positionX: -150, positionY: -40 - (f - 130), isAirborne: true, jumpsRemaining: 1 } };
    return { post: { actionStateId: DEAD_DOWN, positionX: -150, positionY: -250, isAirborne: true } };
  });
}

describe("measuredDI v2: final-hit search anchored at dying-state entry", () => {
  it("POSITIVE: a Star KO is graded on the real hit instead of being called SD", () => {
    const v = computeDeathVerdicts([stock({})], starKO, 300, BATTLEFIELD, [0, 1]).get("0:4")!;
    expect(v.verdict).toBe("GOOD_DI");
    expect(v.finalHitFrame).toBe(100);
  });

  it("NEGATIVE: a direct blast-zone kill is never flagged as an unspent double jump", () => {
    const v = computeDeathVerdicts([stock({})], starKO, 300, BATTLEFIELD, [0, 1]).get("0:4")!;
    expect(v.resourceFault).toBe(false);
  });
});

describe("measuredDI v2: FAILED_RECOVERY vs SD", () => {
  const offstageStock = stock({ endFrame: 310, deathDirection: "down", killerMoveId: 15, deathPercent: 119 });

  it("POSITIVE: hit, never hit again, still inside the opponent's kill conversion ⇒ FAILED_RECOVERY", () => {
    const v = computeDeathVerdicts([offstageStock], offstageFall(true), 310, BATTLEFIELD, [0, 1]).get("0:4")!;
    expect(v.verdict).toBe("FAILED_RECOVERY");
    expect(v.diScore).toBeNull();
    expect(v.finalHitFrame).toBe(100);
    // Fell helpless offstage for 170 frames with the double jump unspent.
    expect(v.resourceFault).toBe(true);
  });

  it("NEGATIVE: the same fall with no kill conversion credited is an SD, not a failed recovery", () => {
    const v = computeDeathVerdicts([stock({ ...offstageStock, killerMoveId: null })], offstageFall(true), 310, BATTLEFIELD, [0, 1]).get("0:4")!;
    expect(v.verdict).toBe("SD");
  });

  it("NEGATIVE: no hit anywhere in the stock and no kill conversion ⇒ SD", () => {
    const v = computeDeathVerdicts([stock({ ...offstageStock, killerMoveId: null })], offstageFall(false), 310, BATTLEFIELD, [0, 1]).get("0:4")!;
    expect(v.verdict).toBe("SD");
    expect(v.finalHitFrame).toBeNull();
    expect(v.resourceFault).toBe(false);
  });
});
