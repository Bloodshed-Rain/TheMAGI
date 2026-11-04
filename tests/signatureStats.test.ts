import { describe, it, expect } from "vitest";
import type { FramesType } from "@slippi/slippi-js/node";
import {
  detectSignatureStats,
  countPeachFloatAerials,
  countTechChaseGrabs,
  countGentlemen,
  countProjectileSpawns,
  countSpecialHits,
  hasShineGrab,
  FALCO_LASER_ITEM_ID,
  type SignatureStatInput,
} from "../src/pipeline/signatureStats";
import type { FoxSignatureStats, MarthSignatureStats, PeachSignatureStats } from "../src/pipeline/types";
import { conversion, denseFrames, framesWithPosts, move } from "./helpers/syntheticFrames";

const BF = 31;

function input(overrides: Partial<SignatureStatInput>): SignatureStatInput {
  return {
    character: "Marth",
    playerIndex: 0,
    opponentIndex: 1,
    myConversions: [],
    specialHits: { neutralB: 0, sideB: 0, upB: 0, downB: 0 },
    turnipPullStats: null,
    kenComboStats: null,
    frames: framesWithPosts({}),
    lastFrame: 400,
    stageId: BF,
    ...overrides,
  };
}

describe("Marth chain grabs", () => {
  it("POSITIVE: two throws in one conversion", () => {
    const conv = conversion({ moves: [move(55, 100), move(55, 150), move(14, 200)] });
    const stats = detectSignatureStats(input({ myConversions: [conv] })) as MarthSignatureStats;
    expect(stats.chainGrabs).toBe(1);
  });

  it("NEGATIVE: pummel + one throw is not a chain grab", () => {
    const conv = conversion({ moves: [move(52, 100, 3), move(55, 150), move(14, 200)] });
    const stats = detectSignatureStats(input({ myConversions: [conv] })) as MarthSignatureStats;
    expect(stats.chainGrabs).toBe(0);
  });
});

describe("Fox hit sequences", () => {
  it("shine → usmash must be adjacent; uthrow → uair uses id 55; kills require the closer as the final hit", () => {
    const adjacent = conversion({ moves: [move(21, 100), move(11, 120)] });
    const gap = conversion({ moves: [move(21, 100), move(13, 110), move(11, 120)] });
    const uthrowUairKill = conversion({ didKill: true, moves: [move(55, 100), move(16, 150)] });
    const uthrowUairThenBair = conversion({ didKill: true, moves: [move(55, 100), move(16, 150), move(15, 180)] });
    const bthrowUair = conversion({ moves: [move(54, 100), move(16, 150)] });
    const stats = detectSignatureStats(
      input({ character: "Fox", myConversions: [adjacent, gap, uthrowUairKill, uthrowUairThenBair, bthrowUair] }),
    ) as FoxSignatureStats;
    expect(stats.waveshineToUpsmash).toBe(1);
    expect(stats.upthrowUpairs).toBe(2);
    expect(stats.upthrowUpairKills).toBe(1);
  });

  it("shine spike kills need the victim offstage at the shine and a non-top death", () => {
    const frames = framesWithPosts({
      170: { 1: { positionX: -95, positionY: -20 } },
      300: { 1: { positionX: -224, positionY: 30, actionStateId: 1 } },
    });
    const spike = conversion({ didKill: true, endFrame: 300, moves: [move(21, 170)] });
    const onstageFrames = framesWithPosts({
      170: { 1: { positionX: 0, positionY: 0 } },
      300: { 1: { positionX: -224, positionY: 30, actionStateId: 1 } },
    });
    expect(
      (detectSignatureStats(input({ character: "Fox", myConversions: [spike], frames })) as FoxSignatureStats)
        .shineSpikeKills,
    ).toBe(1);
    expect(
      (
        detectSignatureStats(
          input({ character: "Fox", myConversions: [spike], frames: onstageFrames }),
        ) as FoxSignatureStats
      ).shineSpikeKills,
    ).toBe(0);
  });

  it("counts lasers fired from the item stream (distinct spawns owned by the player)", () => {
    const frames = framesWithPosts({ 10: {}, 11: {}, 12: {} });
    (frames[10] as any).items = [
      { spawnId: 1, typeId: FALCO_LASER_ITEM_ID, owner: 0 },
      { spawnId: 2, typeId: FALCO_LASER_ITEM_ID, owner: 1 },
    ];
    (frames[11] as any).items = [{ spawnId: 1, typeId: FALCO_LASER_ITEM_ID, owner: 0 }];
    (frames[12] as any).items = [{ spawnId: 3, typeId: 99, owner: 0 }];
    expect(countProjectileSpawns(frames, 20, 0, [FALCO_LASER_ITEM_ID])).toBe(1);
    expect(countProjectileSpawns(frames, 20, 1, [FALCO_LASER_ITEM_ID])).toBe(1);
  });
});

describe("Falco shine grab", () => {
  it("POSITIVE: shine immediately followed by a pummel or throw", () => {
    expect(hasShineGrab([move(21, 100), move(52, 120, 3)])).toBe(true);
    expect(hasShineGrab([move(21, 100), move(55, 130)])).toBe(true);
  });
  it("NEGATIVE: shine followed by a getup attack (50) or an aerial is not a grab", () => {
    expect(hasShineGrab([move(21, 100), move(50, 120)])).toBe(false);
    expect(hasShineGrab([move(21, 100), move(17, 120)])).toBe(false);
  });
});

describe("Peach float aerials", () => {
  it("POSITIVE: float aerial (344-348) landing into Landing (42) is a float cancel", () => {
    const frames = denseFrames(
      -39,
      60,
      { 0: { actionStateId: 14 } },
      {
        10: { 0: { actionStateId: 341 } },
        11: { 0: { actionStateId: 341 } },
        12: { 0: { actionStateId: 345 } },
        13: { 0: { actionStateId: 345 } },
        14: { 0: { actionStateId: 42 } },
        15: { 0: { actionStateId: 42 } },
        30: { 0: { actionStateId: 341 } },
        31: { 0: { actionStateId: 348 } },
        32: { 0: { actionStateId: 348 } },
        33: { 0: { actionStateId: 341 } },
      },
    );
    expect(countPeachFloatAerials(frames, 60, 0)).toEqual({ floatAerials: 2, floatCancelAerials: 1 });
    const stats = detectSignatureStats(input({ character: "Peach", frames, lastFrame: 60 })) as PeachSignatureStats;
    expect(stats.floatAerials).toBe(2);
    expect(stats.floatCancelAerials).toBe(1);
  });

  it("NEGATIVE: a normal aerial (65-69) landing into its AttackAir landing state is not a float cancel", () => {
    const frames = denseFrames(
      -39,
      40,
      { 0: { actionStateId: 14 } },
      {
        10: { 0: { actionStateId: 66 } },
        11: { 0: { actionStateId: 66 } },
        12: { 0: { actionStateId: 71 } },
        13: { 0: { actionStateId: 42 } },
      },
    );
    expect(countPeachFloatAerials(frames, 40, 0)).toEqual({ floatAerials: 0, floatCancelAerials: 0 });
  });
});

describe("Falcon frame-based stats", () => {
  it("tech-chase grabs: victim grabbed within 20 frames of a down/tech state", () => {
    const frames = denseFrames(
      -39,
      200,
      { 1: { actionStateId: 14 } },
      {
        50: { 1: { actionStateId: 183 } },
        51: { 1: { actionStateId: 186 } },
        60: { 1: { actionStateId: 223 } }, // grabbed 9 frames after the getup
        61: { 1: { actionStateId: 224 } },
        150: { 1: { actionStateId: 223 } }, // grabbed in neutral — not a tech chase
      },
    );
    expect(countTechChaseGrabs(frames, 200, 1)).toBe(1);
  });

  it("gentlemen count entries into jab 3", () => {
    const frames = denseFrames(
      -39,
      100,
      { 0: { actionStateId: 14 } },
      {
        10: { 0: { actionStateId: 44 } },
        12: { 0: { actionStateId: 45 } },
        14: { 0: { actionStateId: 46 } },
        15: { 0: { actionStateId: 46 } },
        40: { 0: { actionStateId: 44 } },
        42: { 0: { actionStateId: 45 } },
        44: { 0: { actionStateId: 47 } },
      },
    );
    expect(countGentlemen(frames, 100, 0)).toBe(1);
  });
});

describe("special-move hit counts", () => {
  it("counts connected hits per special from conversion move lists", () => {
    const hits = countSpecialHits([
      conversion({ moves: [move(18, 100), move(18, 110), move(19, 120)] }),
      conversion({ moves: [move(21, 200), move(20, 210)] }),
    ]);
    expect(hits).toEqual({ neutralB: 2, sideB: 1, upB: 1, downB: 1 });
  });

  it("Luigi shoryuken kills need sweetspot damage", () => {
    const sweet = conversion({ didKill: true, moves: [move(20, 170, 25)] });
    const sour = conversion({ didKill: true, moves: [move(20, 170, 1)] });
    const stats = detectSignatureStats(input({ character: "Luigi", myConversions: [sweet, sour] })) as {
      shoryukenKills: number;
    };
    expect(stats.shoryukenKills).toBe(1);
  });

  it("Ness back throw kills use id 54 as the final hit", () => {
    const good = conversion({ didKill: true, moves: [move(54, 170)] });
    const wrong = conversion({ didKill: true, moves: [move(53, 170)] });
    const stats = detectSignatureStats(input({ character: "Ness", myConversions: [good, wrong] })) as {
      backThrowKills: number;
    };
    expect(stats.backThrowKills).toBe(1);
  });
});

describe("fixture integration", () => {
  it("returns a Peach block with float counts from a real replay", async () => {
    const path = await import("path");
    const { processGame } = await import("../src/pipeline");
    const result = processGame(path.resolve(__dirname, "fixtures/game1.slp"), 1);
    const peach = result.gameSummary.players.find((p) => p.character === "Peach");
    expect(peach).toBeDefined();
    const stats = peach!.signatureStats as PeachSignatureStats;
    expect(stats.character).toBe("Peach");
    expect(stats.floatAerials).toBeGreaterThanOrEqual(stats.floatCancelAerials);
    const frames: FramesType = {};
    void frames;
  });
});
