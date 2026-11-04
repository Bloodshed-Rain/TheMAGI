// ── Legacy recovery / edgeguard counters (PlayerSummary) ──────────────
//
// Per-game headline counters that predate the recovery-span ledger in
// recoveryEvents.ts. They share its situation definition (below the stage,
// or far past the ledge in a vulnerable air state) so the numbers agree.
//
// An "edgeguard kill" is only credited when the edgeguarder did something:
// the recovering player took damage inside the situation, or the edgeguarder
// occupied the ledge during it. A recovery that ends in death with neither
// (a self-destruct, or a launch that was already fatal) is NOT an edgeguard
// success — earlier versions counted every offstage death as one.

import { State, Frames, type FramesType } from "@slippi/slippi-js/node";

import { isOffstage, stageBounds } from "./helpers.js";
import { isDeadOrRespawningState } from "./frameEvents.js";

const FAR_OFFSTAGE_MARGIN = 20;
const CLIFF_WAIT = 253;

export interface RecoveryCounters {
  /** Times this player entered a recovery situation. */
  recoveryAttempts: number;
  /** Recovery situations that ended back on stage (ledge hangs resolve on the next grounded frame). */
  recoverySuccesses: number;
  /** Times the opponent entered a recovery situation (this player's edgeguard chances). */
  edgeguardAttempts: number;
  /** Opponent recovery situations that ended in death after a hit or a ledge occupation by this player. */
  edgeguardKills: number;
  /** Opponent recovery situations that ended in death with no hit and no ledge occupation. */
  opponentUnforcedRecoveryDeaths: number;
}

function vulnerableState(s: number): boolean {
  return (
    s === State.DAMAGE_FALL || (s >= State.DAMAGE_START && s <= State.DAMAGE_END) || s === State.LANDING_FALL_SPECIAL
  );
}

function atLedge(s: number): boolean {
  return s === State.CLIFF_CATCH || s === CLIFF_WAIT;
}

interface Situation {
  startPercent: number;
  hit: boolean;
  guarderHeldLedge: boolean;
}

/**
 * Walk the frames once for `subjectIndex` (the player who may need to
 * recover) and `observerIndex` (the other player), returning how many
 * situations started and how they resolved.
 */
function walk(
  frames: FramesType,
  lastFrame: number,
  stageId: number,
  subjectIndex: number,
  observerIndex: number,
): { attempts: number; returned: number; diedForced: number; diedUnforced: number } {
  const bounds = stageBounds(stageId);
  let attempts = 0;
  let returned = 0;
  let diedForced = 0;
  let diedUnforced = 0;
  let open: Situation | null = null;
  let prevStocks = -1;

  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const frame = frames[f];
    const post = frame?.players[subjectIndex]?.post;
    if (!post) continue;

    const stocks = post.stocksRemaining ?? 0;
    if (prevStocks > 0 && stocks < prevStocks && open) {
      if (open.hit || open.guarderHeldLedge) diedForced++;
      else diedUnforced++;
      open = null;
    }
    prevStocks = stocks;
    if (stocks <= 0) continue;

    const x = post.positionX ?? 0;
    const y = post.positionY ?? 0;
    const s = post.actionStateId ?? 0;
    const percent = post.percent ?? 0;

    // Death animations play out at the blast zone and the respawn platform
    // sits above the stage; neither is a recovery situation. (The previous
    // counter opened a phantom attempt on every death frame and closed it as
    // a "success" on respawn.)
    if (isDeadOrRespawningState(s)) {
      open = null;
      continue;
    }

    if (open) {
      if (percent > open.startPercent + 0.01) open.hit = true;
      const observerState = frame?.players[observerIndex]?.post?.actionStateId;
      if (observerState != null && atLedge(observerState)) open.guarderHeldLedge = true;
      if (!isOffstage(x, y, stageId)) {
        returned++;
        open = null;
      }
      continue;
    }

    const belowStage = y < bounds.yMin;
    const farOffstage = Math.abs(x) > bounds.x + FAR_OFFSTAGE_MARGIN;
    if (belowStage || (farOffstage && vulnerableState(s))) {
      attempts++;
      open = { startPercent: percent, hit: false, guarderHeldLedge: false };
    }
  }

  return { attempts, returned, diedForced, diedUnforced };
}

export function computeRecoveryCounters(
  frames: FramesType,
  lastFrame: number,
  stageId: number,
  playerIndex: number,
  opponentIndex: number,
): RecoveryCounters {
  const mine = walk(frames, lastFrame, stageId, playerIndex, opponentIndex);
  const theirs = walk(frames, lastFrame, stageId, opponentIndex, playerIndex);
  return {
    recoveryAttempts: mine.attempts,
    recoverySuccesses: mine.returned,
    edgeguardAttempts: theirs.attempts,
    edgeguardKills: theirs.diedForced,
    opponentUnforcedRecoveryDeaths: theirs.diedUnforced,
  };
}
