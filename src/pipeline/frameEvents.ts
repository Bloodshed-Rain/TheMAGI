// ── Per-instance frame events (shared detector pass) ──────────────────
//
// Phase-0 infrastructure for decision-grading stats: instead of only
// aggregate counters, extract per-instance event records from one walk
// over the frame data. Everything returned here is plain data (survives
// worker_threads structured clone) and is persisted per-game so later
// stats can condition on percent / position / opponent across games.
//
// Slippi semantics reminders (see CLAUDE.md):
//  - conversion.playerIndex is the VICTIM; the attacker is the other player.
//  - GuardReflect (182) fires on EVERY shield press — it is the shield-raise
//    animation, never a powershield/block signal. Real shieldstun from a
//    blocked hit is GuardSetOff (181).

import { State, Frames, type FramesType, type ConversionType, type StockType } from "@slippi/slippi-js/node";

import { getDeathDirection } from "./frameData.js";
import { STAGE_LEDGE_X, GUARD, GUARD_SET_OFF, GUARD_REFLECT } from "./helpers.js";
import { computeDeathVerdicts, extractThrowDIRecords } from "./measuredDI.js";
import { extractRecoverySpans } from "./recoveryEvents.js";
import { extractShieldBlocks } from "./shieldEvents.js";
import { extractWhiffEvents } from "./whiffEvents.js";

// ── Action state constants not named in slippi-js's State table ────────
// Verified against the community action-state map. The slippi-js enum
// anchors this block: TECH_MISS_UP=183, JAB_RESET_UP=185, TECH_MISS_DOWN=191,
// JAB_RESET_DOWN=193 — each 8-state group is (Bound, Wait, Damage, Stand,
// Attack, RollForward, RollBackward, Spot) for face-up then face-down.
const DOWN_STAND_UP = 186; // neutral getup (face up)
const DOWN_ATTACK_UP = 187; // getup attack (face up)
const DOWN_ROLL_FWD_UP = 188;
const DOWN_ROLL_BACK_UP = 189;
const DOWN_STAND_DOWN = 194;
const DOWN_ATTACK_DOWN = 195;
const DOWN_ROLL_FWD_DOWN = 196;
const DOWN_ROLL_BACK_DOWN = 197;

const CLIFF_WAIT = 253;
const CLIFF_STAND_SLOW = 254; // 100%+ variant
const CLIFF_STAND_QUICK = 255;
const CLIFF_ATTACK_SLOW = 256;
const CLIFF_ATTACK_QUICK = 257;
const CLIFF_ROLL_SLOW = 258;
const CLIFF_ROLL_QUICK = 259;
const CLIFF_JUMP_START = 260; // 260-263: jump slow/quick variants
const CLIFF_JUMP_END = 263;

const REBIRTH = 12;
const REBIRTH_WAIT = 13;

// Victim-side thrown states (being thrown, after release from capture).
export const THROWN_START = 239;
export const THROWN_END = 243;

// Character-specific action states (specials) start here.
const SPECIAL_STATE_START = 341;

// ── Tunables (v1 heuristics — documented, revisit with real-data validation)
const ATTACK_MERGE_GAP_FRAMES = 3; // multihits / jab strings merge into one instance
const ACTIONABLE_SCAN_CAP_FRAMES = 90; // give up finding endlag end after this
const PUNISH_WINDOW_FRAMES = 45; // minimum window after the option starts
const POST_OPTION_PUNISH_FRAMES = 20; // ...extended to this many frames after the option ends
const OPTION_END_SCAN_CAP = 150; // give up locating the option's end after this
const PRESSURED_DX_UNITS = 32; // opponent within this horizontal range ⇒ contested
const PRESSURED_DY_UNITS = 45;
const CORNER_FRACTION = 0.7; // |x| beyond this fraction of ledge X ⇒ corner zone
const LEDGE_FOLLOWUP_WINDOW = 40; // frames after leaving ledge to classify drop options
const LEDGE_AIRDODGE_WINDOW = 30; // airdodge within this window of leaving ledge ⇒ ledgedash
const OOS_OPTION_WINDOW = 20; // frames after shieldstun ends to pick an escape option
const KNOCKDOWN_TIMEOUT_FRAMES = 300; // abandon a knockdown situation after this
const NEUTRAL_MIN_SEGMENT_FRAMES = 15;

export type PlayerSlot = 0 | 1;

export interface ConversionRecord {
  /** Which settings-order slot (0/1) landed this conversion. */
  attackerSlot: PlayerSlot;
  startFrame: number;
  endFrame: number | null;
  /** Victim percent when the conversion started / ended. */
  startPercent: number;
  endPercent: number;
  damage: number;
  moveCount: number;
  openerMoveId: number | null;
  lastMoveId: number | null;
  openingType: string;
  didKill: boolean;
  moves: { frame: number; moveId: number; damage: number }[];
}

/**
 * Version of the stored per-instance event definitions. Bump whenever a
 * detector change alters what an already-persisted row means; games stamped
 * with an older version are re-parsed by a plain (non --force) backfill, and
 * cross-game aggregates that depend on the changed fields only read current
 * games.
 *   1 — original v10-v14 detectors (games.events_version NULL).
 *   2 — death verdicts anchored at dying-state entry + FAILED_RECOVERY;
 *       DeadDown (state 0) counted as a death; resource faults skip hitstun
 *       launch frames; habit `punished` = hit or grabbed from the option's
 *       start until 20 frames after it ends (min 45), not only a NEW conversion.
 *   3 — offstage boundary derived from the real ledge x per stage (Battlefield
 *       68.4 / Dreamland 77.27 were swapped before), which moves recovery
 *       spans, whiff exclusions and resource faults on those stages; KneeBend
 *       no longer counts as airborne. Signature stats and highlights are
 *       rebuilt by the same backfill (move-id table and kill evidence fixes).
 */
export const FRAME_EVENTS_VERSION = 3;

/**
 * Measured-DI grade for a death (from the actual stick input).
 * FAILED_RECOVERY: no hit in the final window before death, but the
 * opponent's kill conversion was still alive — launched by an earlier hit and
 * never made it back. No DI input is graded for it.
 * SD: no hit in the final window and no live kill conversion.
 */
export type DeathVerdict = "NO_DI" | "WRONG_DI" | "OK_DI" | "GOOD_DI" | "FAILED_RECOVERY" | "SD" | "UNKNOWN";

export interface StockRecord {
  victimSlot: PlayerSlot;
  stockNumber: number;
  startFrame: number;
  endFrame: number | null;
  startPercent: number;
  /** Percent at death; null when the stock survived to game end. */
  deathPercent: number | null;
  /** Last move of the killing conversion, when attributable. */
  killerMoveId: number | null;
  /** Blast zone direction decoded from the death animation. */
  deathDirection: "up" | "down" | "left" | "right" | null;
  died: boolean;
  /** Measured-DI verdict for died stocks (see measuredDI.ts); null when alive. */
  verdict: DeathVerdict | null;
  /** 0-1 cosine similarity of the DI input vs the optimal perpendicular. */
  diScore: number | null;
  /** Stick input on the last hitlag frame of the final hit. */
  diStickX: number | null;
  diStickY: number | null;
  /** Observed post-hitlag launch angle in degrees (atan2 convention). */
  launchAngleDeg: number | null;
  /** Died offstage with the double jump unspent. */
  resourceFault: boolean;
  /** Last hitlag frame of the final hit, when found. */
  finalHitFrame: number | null;
}

/** Victim-side throw DI: stick sector at release, thrower-facing normalized. */
export interface ThrowDIRecord {
  victimSlot: PlayerSlot;
  /** Release frame (victim leaves capture into the thrown launch). */
  frame: number;
  throwDirection: "forward" | "back" | "up" | "down";
  /** Victim percent at release. */
  percent: number;
  stickX: number;
  stickY: number;
  /** Octant with +x = thrower's facing: 0=forward, 2=up, 4=behind, 6=down. */
  sector: number;
  noDI: boolean;
}

export type HabitSituation = "knockdown" | "ledge" | "oos";

/**
 * One defensive choice, with the conditions under which it was made.
 * Only actual choices are recorded — situations that ended by getting hit
 * before an option came out produce no instance.
 */
export interface HabitInstance {
  playerSlot: PlayerSlot;
  situation: HabitSituation;
  option: string;
  /** Frame the chosen option began. */
  frame: number;
  /** Player percent when the situation started. */
  percent: number;
  /** In the corner zone with the opponent between them and center. */
  cornered: boolean;
  /** Opponent within threat range when the situation started. */
  pressured: boolean;
  /** A conversion against this player started within the punish window. */
  punished: boolean;
}

export interface AttackInstance {
  playerSlot: PlayerSlot;
  startFrame: number;
  /** Last frame spent in attack states (multihits merged). */
  endFrame: number;
  /** First frame back in a controlled state after the attack — measured endlag end. */
  firstActionableFrame: number | null;
  kind: "grounded" | "aerial" | "special" | "grab";
  startStateId: number;
  /** The attack touched the opponent (hitlag observed, or victim reaction). */
  connected: boolean;
  /** The victim was put into shieldstun during the instance. */
  onShield: boolean;
}

/** A stretch of frames where both players were free actors (no combo/stun/grab/down states). */
export interface NeutralSegment {
  startFrame: number;
  endFrame: number;
}

/**
 * One whiffed attack and whether the free punish it offered was taken
 * (see whiffEvents.ts). The opportunity flag is the denominator no
 * conversion stat has: punishes that were AVAILABLE, not just landed.
 */
export interface WhiffEvent {
  /** Slot of the player who whiffed; the other slot had the opportunity. */
  whifferSlot: PlayerSlot;
  startFrame: number;
  /** End of the whiffer's commitment (measured endlag / next commitment). */
  vulnerableEndFrame: number;
  attackLabel: string;
  attackKind: "grounded" | "aerial" | "special" | "grab";
  /** Closest the players got during the vulnerable window. */
  minDistance: number;
  /** In range + observer actionable + enough committed frames to react. */
  opportunity: boolean;
  /** The observer's conversion started within the punish window. */
  punished: boolean;
  /** Frames from whiff start to the observer's first commitment, if any. */
  reactionDelay: number | null;
}

/**
 * One blocked hit on shield, with the measured frame gap and the graded
 * out-of-shield decision (see shieldEvents.ts). A defender's records double
 * as the attacker's shield-pressure quality data.
 */
export interface ShieldBlockRecord {
  defenderSlot: PlayerSlot;
  /** Frame the defender entered shieldstun (GuardSetOff). */
  blockFrame: number;
  attackKind: "grounded" | "aerial" | "special" | "grab" | "projectile";
  /** Human move label ("dair", "fsmash", "special", "projectile"...). */
  attackLabel: string;
  /** First frame the defender left shieldstun. */
  defenderActionableFrame: number | null;
  /** Attacker's measured endlag end (from the attack instance). */
  attackerActionableFrame: number | null;
  /** attackerActionable − defenderActionable; positive = defender advantage. */
  frameGap: number | null;
  /** Attacker grounded and within rough grab reach when defender was actionable. */
  inGrabRange: boolean;
  /** OOS option classification (same vocabulary as habit instances). */
  choice: string | null;
  /**
   * String-final blocks: punish-taken | punish-missed | unsafe-challenge |
   * correct-hold | neutral | unknown. Mid-string blocks: "pressured".
   */
  grade: string;
  /** Pressure-string ordinal for this defender within the game. */
  stringId: number;
  /** Last block of its pressure string (the graded decision point). */
  stringFinal: boolean;
  /** Defender's punish (conversion) started within the window after actionable. */
  punishedAttacker: boolean;
  /** Defender was hit/grabbed within the window after actionable. */
  gotHit: boolean;
}

/**
 * One recovery situation for a player, with the opponent's edgeguard
 * commitment tracked over the same window (see recoveryEvents.ts).
 */
export interface RecoverySpan {
  /** The RECOVERING player's slot; the other slot is the edgeguarder. */
  playerSlot: PlayerSlot;
  startFrame: number;
  endFrame: number;
  startX: number;
  startY: number;
  /** "left-high" | "left-low" | "right-high" | "right-low" — for bucketing similar launches. */
  launchQuadrant: string;
  /** Frame the double jump came out, null if never used in the span. */
  djFrame: number | null;
  /** Double jump burned in the first 20% of the span. */
  djEarly: boolean;
  /** Height when first crossing the ledge plane inward; "low" ≈ sweetspot. */
  route: "high" | "mid" | "low" | null;
  /** Frames from span start to the first special (recovery move) use. */
  upbDelay: number | null;
  airdodgeUsed: boolean;
  landing: "ledge" | "stage" | "death";
  /** Deepest commitment the edgeguarder made during the span. */
  edgeguarderDepth: "onstage" | "ledge" | "shallow" | "deep";
  /** Frames the edgeguarder held ledge intangible during the span. */
  edgeguarderInvincibleLedgeFrames: number;
  /** Edgeguarder left onstage neutral or came within threat range. */
  contested: boolean;
  /** The recovering player took damage during the span. */
  hitDuringRecovery: boolean;
}

export interface GameFrameEvents {
  conversions: ConversionRecord[];
  stocks: StockRecord[];
  habits: HabitInstance[];
  /** Victim-side throw DI records for both players. */
  throwDI: ThrowDIRecord[];
  /** Recovery situations (both players) with edgeguard commitment tracking. */
  recoverySpans: RecoverySpan[];
  /** Blocked hits with measured frame gaps + graded OOS decisions. */
  shieldBlocks: ShieldBlockRecord[];
  /** Whiffed attacks with the punish-opportunity denominator. */
  whiffs: WhiffEvent[];
  /** Attack commitments per slot. Computed, not persisted (Phase 2 consumers). */
  attacks: [AttackInstance[], AttackInstance[]];
  neutralSegments: NeutralSegment[];
}

// ── Small state predicates ────────────────────────────────────────────

function isDamaged(s: number): boolean {
  return (s >= State.DAMAGE_START && s <= State.DAMAGE_END) || s === State.DAMAGE_FALL;
}

function isGrabbed(s: number): boolean {
  return (s >= State.CAPTURE_START && s <= State.CAPTURE_END) || (s >= THROWN_START && s <= THROWN_END);
}

// Shared with measuredDI.ts / recoveryEvents.ts / shieldEvents.ts /
// whiffEvents.ts (type-only imports back this way, no runtime cycle).
export const isDamagedState = isDamaged;
export const isGrabbedState = isGrabbed;
export const isDeadOrRespawningState = (s: number): boolean => isDeadOrRespawning(s);
export const isActionableState = (s: number): boolean => isActionable(s);
export const attackKindOf = (s: number): AttackKind | null => attackKind(s);
export const CLIFF_WAIT_STATE = 253;

/** Human move label for an attack action state ("dair", "fsmash", "special"...). */
export function attackStateLabel(stateId: number): string {
  if (stateId >= 44 && stateId <= 46) return "jab";
  if (stateId === 47) return "rapid jab";
  if (stateId === 50) return "dash attack";
  if (stateId >= 51 && stateId <= 55) return "ftilt";
  if (stateId === 56) return "utilt";
  if (stateId === 57) return "dtilt";
  if (stateId >= 58 && stateId <= 62) return "fsmash";
  if (stateId === 63) return "usmash";
  if (stateId === 64) return "dsmash";
  if (stateId === 65) return "nair";
  if (stateId === 66) return "fair";
  if (stateId === 67) return "bair";
  if (stateId === 68) return "uair";
  if (stateId === 69) return "dair";
  if (stateId >= State.GRAB && stateId <= 222) return "grab";
  if (stateId >= SPECIAL_STATE_START) return "special";
  return "other";
}

/**
 * Where a player's commitment actually ended: the measured endlag end when
 * the tagger resolved it, otherwise the next commitment start (rolled into
 * another attack — Falco pillar shine, Peach float) or the interruption
 * frame (got hit). Falls back to endFrame + 20 as a bound.
 */
export function resolveCommitmentEnd(
  frames: FramesType,
  playerIndex: number,
  instance: AttackInstance,
  lastFrame: number,
): number {
  if (instance.firstActionableFrame != null) return instance.firstActionableFrame;
  for (let f = instance.endFrame + 1; f <= Math.min(instance.endFrame + 60, lastFrame); f++) {
    const s = frames[f]?.players[playerIndex]?.post?.actionStateId;
    if (s == null) continue;
    if (isActionable(s) || attackKind(s) != null) return f;
    if (isDamaged(s) || isGrabbed(s)) return f;
  }
  return Math.min(instance.endFrame + 20, lastFrame);
}

function isDownOrTech(s: number): boolean {
  return s >= State.DOWN_START && s <= 204; // down states 183-198 + tech states 199-204
}

function isDeadOrRespawning(s: number): boolean {
  return (s >= State.DYING_START && s <= State.DYING_END) || s === REBIRTH || s === REBIRTH_WAIT;
}

/** States where the player has control back (used to measure real endlag). */
function isActionable(s: number): boolean {
  return (
    (s >= State.GROUNDED_CONTROL_START && s <= State.CONTROLLED_JUMP_END) || // 14-34
    (s >= State.SQUAT_START && s <= State.SQUAT_END) || // 39-41
    s === State.GUARD_ON ||
    s === 179 // Guard (holding shield)
  );
}

type AttackKind = AttackInstance["kind"];

/** Classify an action state as an attack commitment, or null. */
function attackKind(s: number): AttackKind | null {
  if (s >= State.GROUND_ATTACK_START && s <= State.GROUND_ATTACK_END) return "grounded";
  if (s >= State.AERIAL_ATTACK_START && s <= State.AERIAL_DAIR) return "aerial";
  // Grab family: catch (212/214) through pummel and throws (217-222).
  if (s >= State.GRAB && s <= 222) return "grab";
  if (s >= SPECIAL_STATE_START) return "special";
  return null;
}

// ── Condition capture ─────────────────────────────────────────────────

interface SituationConditions {
  percent: number;
  cornered: boolean;
  pressured: boolean;
}

function captureConditions(
  frames: FramesType,
  frame: number,
  playerIndex: number,
  opponentIndex: number,
  stageId: number,
): SituationConditions {
  const fd = frames[frame];
  const me = fd?.players[playerIndex]?.post;
  const opp = fd?.players[opponentIndex]?.post;
  const percent = me?.percent ?? 0;

  const myX = me?.positionX ?? 0;
  const myY = me?.positionY ?? 0;
  const oppX = opp?.positionX ?? 0;
  const oppY = opp?.positionY ?? 0;

  // Corner: past CORNER_FRACTION of the ledge with the opponent between the
  // player and center (small cross-center margin allowed).
  const ledgeX = STAGE_LEDGE_X[stageId] ?? 80;
  const side = Math.sign(myX) || 1;
  const cornered = Math.abs(myX) > CORNER_FRACTION * ledgeX && side * oppX < Math.abs(myX) && side * oppX > -15;

  const pressured = Math.abs(myX - oppX) <= PRESSURED_DX_UNITS && Math.abs(myY - oppY) <= PRESSURED_DY_UNITS;

  return { percent: Math.round(percent * 100) / 100, cornered, pressured };
}

// ── Habit extraction (knockdown / ledge / OOS state machines) ─────────

interface PendingInstance {
  situation: HabitSituation;
  option: string;
  frame: number;
  conditions: SituationConditions;
}

function extractHabitInstances(
  frames: FramesType,
  lastFrame: number,
  playerIndex: number,
  opponentIndex: number,
  stageId: number,
  playerSlot: PlayerSlot,
): Omit<HabitInstance, "punished">[] {
  const out: Omit<HabitInstance, "punished">[] = [];
  const push = (p: PendingInstance): void => {
    out.push({
      playerSlot,
      situation: p.situation,
      option: p.option,
      frame: p.frame,
      percent: p.conditions.percent,
      cornered: p.conditions.cornered,
      pressured: p.conditions.pressured,
    });
  };

  // Knockdown machine
  let kdActive = false;
  let kdStartFrame = 0;
  let kdConditions: SituationConditions | null = null;

  // Ledge machine
  type LedgePhase = "none" | "hanging" | "jumped" | "dropped";
  let ledgePhase: LedgePhase = "none";
  let ledgeConditions: SituationConditions | null = null;
  let ledgeExitFrame = 0;

  // OOS machine
  type OosPhase = "none" | "stun" | "postStun" | "jumpsquat";
  let oosPhase: OosPhase = "none";
  let oosConditions: SituationConditions | null = null;
  let oosStunEndFrame = 0;
  let oosJumpFrame = 0;

  let prevState = -1;

  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const frame = frames[f];
    const post = frame?.players[playerIndex]?.post;
    if (!post) continue;
    const s = post.actionStateId ?? 0;

    if (isDeadOrRespawning(s)) {
      kdActive = false;
      ledgePhase = "none";
      oosPhase = "none";
      prevState = s;
      continue;
    }

    // ── Knockdown ──────────────────────────────────────────────────
    if (!kdActive) {
      const enteredMissedTech = (s === State.TECH_MISS_UP || s === State.TECH_MISS_DOWN) && !isDownOrTech(prevState);
      const enteredTech =
        (s === State.NEUTRAL_TECH || s === State.FORWARD_TECH || s === State.BACKWARD_TECH) && !isDownOrTech(prevState);

      if (enteredTech) {
        const conditions = captureConditions(frames, f, playerIndex, opponentIndex, stageId);
        const option =
          s === State.NEUTRAL_TECH
            ? "tech in place"
            : s === State.FORWARD_TECH
              ? "tech roll forward"
              : "tech roll backward";
        push({ situation: "knockdown", option, frame: f, conditions });
      } else if (enteredMissedTech) {
        kdActive = true;
        kdStartFrame = f;
        kdConditions = captureConditions(frames, f, playerIndex, opponentIndex, stageId);
      }
    } else if (kdConditions) {
      // Lying down after a missed tech — wait for the getup choice.
      if (s === DOWN_STAND_UP || s === DOWN_STAND_DOWN) {
        push({ situation: "knockdown", option: "getup", frame: f, conditions: kdConditions });
        kdActive = false;
      } else if (s === DOWN_ATTACK_UP || s === DOWN_ATTACK_DOWN) {
        push({ situation: "knockdown", option: "getup attack", frame: f, conditions: kdConditions });
        kdActive = false;
      } else if (s === DOWN_ROLL_FWD_UP || s === DOWN_ROLL_FWD_DOWN) {
        push({ situation: "knockdown", option: "getup roll forward", frame: f, conditions: kdConditions });
        kdActive = false;
      } else if (s === DOWN_ROLL_BACK_UP || s === DOWN_ROLL_BACK_DOWN) {
        push({ situation: "knockdown", option: "getup roll backward", frame: f, conditions: kdConditions });
        kdActive = false;
      } else if (s === State.JAB_RESET_UP || s === State.JAB_RESET_DOWN) {
        // Jab reset re-floors them; the eventual getup is still the choice.
      } else if (isDamaged(s) || isGrabbed(s) || f - kdStartFrame > KNOCKDOWN_TIMEOUT_FRAMES) {
        kdActive = false; // hit before choosing — no choice to record
      } else if (!isDownOrTech(s)) {
        kdActive = false; // left down states some other way (slid off, etc.)
      }
    }

    // ── Ledge ──────────────────────────────────────────────────────
    if (ledgePhase === "none") {
      if (s === State.CLIFF_CATCH && prevState !== State.CLIFF_CATCH && prevState !== CLIFF_WAIT) {
        ledgePhase = "hanging";
        ledgeConditions = captureConditions(frames, f, playerIndex, opponentIndex, stageId);
      }
    } else if (ledgePhase === "hanging" && ledgeConditions) {
      if (s !== State.CLIFF_CATCH && s !== CLIFF_WAIT) {
        if (s === CLIFF_STAND_SLOW || s === CLIFF_STAND_QUICK) {
          push({ situation: "ledge", option: "stand", frame: f, conditions: ledgeConditions });
          ledgePhase = "none";
        } else if (s === CLIFF_ATTACK_SLOW || s === CLIFF_ATTACK_QUICK) {
          push({ situation: "ledge", option: "getup attack", frame: f, conditions: ledgeConditions });
          ledgePhase = "none";
        } else if (s === CLIFF_ROLL_SLOW || s === CLIFF_ROLL_QUICK) {
          push({ situation: "ledge", option: "roll", frame: f, conditions: ledgeConditions });
          ledgePhase = "none";
        } else if (s >= CLIFF_JUMP_START && s <= CLIFF_JUMP_END) {
          ledgePhase = "jumped";
          ledgeExitFrame = f;
        } else if (isDamaged(s) || isGrabbed(s)) {
          ledgePhase = "none"; // hit on the ledge — no choice made
        } else {
          // Dropped (fall/jump/double-jump states) — classify by follow-up.
          ledgePhase = "dropped";
          ledgeExitFrame = f;
        }
      }
    } else if ((ledgePhase === "jumped" || ledgePhase === "dropped") && ledgeConditions) {
      const elapsed = f - ledgeExitFrame;
      if (isDamaged(s) || isGrabbed(s)) {
        ledgePhase = "none";
      } else if (s === State.AIR_DODGE && elapsed <= LEDGE_AIRDODGE_WINDOW) {
        push({ situation: "ledge", option: "ledgedash", frame: f, conditions: ledgeConditions });
        ledgePhase = "none";
      } else if (s >= State.AERIAL_ATTACK_START && s <= State.AERIAL_DAIR && ledgePhase === "dropped") {
        push({ situation: "ledge", option: "drop aerial", frame: f, conditions: ledgeConditions });
        ledgePhase = "none";
      } else if (s === State.CLIFF_CATCH && ledgePhase === "dropped") {
        push({ situation: "ledge", option: "regrab", frame: f, conditions: ledgeConditions });
        ledgePhase = "none";
      } else if (elapsed > (ledgePhase === "jumped" ? OOS_OPTION_WINDOW : LEDGE_FOLLOWUP_WINDOW)) {
        push({
          situation: "ledge",
          option: ledgePhase === "jumped" ? "jump" : "drop",
          frame: ledgeExitFrame,
          conditions: ledgeConditions,
        });
        ledgePhase = "none";
      }
    }

    // ── Out of shield (after blocking a real hit) ──────────────────
    if (oosPhase === "none") {
      if (s === GUARD_SET_OFF && prevState !== GUARD_SET_OFF) {
        // GuardSetOff (181) = shieldstun from a blocked hit. (182 is the
        // shield-raise animation and must never be used as a block signal.)
        oosPhase = "stun";
        oosConditions = captureConditions(frames, f, playerIndex, opponentIndex, stageId);
      }
    } else if (oosConditions) {
      const classifyDirect = (): boolean => {
        if (s === State.ROLL_FORWARD) {
          push({ situation: "oos", option: "roll forward", frame: f, conditions: oosConditions! });
        } else if (s === State.ROLL_BACKWARD) {
          push({ situation: "oos", option: "roll backward", frame: f, conditions: oosConditions! });
        } else if (s === State.SPOT_DODGE) {
          push({ situation: "oos", option: "spot dodge", frame: f, conditions: oosConditions! });
        } else if (s === State.GRAB || s === State.DASH_GRAB) {
          push({ situation: "oos", option: "grab OOS", frame: f, conditions: oosConditions! });
        } else if (s >= State.GROUND_ATTACK_START && s <= State.GROUND_ATTACK_END) {
          push({ situation: "oos", option: "attack OOS", frame: f, conditions: oosConditions! });
        } else if (s === State.ACTION_KNEE_BEND) {
          oosPhase = "jumpsquat";
          oosJumpFrame = f;
          return true; // handled, but not finished
        } else {
          return false;
        }
        oosPhase = "none";
        return true;
      };

      if (oosPhase === "stun") {
        if (s !== GUARD_SET_OFF) {
          oosStunEndFrame = f;
          if (s === State.GUARD_ON || s === GUARD || s === GUARD_REFLECT) {
            oosPhase = "postStun";
          } else if (isDamaged(s) || isGrabbed(s)) {
            oosPhase = "none"; // poked or grabbed in stun — no choice
          } else if (!classifyDirect()) {
            oosPhase = "none"; // left shield into something unclassified
          }
        }
      } else if (oosPhase === "postStun") {
        if (s === GUARD_SET_OFF) {
          oosPhase = "stun"; // multi-hit pressure — same situation continues
        } else if (isDamaged(s) || isGrabbed(s)) {
          oosPhase = "none";
        } else if (s === State.GUARD_ON || s === GUARD || s === GUARD_REFLECT) {
          if (f - oosStunEndFrame > OOS_OPTION_WINDOW) {
            push({ situation: "oos", option: "hold shield", frame: f, conditions: oosConditions });
            oosPhase = "none";
          }
        } else if (!classifyDirect()) {
          // Left shield into movement/wait — dropped shield without a committal option.
          push({ situation: "oos", option: "drop shield", frame: f, conditions: oosConditions });
          oosPhase = "none";
        }
      } else if (oosPhase === "jumpsquat") {
        if (s >= State.AERIAL_ATTACK_START && s <= State.AERIAL_DAIR) {
          push({ situation: "oos", option: "aerial OOS", frame: f, conditions: oosConditions });
          oosPhase = "none";
        } else if (s >= SPECIAL_STATE_START) {
          push({ situation: "oos", option: "special OOS", frame: f, conditions: oosConditions });
          oosPhase = "none";
        } else if (isDamaged(s) || isGrabbed(s)) {
          oosPhase = "none";
        } else if (f - oosJumpFrame > 15) {
          push({ situation: "oos", option: "jump OOS", frame: oosJumpFrame, conditions: oosConditions });
          oosPhase = "none";
        }
      }
    }

    prevState = s;
  }

  return out;
}

// ── Attack instances ──────────────────────────────────────────────────

function extractAttackInstances(
  frames: FramesType,
  lastFrame: number,
  playerIndex: number,
  opponentIndex: number,
  playerSlot: PlayerSlot,
): AttackInstance[] {
  interface Run {
    startFrame: number;
    endFrame: number;
    kind: AttackKind;
    startStateId: number;
  }

  // Collect merged runs of attack states.
  const runs: Run[] = [];
  let current: Run | null = null;
  let gap = 0;

  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const post = frames[f]?.players[playerIndex]?.post;
    if (!post) continue;
    const s = post.actionStateId ?? 0;
    const kind = attackKind(s);

    if (kind) {
      if (current && gap <= ATTACK_MERGE_GAP_FRAMES) {
        current.endFrame = f;
      } else {
        if (current) runs.push(current);
        current = { startFrame: f, endFrame: f, kind, startStateId: s };
      }
      gap = 0;
    } else if (current) {
      gap++;
      if (gap > ATTACK_MERGE_GAP_FRAMES) {
        runs.push(current);
        current = null;
      }
    }
  }
  if (current) runs.push(current);

  // Annotate each run: connected / onShield / measured endlag end.
  return runs.map((run) => {
    let connected = false;
    let sawHitlagField = false;
    let onShield = false;

    for (let f = run.startFrame; f <= Math.min(run.endFrame + 3, lastFrame); f++) {
      const frame = frames[f];
      const mine = frame?.players[playerIndex]?.post;
      const theirs = frame?.players[opponentIndex]?.post;
      if (mine?.hitlagRemaining != null) {
        sawHitlagField = true;
        if (f <= run.endFrame && mine.hitlagRemaining > 0) connected = true;
      }
      const oppState = theirs?.actionStateId ?? -1;
      if (oppState === GUARD_SET_OFF) onShield = true;
      if (
        !sawHitlagField &&
        (isDamaged(oppState) || (oppState >= State.CAPTURE_START && oppState <= State.CAPTURE_END))
      ) {
        // Pre-3.8.0 replays have no hitlagRemaining — fall back to victim reaction.
        connected = true;
      }
    }
    if (onShield) connected = true;

    let firstActionableFrame: number | null = null;
    for (let f = run.endFrame + 1; f <= Math.min(run.endFrame + ACTIONABLE_SCAN_CAP_FRAMES, lastFrame); f++) {
      const s = frames[f]?.players[playerIndex]?.post?.actionStateId;
      if (s == null) continue;
      if (attackKind(s)) break; // rolled into another attack — endlag never resolved
      if (isDamaged(s) || isGrabbed(s) || isDeadOrRespawning(s)) break; // interrupted
      if (isActionable(s)) {
        firstActionableFrame = f;
        break;
      }
    }

    return {
      playerSlot,
      startFrame: run.startFrame,
      endFrame: run.endFrame,
      firstActionableFrame,
      kind: run.kind,
      startStateId: run.startStateId,
      connected,
      onShield,
    };
  });
}

// ── Neutral segments ──────────────────────────────────────────────────

function extractNeutralSegments(
  frames: FramesType,
  lastFrame: number,
  p0Index: number,
  p1Index: number,
  conversions: ConversionType[],
): NeutralSegment[] {
  // Frames inside any conversion window are engagement, not neutral.
  const inConversion = (f: number): boolean =>
    conversions.some((c) => f >= c.startFrame && f <= (c.endFrame ?? c.startFrame + 30));

  const isNeutralState = (s: number): boolean =>
    !isDamaged(s) && !isGrabbed(s) && !isDownOrTech(s) && !isDeadOrRespawning(s) && s !== GUARD_SET_OFF;

  const segments: NeutralSegment[] = [];
  let segStart: number | null = null;

  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const frame = frames[f];
    const s0 = frame?.players[p0Index]?.post?.actionStateId;
    const s1 = frame?.players[p1Index]?.post?.actionStateId;

    const neutral = s0 != null && s1 != null && isNeutralState(s0) && isNeutralState(s1) && !inConversion(f);

    if (neutral) {
      if (segStart == null) segStart = f;
    } else if (segStart != null) {
      if (f - segStart >= NEUTRAL_MIN_SEGMENT_FRAMES) {
        segments.push({ startFrame: segStart, endFrame: f - 1 });
      }
      segStart = null;
    }
  }
  if (segStart != null && lastFrame - segStart >= NEUTRAL_MIN_SEGMENT_FRAMES) {
    segments.push({ startFrame: segStart, endFrame: lastFrame });
  }

  return segments;
}

// ── Conversions / stocks ──────────────────────────────────────────────

function toConversionRecords(conversions: ConversionType[], p0Index: number): ConversionRecord[] {
  return conversions.map((c) => {
    // conversion.playerIndex = victim ⇒ attacker is the other slot.
    const attackerSlot: PlayerSlot = c.playerIndex === p0Index ? 1 : 0;
    const endPercent = c.endPercent ?? c.currentPercent;
    const firstMove = c.moves[0];
    const lastMove = c.moves[c.moves.length - 1];
    return {
      attackerSlot,
      startFrame: c.startFrame,
      endFrame: c.endFrame ?? null,
      startPercent: Math.round(c.startPercent * 100) / 100,
      endPercent: Math.round(endPercent * 100) / 100,
      damage: Math.round((endPercent - c.startPercent) * 100) / 100,
      moveCount: c.moves.length,
      openerMoveId: firstMove ? firstMove.moveId : null,
      lastMoveId: lastMove ? lastMove.moveId : null,
      openingType: c.openingType,
      didKill: c.didKill,
      moves: c.moves.map((m) => ({
        frame: m.frame,
        moveId: m.moveId,
        damage: Math.round(m.damage * 100) / 100,
      })),
    };
  });
}

/**
 * A stock was lost. slippi-js sets endFrame (and deathAnimation, the action
 * state on the stock-loss frame) only when stocksRemaining decrements, so
 * endFrame != null is the death signal. deathAnimation 0 is DeadDown — a
 * bottom blast-zone death — not a sentinel.
 */
export function stockWasLost(stock: Pick<StockType, "endFrame">): boolean {
  return stock.endFrame != null;
}

export function toStockRecords(
  stocks: StockType[],
  conversions: ConversionType[],
  playerIndex: number,
  playerSlot: PlayerSlot,
): StockRecord[] {
  return stocks
    .filter((s) => s.playerIndex === playerIndex)
    .map((stock) => {
      // Kill attribution: a didKill conversion against this player ending on
      // the stock-loss frame (absent for self-destructs).
      let killingConversion: ConversionType | undefined;
      if (stock.endFrame != null) {
        killingConversion = conversions.find(
          (c) =>
            c.playerIndex === playerIndex &&
            c.didKill &&
            c.endFrame != null &&
            Math.abs(c.endFrame - (stock.endFrame ?? 0)) < 10,
        );
      }
      const died = stockWasLost(stock);

      const lastMove =
        killingConversion && killingConversion.moves.length > 0
          ? killingConversion.moves[killingConversion.moves.length - 1]
          : undefined;

      const direction = died && stock.deathAnimation != null ? (getDeathDirection(stock.deathAnimation) ?? null) : null;

      const endPercent = stock.endPercent ?? stock.currentPercent;

      return {
        victimSlot: playerSlot,
        stockNumber: stock.count,
        startFrame: stock.startFrame,
        endFrame: stock.endFrame ?? null,
        startPercent: Math.round(stock.startPercent * 100) / 100,
        deathPercent: died ? Math.round(endPercent * 100) / 100 : null,
        killerMoveId: lastMove ? lastMove.moveId : null,
        deathDirection: direction,
        died,
        verdict: null,
        diScore: null,
        diStickX: null,
        diStickY: null,
        launchAngleDeg: null,
        resourceFault: false,
        finalHitFrame: null,
      };
    });
}

/**
 * Last frame of the punish window for an option that started at `start`:
 * POST_OPTION_PUNISH_FRAMES after the player is actionable again, never
 * shorter than PUNISH_WINDOW_FRAMES from the start. Long options (ledge
 * rolls — slower again at 100%+ — getup rolls, tech rolls) are punished at
 * their END; a fixed 45-frame window from the start closed before a ledge
 * roll finished and made rolls look nearly unpunishable. The end is measured
 * (first actionable frame), not taken from a frame-data table.
 */
function habitPunishWindowEnd(frames: FramesType, playerIndex: number, start: number, lastFrame: number): number {
  let optionEnd: number | null = null;
  for (let f = start + 1; f <= Math.min(start + OPTION_END_SCAN_CAP, lastFrame); f++) {
    const s = frames[f]?.players[playerIndex]?.post?.actionStateId;
    if (s != null && isActionable(s)) {
      optionEnd = f;
      break;
    }
  }
  const end = Math.max(start + PUNISH_WINDOW_FRAMES, (optionEnd ?? start) + POST_OPTION_PUNISH_FRAMES);
  return Math.min(end, lastFrame);
}

/**
 * A defensive option was punished when the player was hit or grabbed between
 * the option's first frame and the end of its punish window (see
 * habitPunishWindowEnd), or a conversion against them started in that window
 * (covers command grabs outside the capture states).
 *
 * Frame-based on purpose: a tech chase or ledge trap usually CONTINUES the
 * conversion that caused the knockdown / offstage situation — slippi-js only
 * starts its 45-frame reset counter once the victim is back in a grounded
 * control state, and teching, lying down and hanging on ledge are not — so
 * "a new conversion started" alone misses most knockdown and ledge punishes.
 */
export function isHabitPunished(
  habit: Pick<HabitInstance, "playerSlot" | "frame">,
  frames: FramesType,
  playerIndex: number,
  conversionRecords: ConversionRecord[],
  lastFrame: number,
): boolean {
  const windowEnd = habitPunishWindowEnd(frames, playerIndex, habit.frame, lastFrame);
  for (let f = habit.frame; f <= windowEnd; f++) {
    const s = frames[f]?.players[playerIndex]?.post?.actionStateId;
    if (s != null && (isDamaged(s) || isGrabbed(s))) return true;
  }
  return conversionRecords.some(
    (c) => c.attackerSlot !== habit.playerSlot && c.startFrame >= habit.frame && c.startFrame <= windowEnd,
  );
}

// ── Entry point ───────────────────────────────────────────────────────

export function extractFrameEvents(
  conversions: ConversionType[],
  stocks: StockType[],
  frames: FramesType,
  lastFrame: number,
  stageId: number,
  p0Index: number,
  p1Index: number,
): GameFrameEvents {
  const conversionRecords = toConversionRecords(conversions, p0Index);

  const stockRecords = [
    ...toStockRecords(stocks, conversions, p0Index, 0),
    ...toStockRecords(stocks, conversions, p1Index, 1),
  ];

  // Measured DI: grade every death from the actual stick input and collect
  // victim-side throw DI records (see measuredDI.ts).
  const verdicts = computeDeathVerdicts(stockRecords, frames, lastFrame, stageId, [p0Index, p1Index]);
  for (const stock of stockRecords) {
    const v = verdicts.get(`${stock.victimSlot}:${stock.stockNumber}`);
    if (v) {
      stock.verdict = v.verdict;
      stock.diScore = v.diScore;
      stock.diStickX = v.diStickX;
      stock.diStickY = v.diStickY;
      stock.launchAngleDeg = v.launchAngleDeg;
      stock.resourceFault = v.resourceFault;
      stock.finalHitFrame = v.finalHitFrame;
    }
  }

  const throwDI = extractThrowDIRecords(frames, lastFrame, [p0Index, p1Index]);

  const recoverySpans = extractRecoverySpans(frames, lastFrame, stageId, [p0Index, p1Index]);

  const rawHabits = [
    ...extractHabitInstances(frames, lastFrame, p0Index, p1Index, stageId, 0),
    ...extractHabitInstances(frames, lastFrame, p1Index, p0Index, stageId, 1),
  ];

  const indexBySlot: [number, number] = [p0Index, p1Index];
  const habits: HabitInstance[] = rawHabits
    .map((h) => ({
      ...h,
      punished: isHabitPunished(h, frames, indexBySlot[h.playerSlot], conversionRecords, lastFrame),
    }))
    .sort((a, b) => a.frame - b.frame);

  const attacks: [AttackInstance[], AttackInstance[]] = [
    extractAttackInstances(frames, lastFrame, p0Index, p1Index, 0),
    extractAttackInstances(frames, lastFrame, p1Index, p0Index, 1),
  ];

  const neutralSegments = extractNeutralSegments(frames, lastFrame, p0Index, p1Index, conversions);

  const shieldBlocks = extractShieldBlocks(frames, lastFrame, [p0Index, p1Index], attacks, conversionRecords);

  const whiffs = extractWhiffEvents(frames, lastFrame, stageId, [p0Index, p1Index], attacks, conversionRecords);

  return {
    conversions: conversionRecords,
    stocks: stockRecords,
    habits,
    throwDI,
    recoverySpans,
    shieldBlocks,
    whiffs,
    attacks,
    neutralSegments,
  };
}
