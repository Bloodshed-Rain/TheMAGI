import { describe, it, expect } from "vitest";
import { computeRecoveryCounters } from "../src/pipeline/recoveryStats";
import { denseFrames } from "./helpers/syntheticFrames";

const BF = 31; // ledge 68.4
const DAMAGE_FLY = 88;
const FALL = 29;
const WAIT = 14;
const CLIFF_WAIT = 253;

function base() {
  return {
    0: { actionStateId: WAIT, positionX: 0, positionY: 0, stocksRemaining: 4, percent: 50 },
    1: { actionStateId: WAIT, positionX: 0, positionY: 0, stocksRemaining: 4, percent: 50 },
  };
}

describe("recovery counters", () => {
  it("POSITIVE: opponent hit while recovering and then dying is an edgeguard kill", () => {
    const frames = denseFrames(-39, 200, base(), {
      ...Object.fromEntries(
        Array.from({ length: 60 }, (_, i) => [
          100 + i,
          { 1: { actionStateId: DAMAGE_FLY, positionX: -100, positionY: -30, percent: i >= 20 ? 65 : 50 } },
        ]),
      ),
      160: { 1: { actionStateId: 0, positionX: -100, positionY: -110, stocksRemaining: 3, percent: 65 } },
      161: { 1: { actionStateId: 12, positionX: 0, positionY: 40, stocksRemaining: 3, percent: 0 } },
    });
    const counters = computeRecoveryCounters(frames, 200, BF, 0, 1);
    expect(counters.edgeguardAttempts).toBe(1);
    expect(counters.edgeguardKills).toBe(1);
    expect(counters.opponentUnforcedRecoveryDeaths).toBe(0);
  });

  it("NEGATIVE: opponent dying offstage with no hit and no ledge occupation is not an edgeguard kill", () => {
    const frames = denseFrames(-39, 200, base(), {
      ...Object.fromEntries(
        Array.from({ length: 60 }, (_, i) => [
          100 + i,
          { 1: { actionStateId: FALL, positionX: -100, positionY: -30 } },
        ]),
      ),
      160: { 1: { actionStateId: 0, positionX: -100, positionY: -110, stocksRemaining: 3 } },
      161: { 1: { actionStateId: 12, positionX: 0, positionY: 40, stocksRemaining: 3 } },
    });
    const counters = computeRecoveryCounters(frames, 200, BF, 0, 1);
    expect(counters.edgeguardAttempts).toBe(1);
    expect(counters.edgeguardKills).toBe(0);
    expect(counters.opponentUnforcedRecoveryDeaths).toBe(1);
  });

  it("POSITIVE: holding the ledge while the opponent dies offstage counts as an edgeguard", () => {
    const frames = denseFrames(-39, 200, base(), {
      ...Object.fromEntries(
        Array.from({ length: 60 }, (_, i) => [
          100 + i,
          {
            0: { actionStateId: CLIFF_WAIT, positionX: -72, positionY: -20 },
            1: { actionStateId: FALL, positionX: -100, positionY: -30 },
          },
        ]),
      ),
      160: { 1: { actionStateId: 0, positionX: -100, positionY: -110, stocksRemaining: 3 } },
      161: { 1: { actionStateId: 12, positionX: 0, positionY: 40, stocksRemaining: 3 } },
    });
    expect(computeRecoveryCounters(frames, 200, BF, 0, 1).edgeguardKills).toBe(1);
  });

  it("NEGATIVE: the death frame at the blast zone does not open a phantom recovery attempt", () => {
    const frames = denseFrames(-39, 200, base(), {
      100: { 0: { actionStateId: DAMAGE_FLY, positionX: 50, positionY: 60 } },
      101: { 0: { actionStateId: 2, positionX: 224, positionY: 70, stocksRemaining: 3 } },
      102: { 0: { actionStateId: 12, positionX: 0, positionY: 40, stocksRemaining: 3 } },
      103: { 0: { actionStateId: 13, positionX: 0, positionY: 40, stocksRemaining: 3 } },
    });
    const counters = computeRecoveryCounters(frames, 200, BF, 0, 1);
    expect(counters.recoveryAttempts).toBe(0);
    expect(counters.recoverySuccesses).toBe(0);
  });

  it("recovery success = made it back on stage; uses the real ledge boundary", () => {
    const frames = denseFrames(-39, 200, base(), {
      ...Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [100 + i, { 0: { actionStateId: FALL, positionX: -90, positionY: -30 } }]),
      ),
      130: { 0: { actionStateId: WAIT, positionX: -60, positionY: 0 } },
    });
    const counters = computeRecoveryCounters(frames, 200, BF, 0, 1);
    expect(counters.recoveryAttempts).toBe(1);
    expect(counters.recoverySuccesses).toBe(1);
    // Standing at x=-75 on Dreamland (ledge 77.27) never opens a recovery situation.
    const dreamland = denseFrames(-39, 100, base(), {
      50: { 0: { positionX: -75, positionY: 0 } },
      51: { 0: { positionX: -75, positionY: 0 } },
    });
    expect(computeRecoveryCounters(dreamland, 100, 28, 0, 1).recoveryAttempts).toBe(0);
  });
});
