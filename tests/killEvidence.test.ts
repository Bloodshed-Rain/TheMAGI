import { describe, it, expect } from "vitest";
import {
  finalHitOffstage,
  isDownwardOffstageKill,
  isOffstageKill,
  killDirection,
  percentAtFinalHit,
} from "../src/pipeline/killEvidence";
import { conversion, framesWithPosts, move } from "./helpers/syntheticFrames";

const BF = 31; // Battlefield, ledge x = 68.4
const DEAD_DOWN = 0;
const DEAD_LEFT = 1;
const DEAD_UP = 3;

describe("killEvidence", () => {
  it("reads the victim's position at the final hit, not at the stock-loss frame", () => {
    // Final hit at center stage; by the stock-loss frame the victim is at the blast zone.
    const frames = framesWithPosts({
      170: { 1: { positionX: 10, positionY: 5 } },
      300: { 1: { positionX: 224, positionY: 90, actionStateId: DEAD_LEFT } },
    });
    const conv = conversion({ didKill: true, moves: [move(17, 170)] });
    expect(finalHitOffstage(conv, frames, BF)).toBe(false);
    expect(killDirection(conv, frames)).toBe("left");
    expect(isOffstageKill(conv, frames, BF)).toBe(false);
  });

  it("POSITIVE: dair with the victim offstage that died off the bottom is a spike kill", () => {
    const frames = framesWithPosts({
      170: { 1: { positionX: -90, positionY: -20 } },
      300: { 1: { positionX: -60, positionY: -110, actionStateId: DEAD_DOWN } },
    });
    const conv = conversion({ didKill: true, moves: [move(14, 140), move(17, 170)] });
    expect(isDownwardOffstageKill(conv, frames, BF, 17)).toBe(true);
    expect(isOffstageKill(conv, frames, BF)).toBe(true);
  });

  it("NEGATIVE: dair kill off the side is not a spike", () => {
    const frames = framesWithPosts({
      170: { 1: { positionX: -90, positionY: -20 } },
      300: { 1: { positionX: -224, positionY: 40, actionStateId: DEAD_LEFT } },
    });
    const conv = conversion({ didKill: true, moves: [move(17, 170)] });
    expect(isDownwardOffstageKill(conv, frames, BF, 17)).toBe(false);
    expect(isOffstageKill(conv, frames, BF)).toBe(true);
  });

  it("NEGATIVE: dair on a grounded center-stage opponent who later fell to the bottom is not a spike", () => {
    const frames = framesWithPosts({
      170: { 1: { positionX: 20, positionY: 0 } },
      300: { 1: { positionX: 40, positionY: -110, actionStateId: DEAD_DOWN } },
    });
    const conv = conversion({ didKill: true, moves: [move(17, 170)] });
    expect(isDownwardOffstageKill(conv, frames, BF, 17)).toBe(false);
  });

  it("NEGATIVE: an offstage hit that killed off the top is not an offstage (edgeguard) kill", () => {
    const frames = framesWithPosts({
      170: { 1: { positionX: 80, positionY: 10 } },
      300: { 1: { positionX: 90, positionY: 200, actionStateId: DEAD_UP } },
    });
    const conv = conversion({ didKill: true, moves: [move(16, 170)] });
    expect(isOffstageKill(conv, frames, BF)).toBe(false);
  });

  it("requires the named move to be the final hit", () => {
    const frames = framesWithPosts({
      170: { 1: { positionX: -90, positionY: -20 } },
      190: { 1: { positionX: -95, positionY: -30 } },
      300: { 1: { positionX: -60, positionY: -110, actionStateId: DEAD_DOWN } },
    });
    const conv = conversion({ didKill: true, moves: [move(17, 170), move(13, 190)] });
    expect(isDownwardOffstageKill(conv, frames, BF, 17)).toBe(false);
  });

  it("does nothing without a kill or without frames", () => {
    const frames = framesWithPosts({ 170: { 1: { positionX: -90, positionY: -20 } } });
    expect(isOffstageKill(conversion({ didKill: false, moves: [move(17, 170)] }), frames, BF)).toBe(false);
    expect(killDirection(conversion({ didKill: true, moves: [move(17, 170)] }), frames)).toBeNull();
    expect(finalHitOffstage(conversion({ didKill: true, moves: [] }), frames, BF)).toBe(false);
  });

  it("percentAtFinalHit subtracts the final move's damage from the end percent", () => {
    const conv = conversion({ endPercent: 92, moves: [move(14, 140, 12), move(10, 170, 20)] });
    expect(percentAtFinalHit(conv)).toBe(72);
    expect(percentAtFinalHit(conversion({ endPercent: 5, moves: [move(10, 170, 20)] }))).toBe(0);
  });
});
