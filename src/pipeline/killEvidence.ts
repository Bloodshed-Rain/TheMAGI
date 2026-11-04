// ── Kill evidence shared by highlights, signature stats and live alerts ──
//
// What a conversion record can and cannot establish about a kill:
//
//  - `conv.endFrame` on a didKill conversion is the frame slippi-js saw the
//    stock counter drop. By then the victim has already flown to the blast
//    zone (x ≈ ±224 on Battlefield, y ≈ −110 for bottom deaths) and sits in a
//    Dead* action state, so "was the victim offstage at endFrame" is true for
//    EVERY side or bottom death. It must never be used as spike/gimp evidence.
//  - The final move's `frame` is the frame the last damaging hit landed; the
//    victim's position there is the honest "offstage when hit" signal.
//  - The victim's action state on the stock-loss frame is the death animation
//    (DeadDown 0 … DeadUpStar 4+), which slippi-js decodes into a blast-zone
//    direction. A kill that sent the victim off the bottom is the only kind
//    that can be called a spike.
//
// These helpers are the single source of truth for those three facts.

import type { ConversionType, FramesType, PostFrameUpdateType } from "@slippi/slippi-js/node";

import { getDeathDirection } from "./frameData.js";
import { isOffstage } from "./helpers.js";

export type KillDirection = "up" | "down" | "left" | "right";

/** Post-frame of the victim on the frame the final damaging hit landed. */
export function victimPostAtFinalHit(conv: ConversionType, frames: FramesType): PostFrameUpdateType | null {
  const last = conv.moves[conv.moves.length - 1];
  if (!last) return null;
  return frames[last.frame]?.players[conv.playerIndex]?.post ?? null;
}

/** The victim was past the ledge or below the stage when the final hit landed. */
export function finalHitOffstage(conv: ConversionType, frames: FramesType, stageId: number): boolean {
  const post = victimPostAtFinalHit(conv, frames);
  if (!post) return false;
  return isOffstage(post.positionX ?? 0, post.positionY ?? 0, stageId);
}

/**
 * Blast-zone direction of a kill conversion, decoded from the victim's death
 * animation on (or one frame either side of) the stock-loss frame. Null when
 * the conversion did not kill or the death state cannot be read.
 */
export function killDirection(conv: ConversionType, frames: FramesType): KillDirection | null {
  if (!conv.didKill || conv.endFrame == null) return null;
  for (const f of [conv.endFrame, conv.endFrame - 1, conv.endFrame + 1]) {
    const state = frames[f]?.players[conv.playerIndex]?.post?.actionStateId;
    if (state == null) continue;
    const dir = getDeathDirection(state);
    if (dir) return dir;
  }
  return null;
}

/** Victim percent just before the final damaging hit (endPercent minus that move's damage). */
export function percentAtFinalHit(conv: ConversionType): number {
  const last = conv.moves[conv.moves.length - 1];
  const end = conv.endPercent ?? conv.currentPercent;
  if (!last) return Math.max(0, end);
  return Math.max(0, end - last.damage);
}

/**
 * A kill whose final hit was `moveId`, landed while the victim was offstage,
 * and sent them off the bottom blast zone — the only sequence the replay can
 * call a spike/meteor kill. A dair that killed off the side, or a dair on a
 * grounded opponent who later fell to the bottom, does not qualify.
 */
export function isDownwardOffstageKill(
  conv: ConversionType,
  frames: FramesType,
  stageId: number,
  moveId: number,
): boolean {
  if (!conv.didKill) return false;
  const last = conv.moves[conv.moves.length - 1];
  if (!last || last.moveId !== moveId) return false;
  return killDirection(conv, frames) === "down" && finalHitOffstage(conv, frames, stageId);
}

/**
 * A kill whose final hit connected with the victim already offstage and that
 * did not send them off the top: the edgeguard/gimp family (shine spikes,
 * fair gimps, cape turnarounds). Direction `up` is excluded because an
 * offstage up-kill is a regular launch, not an edgeguard.
 */
export function isOffstageKill(conv: ConversionType, frames: FramesType, stageId: number): boolean {
  if (!conv.didKill) return false;
  if (!finalHitOffstage(conv, frames, stageId)) return false;
  return killDirection(conv, frames) !== "up";
}
