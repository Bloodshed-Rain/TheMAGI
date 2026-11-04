// ── Measured DI (stick-input ground truth) ────────────────────────────
//
// Phase 1 of decision-grading stats: replace inferred DI proxies with the
// controller stream itself. No other tool in the ecosystem reads pre-frame
// stick data for DI — this is the loudest gap the competitor recon found.
//
// Two extractors, both consumed by frameEvents.extractFrameEvents:
//  - computeDeathVerdicts: for every death, read the DI input on the last
//    hitlag frame of the final hit, compare it against the perpendicular of
//    the observed launch trajectory, and issue a verdict
//    (NO_DI / WRONG_DI / OK_DI / GOOD_DI / FAILED_RECOVERY / SD / UNKNOWN)
//    plus a resource-fault flag (died offstage with the double jump unspent).
//  - extractThrowDIRecords: victim-side throw DI — stick sector at release,
//    normalized by the thrower's facing direction, per throw type.
//
// Honesty notes (from adversarial verification of the design):
//  - The launch vector is measured from post-hitlag displacement, i.e. the
//    DI-already-applied trajectory. Trajectory DI shifts the angle ≤ ~18°,
//    so scoring against the observed perpendicular is approximate but
//    directionally sound. Treat scores as a grading aid, not physics truth.
//  - hitlagRemaining only exists on slp spec ≥ 3.8.0 replays; older files
//    use an entry-frame fallback with looser timing.
//  - The final-hit search is anchored at the frame the victim ENTERED a
//    dying state, not at the stock-loss frame. slippi-js decrements the
//    stock when the death animation ends — a Star KO spends 100+ frames in
//    DeadUpStar first, which used to push the real hit out of the lookback
//    window and mislabel the death "SD".
//  - No hit in the final window splits two ways: the opponent's kill
//    conversion was still alive at death (launched by an earlier hit, never
//    made it back) ⇒ FAILED_RECOVERY; no live kill conversion ⇒ SD.

import { State, Frames, type FramesType } from "@slippi/slippi-js/node";

import { isAirborne, isOffstage } from "./helpers.js";
import {
  isDamagedState,
  THROWN_START,
  THROWN_END,
  type StockRecord,
  type DeathVerdict,
  type ThrowDIRecord,
} from "./frameEvents.js";

/** Melee analog deadzone — stick magnitudes below this are no input. */
export const DI_DEADZONE = 0.2875;

/** Double-jump states (JumpAerialF/B). Not named in slippi-js's State table. */
const JUMP_AERIAL_F = 27;
const JUMP_AERIAL_B = 28;

const FINAL_HIT_LOOKBACK_FRAMES = 120;
const RESOURCE_FAULT_MIN_FRAMES = 10;

export interface DeathVerdictFields {
  verdict: DeathVerdict;
  diScore: number | null;
  diStickX: number | null;
  diStickY: number | null;
  launchAngleDeg: number | null;
  resourceFault: boolean;
  finalHitFrame: number | null;
}

function isThrownState(s: number): boolean {
  return s >= THROWN_START && s <= THROWN_END;
}

/**
 * Locate the final hit of a death: the last hitlag frame while in a damage
 * or thrown state (precise path), or the last damage/thrown entry frame + 2
 * on pre-3.8.0 replays without hitlagRemaining (approximate path).
 */
function findLastHitlagFrame(
  frames: FramesType,
  victimIndex: number,
  searchStart: number,
  endFrame: number,
): number | null {
  let fallbackEntry: number | null = null;
  let prevState = -1;

  for (let f = endFrame; f >= searchStart; f--) {
    const post = frames[f]?.players[victimIndex]?.post;
    if (!post) continue;
    const s = post.actionStateId ?? 0;

    if (post.hitlagRemaining != null) {
      if (post.hitlagRemaining > 0 && (isDamagedState(s) || isThrownState(s))) {
        return f; // walking backward ⇒ first match is the LAST hitlag frame
      }
    } else if (fallbackEntry == null && (isDamagedState(s) || isThrownState(s))) {
      // Walking backward: remember the deepest (earliest) damage frame seen,
      // then keep going — we want the entry frame of the final damage spell.
      if (!isDamagedState(prevState) && !isThrownState(prevState)) {
        fallbackEntry = f;
      }
    }
    prevState = s;
  }

  return fallbackEntry != null ? Math.min(fallbackEntry + 2, endFrame) : null;
}

function isDyingState(s: number): boolean {
  return s >= State.DYING_START && s <= State.DYING_END;
}

/**
 * First frame of the dying-state run that ends at the stock-loss frame.
 * Falls back to the stock-loss frame when the victim is not in a dying state
 * there (malformed/truncated replays).
 */
function findDeathEntryFrame(frames: FramesType, victimIndex: number, searchStart: number, endFrame: number): number {
  let entry = endFrame;
  for (let f = endFrame; f >= searchStart; f--) {
    const s = frames[f]?.players[victimIndex]?.post?.actionStateId;
    if (s == null || !isDyingState(s)) break;
    entry = f;
  }
  return entry;
}

/**
 * Fell to death offstage holding an unused double jump (from the final hit to
 * death). Only frames where a jump was possible count: the DamageFly/hitstun
 * launch states (DAMAGE_START..DAMAGE_END) and thrown states are skipped, so
 * a direct blast-zone kill is never blamed on an unspent jump. Conservative —
 * drifting in DamageFly after hitstun has ended is not counted either.
 */
function computeResourceFault(
  frames: FramesType,
  victimIndex: number,
  fromFrame: number,
  toFrame: number,
  stageId: number,
): boolean {
  let offstageWithJump = 0;
  let usedDoubleJump = false;
  for (let f = fromFrame; f <= toFrame; f++) {
    const post = frames[f]?.players[victimIndex]?.post;
    if (!post) continue;
    const s = post.actionStateId ?? 0;
    if (s === JUMP_AERIAL_F || s === JUMP_AERIAL_B) usedDoubleJump = true;
    if ((s >= State.DAMAGE_START && s <= State.DAMAGE_END) || isThrownState(s) || isDyingState(s)) continue;
    const airborne = post.isAirborne === true || isAirborne(s);
    if (airborne && isOffstage(post.positionX ?? 0, post.positionY ?? 0, stageId) && (post.jumpsRemaining ?? 0) > 0) {
      offstageWithJump++;
    }
  }
  return offstageWithJump >= RESOURCE_FAULT_MIN_FRAMES && !usedDoubleJump;
}

export function computeDeathVerdicts(
  stocks: StockRecord[],
  frames: FramesType,
  lastFrame: number,
  stageId: number,
  indexBySlot: [number, number],
): Map<string, DeathVerdictFields> {
  const out = new Map<string, DeathVerdictFields>();

  for (const stock of stocks) {
    if (!stock.died || stock.endFrame == null) continue;
    const victimIndex = indexBySlot[stock.victimSlot];
    const stockEnd = Math.min(stock.endFrame, lastFrame);
    // Everything after the dying-state entry is death animation — anchor there.
    const endFrame = findDeathEntryFrame(frames, victimIndex, stock.startFrame, stockEnd);
    const searchStart = Math.max(stock.startFrame, endFrame - FINAL_HIT_LOOKBACK_FRAMES);

    const L = findLastHitlagFrame(frames, victimIndex, searchStart, endFrame);

    if (L == null) {
      // killerMoveId is set only when a didKill conversion against this player
      // ended on the stock-loss frame, i.e. the opponent's punish never reset.
      const earlierHit =
        stock.killerMoveId != null ? findLastHitlagFrame(frames, victimIndex, stock.startFrame, endFrame) : null;
      const failedRecovery = stock.killerMoveId != null;
      out.set(`${stock.victimSlot}:${stock.stockNumber}`, {
        verdict: failedRecovery ? "FAILED_RECOVERY" : "SD",
        diScore: null,
        diStickX: null,
        diStickY: null,
        launchAngleDeg: null,
        resourceFault:
          failedRecovery && earlierHit != null
            ? computeResourceFault(frames, victimIndex, earlierHit, endFrame, stageId)
            : false,
        finalHitFrame: earlierHit,
      });
      continue;
    }

    // DI input = stick on the last hitlag frame (trajectory DI applies here).
    const pre = frames[L]?.players[victimIndex]?.pre;
    const stickX = pre?.joystickX ?? null;
    const stickY = pre?.joystickY ?? null;
    const magnitude = stickX != null && stickY != null ? Math.hypot(stickX, stickY) : null;

    // Observed launch vector over the first frames after hitlag.
    const t0 = L + 1;
    const t1 = Math.min(t0 + 2, endFrame);
    const p0 = frames[t0]?.players[victimIndex]?.post;
    const p1 = frames[t1]?.players[victimIndex]?.post;
    let launchX: number | null = null;
    let launchY: number | null = null;
    if (p0?.positionX != null && p0.positionY != null && p1?.positionX != null && p1.positionY != null && t1 > t0) {
      launchX = p1.positionX - p0.positionX;
      launchY = p1.positionY - p0.positionY;
    }
    const launchMag = launchX != null && launchY != null ? Math.hypot(launchX, launchY) : 0;
    const launchAngleDeg =
      launchX != null && launchY != null && launchMag > 0.01
        ? Math.round((Math.atan2(launchY, launchX) * 180) / Math.PI)
        : null;

    const resourceFault = computeResourceFault(frames, victimIndex, L, endFrame, stageId);

    let verdict: DeathVerdict;
    let diScore: number | null = null;

    if (magnitude == null) {
      verdict = "UNKNOWN";
    } else if (magnitude < DI_DEADZONE) {
      verdict = "NO_DI";
    } else if (launchAngleDeg == null || launchMag <= 0.01) {
      verdict = "UNKNOWN";
    } else {
      // Optimal survival DI ⊥ launch. For side deaths only the upward
      // perpendicular buys survival (height = time); for up/down deaths both
      // rotations flatten the trajectory equally.
      const nx = launchX! / launchMag;
      const ny = launchY! / launchMag;
      const perps: [number, number][] = [
        [-ny, nx],
        [ny, -nx],
      ];
      const allowed =
        stock.deathDirection === "left" || stock.deathDirection === "right"
          ? perps.filter(([, py]) => py > 0.01)
          : perps;
      const candidates = allowed.length > 0 ? allowed : perps;

      const sx = stickX! / magnitude;
      const sy = stickY! / magnitude;
      const best = Math.max(...candidates.map(([px, py]) => sx * px + sy * py));
      diScore = Math.round(Math.min(1, Math.max(0, best)) * 100) / 100;

      verdict = diScore >= 0.7 ? "GOOD_DI" : diScore >= 0.3 ? "OK_DI" : "WRONG_DI";
    }

    out.set(`${stock.victimSlot}:${stock.stockNumber}`, {
      verdict,
      diScore,
      diStickX: stickX != null ? Math.round(stickX * 10000) / 10000 : null,
      diStickY: stickY != null ? Math.round(stickY * 10000) / 10000 : null,
      launchAngleDeg,
      resourceFault,
      finalHitFrame: L,
    });
  }

  return out;
}

// ── Throw DI ──────────────────────────────────────────────────────────

const THROW_DIRECTION_BY_STATE: Record<number, ThrowDIRecord["throwDirection"]> = {
  [State.THROW_FORWARD]: "forward",
  [State.THROW_BACK]: "back",
  [State.THROW_UP]: "up",
  [State.THROW_DOWN]: "down",
};

function isCaptureState(s: number): boolean {
  return s >= State.CAPTURE_START && s <= State.CAPTURE_END;
}

export function extractThrowDIRecords(
  frames: FramesType,
  lastFrame: number,
  indexBySlot: [number, number],
): ThrowDIRecord[] {
  const out: ThrowDIRecord[] = [];

  for (const victimSlot of [0, 1] as const) {
    const victimIndex = indexBySlot[victimSlot];
    const throwerIndex = indexBySlot[victimSlot === 0 ? 1 : 0];
    let prevState = -1;

    for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
      const post = frames[f]?.players[victimIndex]?.post;
      if (!post) continue;
      const s = post.actionStateId ?? 0;

      const released = isCaptureState(prevState) && (isThrownState(s) || isDamagedState(s));
      prevState = s;

      if (!released) continue;

      // Attribute the throw: the thrower must have been in a throw state
      // just before release, which also filters out grab escapes and pokes.
      let throwDirection: ThrowDIRecord["throwDirection"] | null = null;
      let throwerFacing = 1;
      for (let tf = f; tf >= f - 25; tf--) {
        const tPost = frames[tf]?.players[throwerIndex]?.post;
        if (!tPost) continue;
        const dir = THROW_DIRECTION_BY_STATE[tPost.actionStateId ?? -1];
        if (dir) {
          throwDirection = dir;
          throwerFacing = (tPost.facingDirection ?? 1) >= 0 ? 1 : -1;
          break;
        }
      }
      if (!throwDirection) continue;

      // Stick at release: read the release frame and the one before, keep
      // the stronger input (players hold throw DI through the release).
      const preR = frames[f]?.players[victimIndex]?.pre;
      const prePrev = frames[f - 1]?.players[victimIndex]?.pre;
      const candidates: [number, number][] = [];
      if (preR?.joystickX != null && preR.joystickY != null) candidates.push([preR.joystickX, preR.joystickY]);
      if (prePrev?.joystickX != null && prePrev.joystickY != null)
        candidates.push([prePrev.joystickX, prePrev.joystickY]);
      if (candidates.length === 0) continue;
      const [stickX, stickY] = candidates.reduce((a, b) => (Math.hypot(...a) >= Math.hypot(...b) ? a : b));
      const magnitude = Math.hypot(stickX, stickY);

      // Sector: octant of the stick normalized so +x = thrower's facing
      // direction. 0=forward(facing), 2=up, 4=behind, 6=down.
      const xr = stickX * throwerFacing;
      const angle = Math.atan2(stickY, xr);
      const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;

      out.push({
        victimSlot,
        frame: f,
        throwDirection,
        percent: Math.round((post.percent ?? 0) * 100) / 100,
        stickX: Math.round(stickX * 10000) / 10000,
        stickY: Math.round(stickY * 10000) / 10000,
        sector,
        noDI: magnitude < DI_DEADZONE,
      });
    }
  }

  return out.sort((a, b) => a.frame - b.frame);
}
