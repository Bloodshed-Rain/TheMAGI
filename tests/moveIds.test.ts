import { describe, it, expect } from "vitest";
import { moves as slippiMoves } from "@slippi/slippi-js/node";
import { moveIdToName, stageBounds, STAGE_LEDGE_X, isOffstage, isAirborne } from "../src/pipeline/helpers";
import {
  MOVE_PUMMEL,
  MOVE_FTHROW,
  MOVE_BTHROW,
  MOVE_UTHROW,
  MOVE_DTHROW,
  MOVE_GETUP_ATTACK,
  MOVE_LEDGE_ATTACK,
  isThrowMoveId,
  isGrabFamilyMoveId,
  countThrows,
} from "../src/pipeline/signatureStats";

/** Our display name for a slippi short name ("up-b" → "up b", "getup-slow" → getup attack). */
const EXPECTED_BY_SLIPPI_SHORT_NAME: Record<string, string> = {
  misc: "misc",
  jab: "jab",
  "rapid-jabs": "rapid jab",
  dash: "dash attack",
  ftilt: "ftilt",
  utilt: "utilt",
  dtilt: "dtilt",
  fsmash: "fsmash",
  usmash: "usmash",
  dsmash: "dsmash",
  nair: "nair",
  fair: "fair",
  bair: "bair",
  uair: "uair",
  dair: "dair",
  "neutral-b": "neutral b",
  "side-b": "side b",
  "up-b": "up b",
  "down-b": "down b",
  getup: "getup attack",
  "getup-slow": "getup attack",
  pummel: "pummel",
  fthrow: "fthrow",
  bthrow: "bthrow",
  uthrow: "uthrow",
  dthrow: "dthrow",
  "edge-slow": "ledge attack",
  edge: "ledge attack",
};

describe("move id table parity with slippi-js", () => {
  it("names every id the installed library defines, and nothing else", () => {
    const libraryIds: number[] = [];
    for (let id = 1; id <= 70; id++) {
      if (slippiMoves.getMoveInfo(id).id === id) libraryIds.push(id);
    }
    expect(libraryIds).toContain(52);
    expect(libraryIds).toContain(56);
    for (const id of libraryIds) {
      const shortName = slippiMoves.getMoveShortName(id);
      expect(moveIdToName[id], `id ${id} (${shortName})`).toBe(EXPECTED_BY_SLIPPI_SHORT_NAME[shortName]);
    }
    for (const id of Object.keys(moveIdToName).map(Number)) {
      expect(libraryIds, `id ${id} is not a slippi move`).toContain(id);
    }
  });

  it("grab-family constants match the library (pummel 52, throws 53-56)", () => {
    expect(slippiMoves.getMoveShortName(MOVE_PUMMEL)).toBe("pummel");
    expect(slippiMoves.getMoveShortName(MOVE_FTHROW)).toBe("fthrow");
    expect(slippiMoves.getMoveShortName(MOVE_BTHROW)).toBe("bthrow");
    expect(slippiMoves.getMoveShortName(MOVE_UTHROW)).toBe("uthrow");
    expect(slippiMoves.getMoveShortName(MOVE_DTHROW)).toBe("dthrow");
    expect(slippiMoves.getMoveShortName(MOVE_GETUP_ATTACK)).toBe("getup");
    expect(slippiMoves.getMoveShortName(MOVE_LEDGE_ATTACK)).toBe("edge");
  });

  it("throw predicates exclude pummels and getup attacks", () => {
    expect([53, 54, 55, 56].every(isThrowMoveId)).toBe(true);
    expect([50, 51, 52, 61, 62, 14].some(isThrowMoveId)).toBe(false);
    expect(isGrabFamilyMoveId(52)).toBe(true);
    expect(isGrabFamilyMoveId(50)).toBe(false);
    const moves = [52, 52, 55].map((moveId, i) => ({ moveId, frame: i, playerIndex: 0, hitCount: 1, damage: 3 }));
    expect(countThrows(moves)).toBe(1);
  });
});

describe("stage bounds", () => {
  it("derives the offstage x boundary from the real ledge position", () => {
    for (const [stageId, ledge] of Object.entries(STAGE_LEDGE_X)) {
      expect(stageBounds(Number(stageId)).x).toBe(ledge);
    }
  });

  it("POSITIVE: standing near Dreamland's edge (x=72) is on stage", () => {
    expect(isOffstage(72, 0, 28)).toBe(false);
    expect(isOffstage(-77, 0, 28)).toBe(false);
  });

  it("NEGATIVE: x=72 on Battlefield is past the 68.4 ledge, so offstage", () => {
    expect(isOffstage(72, 0, 31)).toBe(true);
    expect(isOffstage(-70, 5, 31)).toBe(true);
  });

  it("below the stage surface is offstage on every stage", () => {
    expect(isOffstage(0, -11, 32)).toBe(true);
    expect(isOffstage(0, -9, 32)).toBe(false);
  });
});

describe("isAirborne", () => {
  it("does not count jumpsquat (KneeBend 24) as airborne, but counts jumps and falls", () => {
    expect(isAirborne(24)).toBe(false);
    expect(isAirborne(25)).toBe(true);
    expect(isAirborne(29)).toBe(true);
    expect(isAirborne(34)).toBe(true);
    expect(isAirborne(14)).toBe(false);
  });
});
