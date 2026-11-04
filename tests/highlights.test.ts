import { describe, it, expect } from "vitest";
import type { FramesType } from "@slippi/slippi-js/node";
import { detectHighlights, maxStockDeficit } from "../src/pipeline/highlights";
import type { GameSummary } from "../src/pipeline/types";
import { conversion, denseFrames, framesWithPosts, move } from "./helpers/syntheticFrames";

const BF = 31;
const DEAD_DOWN = 0;
const DEAD_LEFT = 1;
const TECH_MISS_UP = 183;

function summary(
  character: string,
  opponent = "Fox",
  winner = "Other",
  stocks: [number, number] = [0, 2],
): GameSummary {
  return {
    players: [
      { character, tag: "You" },
      { character: opponent, tag: "Other" },
    ],
    result: { winner, finalStocks: stocks, finalPercents: [0, 0], endMethod: "stocks" },
  } as unknown as GameSummary;
}

function types(highlights: ReturnType<typeof detectHighlights>): string[] {
  return highlights.map((h) => h.type);
}

/** Victim offstage at the final hit, dead down at the stock-loss frame. */
function spikeFrames(hitFrame: number, endFrame: number, dir = DEAD_DOWN): FramesType {
  return framesWithPosts({
    [-39]: { 0: { stocksRemaining: 4 }, 1: { stocksRemaining: 4 } },
    100: { 0: { stocksRemaining: 3 } },
    [hitFrame]: { 1: { positionX: -95, positionY: -25 } },
    [endFrame]: { 1: { positionX: -60, positionY: -110, actionStateId: dir } },
  });
}

describe("universal highlights", () => {
  it("POSITIVE: offstage dair that killed off the bottom is a spike kill, with the attacker's stock number", () => {
    const conv = conversion({ didKill: true, endFrame: 300, moves: [move(17, 170)] });
    const hs = detectHighlights(summary("Marth"), [conv], spikeFrames(170, 300), BF, 0, 0, 1, 400);
    const spike = hs.find((h) => h.type === "spike-kill");
    expect(spike).toBeDefined();
    expect(spike!.stockNumber).toBe(2);
    expect(spike!.description).toContain("offstage");
  });

  it("NEGATIVE: dair that killed off the side is not a spike kill", () => {
    const conv = conversion({ didKill: true, endFrame: 300, moves: [move(17, 170)] });
    const hs = detectHighlights(summary("Marth"), [conv], spikeFrames(170, 300, DEAD_LEFT), BF, 0, 0, 1, 400);
    expect(types(hs)).not.toContain("spike-kill");
  });

  it("NEGATIVE: center-stage dair followed by a bottom death is not a spike kill", () => {
    const frames = framesWithPosts({
      170: { 1: { positionX: 5, positionY: 0 } },
      300: { 1: { positionX: 50, positionY: -110, actionStateId: DEAD_DOWN } },
    });
    const conv = conversion({ didKill: true, endFrame: 300, moves: [move(17, 170)] });
    expect(types(detectHighlights(summary("Marth"), [conv], frames, BF, 0, 0, 1, 400))).not.toContain("spike-kill");
  });

  it("zero-to-death needs a 0% start and a kill", () => {
    const frames = framesWithPosts({});
    const zt = conversion({ didKill: true, startPercent: 0, moves: [move(14, 140), move(14, 160)] });
    const notZt = conversion({ didKill: true, startPercent: 3, moves: [move(14, 140)] });
    expect(types(detectHighlights(summary("Marth"), [zt], frames, BF, 0, 0, 1, 400))).toContain("zero-to-death");
    expect(types(detectHighlights(summary("Marth"), [notZt], frames, BF, 0, 0, 1, 400))).not.toContain("zero-to-death");
  });
});

describe("game-result highlights", () => {
  it("POSITIVE: comeback = won after trailing by two stocks", () => {
    const frames = denseFrames(
      -39,
      400,
      { 0: { stocksRemaining: 4 }, 1: { stocksRemaining: 4 } },
      {
        100: { 0: { stocksRemaining: 1 }, 1: { stocksRemaining: 3 } },
        300: { 0: { stocksRemaining: 1 }, 1: { stocksRemaining: 0 } },
      },
    );
    expect(maxStockDeficit(frames, 0, 1)).toBe(2);
    const hs = detectHighlights(summary("Marth", "Fox", "You", [1, 0]), [], frames, BF, 0, 0, 1, 400);
    const comeback = hs.find((h) => h.type === "comeback");
    expect(comeback).toBeDefined();
    expect(comeback!.description).toContain("trailing by 2 stocks");
  });

  it("NEGATIVE: a last-stock win that was never down two stocks is not a comeback", () => {
    const frames = denseFrames(
      -39,
      400,
      { 0: { stocksRemaining: 4 }, 1: { stocksRemaining: 4 } },
      {
        100: { 0: { stocksRemaining: 1 }, 1: { stocksRemaining: 2 } },
        300: { 0: { stocksRemaining: 1 }, 1: { stocksRemaining: 0 } },
      },
    );
    expect(maxStockDeficit(frames, 0, 1)).toBe(1);
    const hs = detectHighlights(summary("Marth", "Fox", "You", [1, 0]), [], frames, BF, 0, 0, 1, 400);
    expect(types(hs)).not.toContain("comeback");
  });

  it("4-stock at 0% is a JV5, not both a four-stock and a JV5", () => {
    const frames = denseFrames(-39, 50, { 0: { stocksRemaining: 4 }, 1: { stocksRemaining: 4 } });
    const hs = detectHighlights(summary("Marth", "Fox", "You", [4, 0]), [], frames, BF, 0, 0, 1, 50);
    expect(types(hs)).toEqual(["jv5"]);
  });
});

describe("character highlights", () => {
  it("Marth: early fsmash kill uses the percent at the final hit and never claims a tipper", () => {
    const frames = framesWithPosts({});
    const early = conversion({
      didKill: true,
      startPercent: 20,
      endPercent: 60,
      moves: [move(14, 140), move(10, 170, 20)],
    });
    const late = conversion({
      didKill: true,
      startPercent: 20,
      endPercent: 120,
      moves: [move(14, 140), move(10, 170, 20)],
    });
    const hs = detectHighlights(summary("Marth"), [early, late], frames, BF, 0, 0, 1, 400);
    const earlyHit = hs.filter((h) => h.type === "early-fsmash-kill");
    expect(earlyHit).toHaveLength(1);
    expect(earlyHit[0]!.description).toContain("at 40%");
    expect(earlyHit[0]!.description).toContain("tipper not verified");
    expect(types(hs)).not.toContain("tipper-fsmash");
  });

  it("Fox: shine → upsmash must be adjacent; upthrow → upair uses the real uthrow id (55)", () => {
    const frames = framesWithPosts({});
    const adjacent = conversion({ didKill: true, moves: [move(21, 140), move(11, 160)] });
    const interrupted = conversion({ didKill: true, moves: [move(21, 140), move(13, 150), move(11, 160)] });
    const uthrowUair = conversion({ didKill: true, moves: [move(55, 140), move(16, 170)] });
    const bthrowUair = conversion({ didKill: true, moves: [move(54, 140), move(16, 170)] });
    expect(types(detectHighlights(summary("Fox"), [adjacent], frames, BF, 0, 0, 1, 400))).toContain(
      "waveshine-upsmash",
    );
    expect(types(detectHighlights(summary("Fox"), [interrupted], frames, BF, 0, 0, 1, 400))).not.toContain(
      "waveshine-upsmash",
    );
    expect(types(detectHighlights(summary("Fox"), [uthrowUair], frames, BF, 0, 0, 1, 400))).toContain("upthrow-upair");
    expect(types(detectHighlights(summary("Fox"), [bthrowUair], frames, BF, 0, 0, 1, 400))).not.toContain(
      "upthrow-upair",
    );
  });

  it("Fox/Falco: shine spike needs the victim offstage at the shine and a non-top death", () => {
    const good = conversion({ didKill: true, endFrame: 300, moves: [move(21, 170)] });
    const hs = detectHighlights(summary("Fox"), [good], spikeFrames(170, 300, DEAD_LEFT), BF, 0, 0, 1, 400);
    expect(types(hs)).toContain("shine-spike");
    const onstage = framesWithPosts({
      170: { 1: { positionX: 0, positionY: 0 } },
      300: { 1: { positionX: -224, positionY: 40, actionStateId: DEAD_LEFT } },
    });
    expect(types(detectHighlights(summary("Falco"), [good], onstage, BF, 0, 0, 1, 400))).not.toContain("shine-spike");
  });

  it("Falcon: sacred combo is knee → Falcon Punch; upair → knee is labeled as such", () => {
    const frames = framesWithPosts({});
    const sacred = conversion({ didKill: true, moves: [move(14, 140), move(18, 180)] });
    const upairKnee = conversion({ didKill: true, moves: [move(16, 140), move(14, 170)] });
    expect(types(detectHighlights(summary("Falcon"), [sacred], frames, BF, 0, 0, 1, 400))).toContain("sacred-combo");
    const hs = detectHighlights(summary("Falcon"), [upairKnee], frames, BF, 0, 0, 1, 400);
    expect(types(hs)).toContain("upair-knee");
    expect(types(hs)).not.toContain("sacred-combo");
  });

  it("Puff: rest must be the final hit of the kill", () => {
    const frames = framesWithPosts({});
    const restKill = conversion({ didKill: true, moves: [move(16, 140), move(21, 170)] });
    const restThenBair = conversion({ didKill: true, moves: [move(21, 140), move(15, 170)] });
    expect(types(detectHighlights(summary("Puff"), [restKill], frames, BF, 0, 0, 1, 400))).toContain("rest-kill");
    expect(types(detectHighlights(summary("Puff"), [restThenBair], frames, BF, 0, 0, 1, 400))).not.toContain(
      "rest-kill",
    );
  });

  it("Sheik: tech chase kill needs a dthrow/fthrow opener and a real tech/down state", () => {
    const withTech = framesWithPosts({ 150: { 1: { actionStateId: TECH_MISS_UP } } });
    const conv = conversion({ didKill: true, endFrame: 300, moves: [move(56, 140), move(9, 180), move(14, 220)] });
    expect(types(detectHighlights(summary("Sheik"), [conv], withTech, BF, 0, 0, 1, 400))).toContain("tech-chase-kill");
    expect(types(detectHighlights(summary("Sheik"), [conv], framesWithPosts({}), BF, 0, 0, 1, 400))).not.toContain(
      "tech-chase-kill",
    );
    const bthrowOpener = conversion({
      didKill: true,
      endFrame: 300,
      moves: [move(54, 140), move(9, 180), move(14, 220)],
    });
    expect(types(detectHighlights(summary("Sheik"), [bthrowOpener], withTech, BF, 0, 0, 1, 400))).not.toContain(
      "tech-chase-kill",
    );
  });

  it("ICs: a wobble is 8+ pummels (id 52); getup attacks (51) do not count", () => {
    const frames = framesWithPosts({});
    const pummels = conversion({ moves: Array.from({ length: 8 }, (_, i) => move(52, 140 + i * 10, 3)) });
    const getups = conversion({ moves: Array.from({ length: 8 }, (_, i) => move(51, 140 + i * 10, 3)) });
    expect(types(detectHighlights(summary("ICs"), [pummels], frames, BF, 0, 0, 1, 400))).toContain("wobble");
    expect(types(detectHighlights(summary("ICs"), [getups], frames, BF, 0, 0, 1, 400))).not.toContain("wobble");
  });

  it("Ganon: side-B kill is a Gerudo Dragon kill, never a Ganoncide", () => {
    const frames = framesWithPosts({});
    const conv = conversion({ didKill: true, moves: [move(19, 170)] });
    const hs = detectHighlights(summary("Ganon"), [conv], frames, BF, 0, 0, 1, 400);
    expect(types(hs)).toContain("gerudo-kill");
    expect(types(hs)).not.toContain("ganoncide");
  });

  it("Luigi: shoryuken needs sweetspot damage on the killing up-B", () => {
    const frames = framesWithPosts({});
    const sweet = conversion({ didKill: true, moves: [move(20, 170, 25)] });
    const sour = conversion({ didKill: true, moves: [move(20, 170, 1)] });
    expect(types(detectHighlights(summary("Luigi"), [sweet], frames, BF, 0, 0, 1, 400))).toContain("shoryuken");
    expect(types(detectHighlights(summary("Luigi"), [sour], frames, BF, 0, 0, 1, 400))).not.toContain("shoryuken");
  });

  it("Ness: back throw kill uses the real bthrow id (54) as the final hit", () => {
    const frames = framesWithPosts({});
    const bthrow = conversion({ didKill: true, moves: [move(54, 170)] });
    const fthrow = conversion({ didKill: true, moves: [move(53, 170)] });
    expect(types(detectHighlights(summary("Ness"), [bthrow], frames, BF, 0, 0, 1, 400))).toContain("backthrow-kill");
    expect(types(detectHighlights(summary("Ness"), [fthrow], frames, BF, 0, 0, 1, 400))).not.toContain(
      "backthrow-kill",
    );
  });

  it("names throws correctly in move lists", () => {
    const frames = framesWithPosts({});
    const conv = conversion({ didKill: true, startPercent: 0, moves: [move(55, 140), move(16, 170)] });
    const hs = detectHighlights(summary("Fox"), [conv], frames, BF, 0, 0, 1, 400);
    expect(hs.find((h) => h.type === "zero-to-death")!.moves).toEqual(["uthrow", "uair"]);
  });
});
