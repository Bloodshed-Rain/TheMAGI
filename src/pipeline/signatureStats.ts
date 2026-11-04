import { State, Frames, type FramesType, type ConversionType } from "@slippi/slippi-js/node";

import type { CharacterSignatureStats, TurnipPullStats, KenComboStats } from "./types.js";
import { moveIdToName, getMoveName } from "./helpers.js";
import { isDownwardOffstageKill, isOffstageKill } from "./killEvidence.js";

// ── Character signature stat detection ────────────────────────────────
//
// Every counter here is defined by what the replay establishes:
//  - "hit sequence" stats read conversion move lists (slippi-js
//    `lastAttackLanded` ids). They never prove inputs (no wavedash, no
//    multishine timing) — the labels and coaching prompt say so.
//  - kill stats require `didKill` plus the final move id; spike/gimp stats
//    additionally need the victim offstage at the final hit and the death
//    direction (see killEvidence.ts).
//  - frame-based stats (tech-chase grabs, float cancels, gentlemen) read
//    action states directly and document the state ids they rely on.
//  - "fired" projectile counts come from the item stream (distinct spawn ids
//    owned by the player); every other special-move stat counts HITS that
//    connected, because a special that did not land leaves no move record.

/** Check if a conversion's move sequence contains moveId a followed by moveId b (not necessarily adjacent) */
export function hasSequence(moves: ConversionType["moves"], a: number, b: number): boolean {
  const idxA = moves.findIndex((m) => m.moveId === a);
  if (idxA === -1) return false;
  return moves.slice(idxA + 1).some((m) => m.moveId === b);
}

/** Check if a conversion's move sequence contains moveId a immediately followed by moveId b */
export function hasAdjacentSequence(moves: ConversionType["moves"], a: number, b: number): boolean {
  for (let i = 0; i < moves.length - 1; i++) {
    if (moves[i]!.moveId === a && moves[i + 1]!.moveId === b) return true;
  }
  return false;
}

/** Count max consecutive occurrences of a moveId in a conversion */
export function maxConsecutive(moves: ConversionType["moves"], moveId: number): number {
  let max = 0;
  let cur = 0;
  for (const m of moves) {
    if (m.moveId === moveId) {
      cur++;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

/** Check if a conversion's move sequence contains the pattern a → b → c (adjacent) */
export function hasTriplePattern(moves: ConversionType["moves"], a: number, b: number, c: number): boolean {
  for (let i = 0; i < moves.length - 2; i++) {
    if (moves[i]!.moveId === a && moves[i + 1]!.moveId === b && moves[i + 2]!.moveId === c) return true;
  }
  return false;
}

/** Count occurrences of a moveId in a conversion's moves */
export function countMoveId(moves: ConversionType["moves"], moveId: number): number {
  return moves.filter((m) => m.moveId === moveId).length;
}

/** Last move id of a conversion, or null when it has no damaging hit. */
export function lastMoveIdOf(moves: ConversionType["moves"]): number | null {
  return moves[moves.length - 1]?.moveId ?? null;
}

// ── slippi-js move ids (lastAttackLanded) ─────────────────────────────
// Verified against the installed @slippi/slippi-js moves table
// (tests/moveIds.test.ts). Grabs themselves never appear as moves.
export const MOVE_SHINE = 21;
export const MOVE_DOWN_B = 21; // Same as MOVE_SHINE — used by all characters' down-b
export const MOVE_USMASH = 11;
export const MOVE_UAIR = 16;
export const MOVE_DAIR = 17;
export const MOVE_FAIR = 14;
export const MOVE_BAIR = 15;
export const MOVE_GETUP_ATTACK = 50;
export const MOVE_GETUP_ATTACK_SLOW = 51;
export const MOVE_PUMMEL = 52;
export const MOVE_FTHROW = 53;
export const MOVE_BTHROW = 54;
export const MOVE_UTHROW = 55;
export const MOVE_DTHROW = 56;
export const MOVE_LEDGE_ATTACK_SLOW = 61;
export const MOVE_LEDGE_ATTACK = 62;
export const MOVE_NEUTRAL_B = 18;
export const MOVE_FSMASH = 10;
export const MOVE_DSMASH = 12;
export const MOVE_SIDE_B = 19;
export const MOVE_UP_B = 20;
export const MOVE_UTILT = 8;
export const MOVE_DTILT = 9;
export const MOVE_NAIR = 13;
export const MOVE_DASH_ATTACK = 6;

export const THROW_MOVE_IDS: readonly number[] = [MOVE_FTHROW, MOVE_BTHROW, MOVE_UTHROW, MOVE_DTHROW];

export function isThrowMoveId(moveId: number): boolean {
  return THROW_MOVE_IDS.includes(moveId);
}

/** A pummel or throw: the only move records that prove a grab connected. */
export function isGrabFamilyMoveId(moveId: number): boolean {
  return moveId === MOVE_PUMMEL || isThrowMoveId(moveId);
}

export function countThrows(moves: ConversionType["moves"]): number {
  return moves.filter((m) => isThrowMoveId(m.moveId)).length;
}

/** Shine immediately followed by a pummel or throw — the grab is inferred from its follow-up. */
export function hasShineGrab(moves: ConversionType["moves"]): boolean {
  for (let i = 0; i < moves.length - 1; i++) {
    if (moves[i]!.moveId === MOVE_SHINE && isGrabFamilyMoveId(moves[i + 1]!.moveId)) return true;
  }
  return false;
}

// ── Item type ids (replay item stream) ────────────────────────────────
// Verified from imported replays: every Falco laser spawns an item of type
// 55 owned by the Falco port, every Fox laser one of type 54 (see
// docs/melee-accuracy.md).
export const FALCO_LASER_ITEM_ID = 55;
export const FOX_LASER_ITEM_ID = 54;

// ── Character-specific action states ──────────────────────────────────
// Peach (external id 12): 341 Float, 342/343 FloatEnd, 344-348 float
// aerials (nair/fair/bair/uair/dair performed while floating; they return to
// 341 when the float continues). Verified from imported replays: float
// aerials always enter from 341 and land into Landing (42), never into the
// AttackAir landing states 70-74. slippi-js names 349-351 as PEACH_FSMASH1-3,
// which anchors the block.
export const PEACH_FLOAT_AERIAL_START = 344;
export const PEACH_FLOAT_AERIAL_END = 348;
const STATE_LANDING = 42;

/** Victim-side down / tech states (183-204): missed techs, lying down, getups, techs, tech rolls. */
function isDownOrTechState(s: number): boolean {
  return s >= State.DOWN_START && s <= State.TECH_END;
}

function isCaptureState(s: number): boolean {
  return s >= State.CAPTURE_START && s <= State.CAPTURE_END;
}

const TECH_CHASE_LOOKBACK_FRAMES = 20;

/**
 * Grabs that connected on an opponent coming out of a knockdown: the victim
 * enters a grabbed (capture) state within 20 frames of being in a down/tech
 * state. In singles the only possible grabber is this player.
 */
export function countTechChaseGrabs(
  frames: FramesType,
  lastFrame: number,
  victimIndex: number,
  fromFrame: number = Frames.FIRST_PLAYABLE,
): number {
  let count = 0;
  let prev = -1;
  let lastDownFrame = -Infinity;
  for (let f = fromFrame; f <= lastFrame; f++) {
    const s = frames[f]?.players[victimIndex]?.post?.actionStateId;
    if (s == null) continue;
    if (isDownOrTechState(s)) lastDownFrame = f;
    if (isCaptureState(s) && !isCaptureState(prev) && f - lastDownFrame <= TECH_CHASE_LOOKBACK_FRAMES) {
      count++;
    }
    prev = s;
  }
  return count;
}

/** The victim spent a frame in a down/tech state during the conversion's window. */
export function conversionHasTechSituation(conv: ConversionType, frames: FramesType, lastFrame: number): boolean {
  const endF = Math.min(conv.endFrame ?? conv.startFrame + 300, lastFrame);
  for (let f = conv.startFrame; f <= endF; f++) {
    const s = frames[f]?.players[conv.playerIndex]?.post?.actionStateId;
    if (s != null && isDownOrTechState(s)) return true;
  }
  return false;
}

/** Entries into Captain Falcon's third jab (ATTACK_JAB3, 46): the "gentleman". */
export function countGentlemen(frames: FramesType, lastFrame: number, playerIndex: number): number {
  let count = 0;
  let prev = -1;
  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const s = frames[f]?.players[playerIndex]?.post?.actionStateId;
    if (s == null) continue;
    if (s === State.ATTACK_JAB3 && prev !== State.ATTACK_JAB3) count++;
    prev = s;
  }
  return count;
}

export interface PeachFloatCounts {
  /** Aerials started while floating (entries into states 344-348). */
  floatAerials: number;
  /** Float aerials that touched down mid-animation (344-348 → Landing 42): float cancels. */
  floatCancelAerials: number;
}

export function countPeachFloatAerials(frames: FramesType, lastFrame: number, playerIndex: number): PeachFloatCounts {
  let floatAerials = 0;
  let floatCancelAerials = 0;
  let prev = -1;
  const inFloatAerial = (s: number): boolean => s >= PEACH_FLOAT_AERIAL_START && s <= PEACH_FLOAT_AERIAL_END;
  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const s = frames[f]?.players[playerIndex]?.post?.actionStateId;
    if (s == null) continue;
    if (inFloatAerial(s) && !inFloatAerial(prev)) floatAerials++;
    if (s === STATE_LANDING && inFloatAerial(prev)) floatCancelAerials++;
    prev = s;
  }
  return { floatAerials, floatCancelAerials };
}

/** Distinct item spawns of the given types owned by the player (projectiles fired). */
export function countProjectileSpawns(
  frames: FramesType,
  lastFrame: number,
  playerIndex: number,
  typeIds: readonly number[],
): number {
  const seen = new Set<number>();
  let count = 0;
  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const items = frames[f]?.items;
    if (!items) continue;
    for (const item of items) {
      if (item.spawnId == null || seen.has(item.spawnId)) continue;
      seen.add(item.spawnId);
      if (item.owner === playerIndex && item.typeId != null && typeIds.includes(item.typeId)) count++;
    }
  }
  return count;
}

/** Hits that connected per special move, from this player's conversion move lists. */
export interface SpecialHitCounts {
  neutralB: number;
  sideB: number;
  upB: number;
  downB: number;
}

export function countSpecialHits(myConversions: ConversionType[]): SpecialHitCounts {
  const out: SpecialHitCounts = { neutralB: 0, sideB: 0, upB: 0, downB: 0 };
  for (const conv of myConversions) {
    for (const m of conv.moves) {
      if (m.moveId === MOVE_NEUTRAL_B) out.neutralB++;
      else if (m.moveId === MOVE_SIDE_B) out.sideB++;
      else if (m.moveId === MOVE_UP_B) out.upB++;
      else if (m.moveId === MOVE_DOWN_B) out.downB++;
    }
  }
  return out;
}

/** Luigi's Super Jump Punch sweetspot deals 25% fresh; the sourspot deals 1%. */
const LUIGI_SHORYUKEN_MIN_DAMAGE = 8;

export interface SignatureStatInput {
  character: string;
  playerIndex: number;
  opponentIndex: number;
  myConversions: ConversionType[];
  specialHits: SpecialHitCounts;
  turnipPullStats: TurnipPullStats | null;
  kenComboStats: KenComboStats | null;
  frames: FramesType;
  lastFrame: number;
  stageId: number;
}

export function detectSignatureStats(input: SignatureStatInput): CharacterSignatureStats | null {
  const {
    character,
    playerIndex,
    opponentIndex,
    myConversions,
    specialHits,
    turnipPullStats,
    kenComboStats,
    frames,
    lastFrame,
    stageId,
  } = input;

  const killsEndingWith = (moveId: number): number =>
    myConversions.filter((c) => c.didKill && lastMoveIdOf(c.moves) === moveId).length;
  const spikeKillsWith = (moveId: number): number =>
    myConversions.filter((c) => isDownwardOffstageKill(c, frames, stageId, moveId)).length;

  switch (character) {
    case "Fox": {
      let multiShineCombos = 0;
      let waveshineToUpsmash = 0;
      let upthrowUpairs = 0;
      let upthrowUpairKills = 0;
      let drillShines = 0;
      let shineSpikeKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        // Multi-shine combos: shine connected 2+ times in a conversion
        if (countMoveId(moves, MOVE_SHINE) >= 2) multiShineCombos++;
        // Shine immediately followed by up smash (the wavedash between them is not verified)
        if (hasAdjacentSequence(moves, MOVE_SHINE, MOVE_USMASH)) waveshineToUpsmash++;
        // Up throw followed by up air later in the same conversion
        if (hasSequence(moves, MOVE_UTHROW, MOVE_UAIR)) {
          upthrowUpairs++;
          if (conv.didKill && lastMoveIdOf(moves) === MOVE_UAIR) upthrowUpairKills++;
        }
        // Drill (dair) → shine
        if (hasAdjacentSequence(moves, MOVE_DAIR, MOVE_SHINE)) drillShines++;
        // Shine spike: shine was the final hit, landed offstage, and the victim did not die off the top
        if (lastMoveIdOf(moves) === MOVE_SHINE && isOffstageKill(conv, frames, stageId)) shineSpikeKills++;
      }

      return {
        character: "Fox",
        multiShineCombos,
        waveshineToUpsmash,
        upthrowUpairs,
        upthrowUpairKills,
        drillShines,
        shineSpikeKills,
        laserCount: countProjectileSpawns(frames, lastFrame, playerIndex, [FOX_LASER_ITEM_ID]),
      };
    }

    case "Falco": {
      let pillarCombos = 0;
      let pillarKills = 0;
      let shineGrabs = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        // Pillar: dair → shine → dair
        if (hasTriplePattern(moves, MOVE_DAIR, MOVE_SHINE, MOVE_DAIR)) {
          pillarCombos++;
          if (conv.didKill) pillarKills++;
        }
        // Shine → grab, evidenced by the pummel/throw that follows the shine
        if (hasShineGrab(moves)) shineGrabs++;
      }

      return {
        character: "Falco",
        pillarCombos,
        pillarKills,
        shineGrabs,
        laserCount: countProjectileSpawns(frames, lastFrame, playerIndex, [FALCO_LASER_ITEM_ID]),
      };
    }

    case "Sheik": {
      let techChases = 0;
      let techChaseKills = 0;
      let needleHits = 0;
      let fairChains = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        needleHits += countMoveId(moves, MOVE_NEUTRAL_B);
        if (maxConsecutive(moves, MOVE_FAIR) >= 3) fairChains++;

        // Tech chase: a down/forward throw in the conversion, the victim hit a
        // down/tech state inside it, and at least three hits landed.
        const hasThrow = moves.some((m) => m.moveId === MOVE_DTHROW || m.moveId === MOVE_FTHROW);
        if (!hasThrow || moves.length < 3) continue;
        if (conversionHasTechSituation(conv, frames, lastFrame)) {
          techChases++;
          if (conv.didKill) techChaseKills++;
        }
      }

      return { character: "Sheik", techChases, techChaseKills, needleHits, fairChains };
    }

    case "Falcon": {
      let kneeKills = 0;
      let stompKnees = 0;
      let upthrowKnees = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = lastMoveIdOf(moves);
        // Knee kills: conversion ending with fair that killed
        if (lastMove === MOVE_FAIR && conv.didKill) kneeKills++;
        // Stomp immediately followed by knee
        if (hasAdjacentSequence(moves, MOVE_DAIR, MOVE_FAIR)) stompKnees++;
        // Up throw somewhere in the conversion, knee took the stock
        if (moves.some((m) => m.moveId === MOVE_UTHROW) && lastMove === MOVE_FAIR && conv.didKill) upthrowKnees++;
      }

      return {
        character: "Falcon",
        kneeKills,
        stompKnees,
        upthrowKnees,
        techChaseGrabs: countTechChaseGrabs(frames, lastFrame, opponentIndex),
        gentlemanCount: countGentlemen(frames, lastFrame, playerIndex),
      };
    }

    case "Puff": {
      let restKills = 0;
      let restAttempts = 0;
      let bairStrings = 0;
      let longestBairString = 0;
      const restSetupMap = new Map<string, number>();

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;

        // Rest that connected (down b in the conversion); a kill needs rest as the final hit
        if (moves.some((m) => m.moveId === MOVE_DOWN_B)) {
          restAttempts++;
          if (lastMoveIdOf(moves) === MOVE_DOWN_B && conv.didKill) restKills++;
        }
        for (let i = 0; i < moves.length; i++) {
          if (moves[i]!.moveId === MOVE_DOWN_B && i > 0) {
            const setupMove = moveIdToName[moves[i - 1]!.moveId] ?? getMoveName(moves[i - 1]!.moveId);
            restSetupMap.set(setupMove, (restSetupMap.get(setupMove) ?? 0) + 1);
          }
        }
        const maxBairs = maxConsecutive(moves, MOVE_BAIR);
        if (maxBairs >= 3) bairStrings++;
        if (maxBairs > longestBairString) longestBairString = maxBairs;
      }

      const restSetups = [...restSetupMap.entries()]
        .map(([move, count]) => ({ move, count }))
        .sort((a, b) => b.count - a.count);

      return { character: "Puff", restKills, restAttempts, bairStrings, longestBairString, restSetups };
    }

    case "ICs": {
      let wobbles = 0;
      let wobbleKills = 0;

      for (const conv of myConversions) {
        // Extended grab: 8+ pummel records in one conversion (Nana's hits
        // during a wobble are attributed to Popo's pummel).
        if (countMoveId(conv.moves, MOVE_PUMMEL) >= 8) {
          wobbles++;
          if (conv.didKill) wobbleKills++;
        }
      }

      // Desync heuristic: Nana attacking while Popo is not in the same attack.
      let desyncs = 0;
      let inDesync = false;

      for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
        const frame = frames[f];
        if (!frame) continue;
        const popo = frame.players[playerIndex]?.post;
        const nana = frame.followers?.[playerIndex]?.post;
        if (!popo || !nana) continue;
        if ((nana.stocksRemaining ?? 0) <= 0) continue;

        const popoState = popo.actionStateId ?? 0;
        const nanaState = nana.actionStateId ?? 0;

        const isAttack = (s: number): boolean =>
          (s >= State.GROUND_ATTACK_START && s <= State.GROUND_ATTACK_END) ||
          (s >= State.AERIAL_ATTACK_START && s <= State.AERIAL_DAIR) ||
          s === State.GRAB ||
          s === State.DASH_GRAB;

        const isDesync = isAttack(nanaState) && (!isAttack(popoState) || Math.abs(popoState - nanaState) > 2);

        if (isDesync && !inDesync) {
          desyncs++;
          inDesync = true;
        } else if (!isDesync) {
          inDesync = false;
        }
      }

      // Sopo kills: kills while Nana is dead
      let sopoKills = 0;
      for (const conv of myConversions) {
        if (!conv.didKill) continue;
        const nana = frames[conv.startFrame]?.followers?.[playerIndex]?.post;
        if (!nana || (nana.stocksRemaining ?? 0) <= 0) sopoKills++;
      }

      // Nana deaths: count how many times Nana lost a stock
      let nanaDeaths = 0;
      let prevNanaStocks = 4;
      for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
        const nana = frames[f]?.followers?.[playerIndex]?.post;
        if (!nana) continue;
        const nanaStocks = nana.stocksRemaining ?? prevNanaStocks;
        if (nanaStocks < prevNanaStocks) nanaDeaths += prevNanaStocks - nanaStocks;
        prevNanaStocks = nanaStocks;
      }

      return { character: "ICs", wobbles, wobbleKills, desyncs, sopoKills, nanaDeaths };
    }

    case "Marth": {
      const kenCombos = kenComboStats?.total ?? 0;
      let chainGrabs = 0;
      let fsmashKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        // Chain grabs: 2+ throws (pummels are not throws) in one conversion
        if (countThrows(moves) >= 2) chainGrabs++;
        if (lastMoveIdOf(moves) === MOVE_FSMASH && conv.didKill) fsmashKills++;
      }

      return { character: "Marth", kenCombos, chainGrabs, fsmashKills };
    }

    case "Peach": {
      const dsmashKills = killsEndingWith(MOVE_DSMASH);
      const stitchFaces = turnipPullStats?.faces.find((f) => f.face === "stitch face")?.count ?? 0;
      const floats = countPeachFloatAerials(frames, lastFrame, playerIndex);

      return {
        character: "Peach",
        turnipPulls: turnipPullStats?.totalPulls ?? 0,
        turnipHits: turnipPullStats?.turnipsHit ?? 0,
        stitchFaces,
        dsmashKills,
        floatAerials: floats.floatAerials,
        floatCancelAerials: floats.floatCancelAerials,
      };
    }

    case "Samus": {
      return {
        character: "Samus",
        chargeShotKills: killsEndingWith(MOVE_NEUTRAL_B),
        missileCount: specialHits.sideB,
        upBKills: killsEndingWith(MOVE_UP_B),
        dairKills: killsEndingWith(MOVE_DAIR),
      };
    }

    case "Pikachu": {
      let upairChains = 0;
      let nairCombos = 0;
      for (const conv of myConversions) {
        if (maxConsecutive(conv.moves, MOVE_UAIR) >= 3) upairChains++;
        if (countMoveId(conv.moves, MOVE_NAIR) >= 2) nairCombos++;
      }
      return {
        character: "Pikachu",
        thunderKills: killsEndingWith(MOVE_DOWN_B),
        upSmashKills: killsEndingWith(MOVE_USMASH),
        upairChains,
        nairCombos,
      };
    }

    case "Luigi": {
      const shoryukenKills = myConversions.filter((c) => {
        const last = c.moves[c.moves.length - 1];
        return c.didKill && last?.moveId === MOVE_UP_B && last.damage >= LUIGI_SHORYUKEN_MIN_DAMAGE;
      }).length;
      return {
        character: "Luigi",
        shoryukenKills,
        dairKills: killsEndingWith(MOVE_DAIR),
        downSmashKills: killsEndingWith(MOVE_DSMASH),
        fireBallCount: specialHits.neutralB,
      };
    }

    case "Mario": {
      return {
        character: "Mario",
        capeCount: specialHits.sideB,
        fireBallCount: specialHits.neutralB,
        fsmashKills: killsEndingWith(MOVE_FSMASH),
        upSmashKills: killsEndingWith(MOVE_USMASH),
        fairSpikeKills: spikeKillsWith(MOVE_FAIR),
      };
    }

    case "Doc": {
      return {
        character: "Doc",
        pillCount: specialHits.neutralB,
        fsmashKills: killsEndingWith(MOVE_FSMASH),
        upBKills: killsEndingWith(MOVE_UP_B),
        dairKills: killsEndingWith(MOVE_DAIR),
        fairKills: killsEndingWith(MOVE_FAIR),
      };
    }

    case "Yoshi": {
      return {
        character: "Yoshi",
        eggThrowCount: specialHits.upB,
        dairKills: killsEndingWith(MOVE_DAIR),
        upSmashKills: killsEndingWith(MOVE_USMASH),
        fairSpikeKills: spikeKillsWith(MOVE_FAIR),
      };
    }

    case "Ganon": {
      return {
        character: "Ganon",
        stompKills: killsEndingWith(MOVE_DAIR),
        sideBKills: killsEndingWith(MOVE_SIDE_B),
        upTiltKills: killsEndingWith(MOVE_UTILT),
        fairKills: killsEndingWith(MOVE_FAIR),
      };
    }

    case "Link": {
      let grabCombos = 0;
      for (const conv of myConversions) {
        const first = conv.moves[0];
        // Grab combos: the conversion opened with a pummel/throw and reached 3+ hits
        if (first && isGrabFamilyMoveId(first.moveId) && conv.moves.length >= 3) grabCombos++;
      }
      return {
        character: "Link",
        boomerangCount: specialHits.sideB,
        bombCount: specialHits.downB,
        dairSpikeKills: spikeKillsWith(MOVE_DAIR),
        upSmashKills: killsEndingWith(MOVE_USMASH),
        grabCombos,
      };
    }

    case "YLink": {
      let nairCombos = 0;
      for (const conv of myConversions) {
        if (countMoveId(conv.moves, MOVE_NAIR) >= 2) nairCombos++;
      }
      return {
        character: "YLink",
        fireArrowCount: specialHits.neutralB,
        bombCount: specialHits.downB,
        dairSpikeKills: spikeKillsWith(MOVE_DAIR),
        nairCombos,
      };
    }

    case "Zelda": {
      return {
        character: "Zelda",
        lightningKickKills: killsEndingWith(MOVE_FAIR) + killsEndingWith(MOVE_BAIR),
        dinsFireCount: specialHits.sideB,
        upBKills: killsEndingWith(MOVE_UP_B),
      };
    }

    case "Roy": {
      let chainGrabs = 0;
      let dtiltConversions = 0;
      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        if (countThrows(moves) >= 2) chainGrabs++;
        if (moves[0]!.moveId === MOVE_DTILT && moves.length >= 2) dtiltConversions++;
      }
      return {
        character: "Roy",
        fsmashKills: killsEndingWith(MOVE_FSMASH),
        blazerKills: killsEndingWith(MOVE_UP_B),
        counterCount: specialHits.downB,
        chainGrabs,
        dtiltConversions,
      };
    }

    case "Mewtwo": {
      return {
        character: "Mewtwo",
        shadowBallCount: specialHits.neutralB,
        confusionCount: specialHits.sideB,
        upThrowKills: killsEndingWith(MOVE_UTHROW),
        fairKills: killsEndingWith(MOVE_FAIR),
      };
    }

    case "G&W": {
      return {
        character: "G&W",
        judgementCount: specialHits.sideB,
        judgementKills: killsEndingWith(MOVE_SIDE_B),
        upAirKills: killsEndingWith(MOVE_UAIR),
        baconCount: specialHits.neutralB,
      };
    }

    case "Ness": {
      return {
        character: "Ness",
        pkFireCount: specialHits.sideB,
        backThrowKills: killsEndingWith(MOVE_BTHROW),
        dairKills: killsEndingWith(MOVE_DAIR),
        fairKills: killsEndingWith(MOVE_FAIR),
      };
    }

    case "Bowser": {
      return {
        character: "Bowser",
        flameCount: specialHits.neutralB,
        koopaClaw: specialHits.sideB,
        upBKills: killsEndingWith(MOVE_UP_B),
        fsmashKills: killsEndingWith(MOVE_FSMASH),
      };
    }

    case "Kirby": {
      let dairCombos = 0;
      for (const conv of myConversions) {
        if (maxConsecutive(conv.moves, MOVE_DAIR) >= 3) dairCombos++;
      }
      return {
        character: "Kirby",
        inhaleCount: specialHits.neutralB,
        upTiltKills: killsEndingWith(MOVE_UTILT),
        fsmashKills: killsEndingWith(MOVE_FSMASH),
        dairCombos,
        stoneKills: killsEndingWith(MOVE_DOWN_B),
      };
    }

    case "DK": {
      return {
        character: "DK",
        giantPunchKills: killsEndingWith(MOVE_NEUTRAL_B),
        headbuttCount: specialHits.sideB,
        spikeKills: spikeKillsWith(MOVE_FAIR),
        bairKills: killsEndingWith(MOVE_BAIR),
      };
    }

    case "Pichu": {
      let nairCombos = 0;
      for (const conv of myConversions) {
        if (countMoveId(conv.moves, MOVE_NAIR) >= 2) nairCombos++;
      }
      return {
        character: "Pichu",
        thunderJoltCount: specialHits.neutralB,
        thunderKills: killsEndingWith(MOVE_DOWN_B),
        upSmashKills: killsEndingWith(MOVE_USMASH),
        nairCombos,
      };
    }

    default:
      return null;
  }
}
