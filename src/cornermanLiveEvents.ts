import { isKenCombo } from "./kenCombo";
import { State, type ConversionType, type FramesType, type ItemUpdateType } from "@slippi/slippi-js/node";

import { frameToTimestamp, getMoveName, isOffstage, moveIdToName, SHIELD_BREAK_FLY } from "./pipeline/helpers";
import {
  countMoveId,
  hasAdjacentSequence,
  hasSequence,
  hasTriplePattern,
  maxConsecutive,
  MOVE_BAIR,
  MOVE_BTHROW,
  MOVE_DAIR,
  MOVE_DSMASH,
  MOVE_FAIR,
  MOVE_FSMASH,
  MOVE_FTHROW,
  MOVE_GRAB,
  MOVE_SHINE,
  MOVE_DTHROW,
  MOVE_NEUTRAL_B,
  MOVE_PUMMEL,
  MOVE_SIDE_B,
  MOVE_UAIR,
  MOVE_UP_B,
  MOVE_UTHROW,
  MOVE_USMASH,
} from "./pipeline/signatureStats";
import {
  PEACH_RARE_ITEMS,
  STITCH_FACE_ID,
  TURNIP_TYPE_ID,
  markObservedItemInstances,
  observeItemInstance,
} from "./peachItems";

export type CornermanLiveEventType =
  | "ken-combo"
  | "stitch-face"
  | "rare-item"
  | "waveshine"
  | "high-combo-kill"
  | "huge-conversion"
  | "zero-to-death"
  | "early-kill"
  | "edgeguard-kill"
  | "spike-kill"
  | "shield-break"
  | "self-destruct"
  | "shine-spike"
  | "upthrow-upair"
  | "drill-shine"
  | "pillar-combo"
  | "shine-grab"
  | "chain-grab"
  | "fsmash-kill"
  | "stomp-knee"
  | "knee-kill"
  | "tech-chase"
  | "fair-gimp"
  | "rest-kill"
  | "bair-string"
  | "dsmash-kill"
  | "wobble"
  | "charge-shot"
  | "up-b-kill"
  | "thunder-kill"
  | "upair-chain"
  | "upsmash-kill"
  | "shoryuken"
  | "ganon-stomp"
  | "ganon-side-b"
  | "cape-gimp";

export interface CornermanLivePlayer {
  playerIndex: number;
  tag: string;
  connectCode: string;
  character: string;
  isTarget: boolean;
}

export interface CornermanLiveEvent {
  id: string;
  type: CornermanLiveEventType;
  title: string;
  body: string;
  timestamp: string;
  frame: number;
  actorTag: string;
  actorCharacter: string;
  actorIsTarget: boolean;
  victimTag: string | null;
  victimCharacter: string | null;
  victimIsTarget: boolean | null;
  importance: "info" | "high";
}

export const HIGH_COMBO_KILL_DAMAGE = 50;
export const HIGH_COMBO_KILL_HITS = 5;
export const HUGE_CONVERSION_DAMAGE = 60;
export { markObservedItemInstances };

interface CandidateEvent extends CornermanLiveEvent {
  priority: number;
}

function moveName(id: number): string {
  return moveIdToName[id] ?? getMoveName(id);
}

function moveNames(moves: ConversionType["moves"]): string[] {
  return moves.map((m) => moveName(m.moveId));
}

function conversionDamage(conversion: ConversionType): number {
  return Math.round((conversion.endPercent ?? conversion.currentPercent) - conversion.startPercent);
}

function shortActor(player: CornermanLivePlayer): string {
  if (player.isTarget) return "You";
  return player.tag || player.character;
}

function describeSequence(names: string[]): string {
  if (names.length <= 5) return names.join(" -> ");
  return `${names.slice(0, 4).join(" -> ")} -> ... -> ${names[names.length - 1]}`;
}

function eventKey(type: CornermanLiveEventType, actorIndex: number, eventFrame: number, startFrame: number): string {
  return `${type}:${actorIndex}:${eventFrame}:${startFrame}`;
}

function findActorAndVictim(
  players: CornermanLivePlayer[],
  victimIndex: number,
): { actor: CornermanLivePlayer; victim: CornermanLivePlayer } | null {
  const victim = players.find((p) => p.playerIndex === victimIndex);
  const actor = players.find((p) => p.playerIndex !== victimIndex);
  if (!actor || !victim) return null;
  return { actor, victim };
}

function pushOnce(events: CornermanLiveEvent[], seenKeys: Set<string>, event: CornermanLiveEvent): void {
  if (seenKeys.has(event.id)) return;
  seenKeys.add(event.id);
  events.push(event);
}

function lastMoveId(conversion: ConversionType): number | null {
  return conversion.moves[conversion.moves.length - 1]?.moveId ?? null;
}

function throwCount(conversion: ConversionType): number {
  const throwIds = [MOVE_FTHROW, MOVE_UTHROW, MOVE_DTHROW, MOVE_BTHROW];
  return conversion.moves.filter((m) => throwIds.includes(m.moveId)).length;
}

function victimOffstageAtEnd(
  conversion: ConversionType,
  frames: FramesType | undefined,
  stageId: number | undefined,
): boolean {
  if (!frames || stageId == null || conversion.endFrame == null) return false;
  const victimPost = frames[conversion.endFrame]?.players[conversion.playerIndex]?.post;
  if (!victimPost) return false;
  return isOffstage(victimPost.positionX ?? 0, victimPost.positionY ?? 0, stageId);
}

function makeConversionEvent({
  type,
  title,
  body,
  priority,
  importance,
  actor,
  victim,
  conversion,
}: {
  type: CornermanLiveEventType;
  title: string;
  body: string;
  priority: number;
  importance: "info" | "high";
  actor: CornermanLivePlayer;
  victim: CornermanLivePlayer;
  conversion: ConversionType;
}): CandidateEvent {
  const eventFrame = conversion.endFrame ?? conversion.startFrame;
  return {
    id: eventKey(type, actor.playerIndex, eventFrame, conversion.startFrame),
    type,
    title,
    body,
    timestamp: frameToTimestamp(conversion.startFrame),
    frame: eventFrame,
    actorTag: actor.tag,
    actorCharacter: actor.character,
    actorIsTarget: actor.isTarget,
    victimTag: victim.tag,
    victimCharacter: victim.character,
    victimIsTarget: victim.isTarget,
    importance,
    priority,
  };
}

export function detectLiveConversionEvents({
  conversions,
  players,
  seenKeys,
  frames,
  stageId,
  minEventFrame = Number.NEGATIVE_INFINITY,
  allowOpenConversions = false,
}: {
  conversions: ConversionType[];
  players: CornermanLivePlayer[];
  seenKeys: Set<string>;
  frames?: FramesType;
  stageId?: number | undefined;
  minEventFrame?: number;
  /** Emit conversions that never closed — pass true once the game has ended,
   *  when their endFrame (and thus the dedup key) can no longer change. */
  allowOpenConversions?: boolean;
}): CornermanLiveEvent[] {
  const events: CornermanLiveEvent[] = [];

  for (const conversion of conversions) {
    if (conversion.moves.length === 0) continue;

    // Skip conversions still in progress: their endFrame (part of the dedup
    // key) changes when they close, which would re-emit the same alert with a
    // new id — and the damage total isn't final yet anyway. They close at most
    // 45 frames (~0.75s) after the last hit, so the alert is barely delayed.
    if (conversion.endFrame == null && !conversion.didKill && !allowOpenConversions) continue;

    const eventFrame = conversion.endFrame ?? conversion.startFrame;
    if (eventFrame < minEventFrame) continue;

    const match = findActorAndVictim(players, conversion.playerIndex);
    if (!match) continue;

    const { actor, victim } = match;
    const damage = conversionDamage(conversion);
    const names = moveNames(conversion.moves);
    const actorName = shortActor(actor);
    const victimName = shortActor(victim);
    const startedAt = frameToTimestamp(conversion.startFrame);
    const startPercent = Math.round(conversion.startPercent);
    const killed = conversion.didKill ? " kill" : "";
    const offstageKill = conversion.didKill && victimOffstageAtEnd(conversion, frames, stageId);
    const last = lastMoveId(conversion);
    const addCandidate = (
      candidate: Omit<Parameters<typeof makeConversionEvent>[0], "actor" | "victim" | "conversion">,
    ) => {
      candidates.push(makeConversionEvent({ ...candidate, actor, victim, conversion }));
    };

    const candidates: CandidateEvent[] = [];

    if (actor.character === "Marth" && isKenCombo(conversion.moves, conversion.didKill)) {
      addCandidate({
        type: "ken-combo",
        title: "Ken Combo",
        body: `${actorName} hit ${victimName}: ${describeSequence(names)}, ${damage}% from ${startPercent}%.`,
        importance: "high",
        priority: 120,
      });
    }

    if (actor.character === "Fox") {
      const shineCount = countMoveId(conversion.moves, MOVE_SHINE);
      const endedWithUpsmash = hasSequence(conversion.moves, MOVE_SHINE, MOVE_USMASH);
      if (conversion.didKill && last === MOVE_SHINE && offstageKill) {
        addCandidate({
          type: "shine-spike",
          title: "Shine Spike",
          body: `${actorName} shined ${victimName} offstage at ${startPercent}%.`,
          importance: "high",
          priority: 122,
        });
      }
      if (shineCount >= 2 || endedWithUpsmash) {
        addCandidate({
          type: "waveshine",
          title: endedWithUpsmash ? `Shine → Up Smash${killed}` : `Multiple Shine Hits${killed}`,
          body: `${actorName} hit ${victimName}: ${shineCount} shine${shineCount === 1 ? "" : "s"}, ${damage}% from ${startPercent}%.`,
          importance: conversion.didKill || endedWithUpsmash ? "high" : "info",
          priority: endedWithUpsmash || conversion.didKill ? 112 : 78,
        });
      }
      if (conversion.didKill && hasSequence(conversion.moves, MOVE_UTHROW, MOVE_UAIR)) {
        addCandidate({
          type: "upthrow-upair",
          title: "Upthrow Upair Kill",
          body: `${actorName} closed it with upthrow -> upair at ${startPercent}%.`,
          importance: "high",
          priority: 104,
        });
      }
      if (hasAdjacentSequence(conversion.moves, MOVE_DAIR, MOVE_SHINE) && damage >= 20) {
        addCandidate({
          type: "drill-shine",
          title: "Drill Shine",
          body: `${actorName} started drill -> shine for ${damage}% at ${startedAt}.`,
          importance: conversion.didKill ? "high" : "info",
          priority: conversion.didKill ? 98 : 62,
        });
      }
    }

    if (actor.character === "Falco") {
      if (hasTriplePattern(conversion.moves, MOVE_DAIR, MOVE_SHINE, MOVE_DAIR)) {
        addCandidate({
          type: "pillar-combo",
          title: conversion.didKill ? "Pillar Kill" : "Pillar Combo",
          body: `${actorName} hit a pillar sequence for ${damage}% from ${startPercent}%.`,
          importance: conversion.didKill ? "high" : "info",
          priority: conversion.didKill ? 108 : 76,
        });
      }
      if (hasAdjacentSequence(conversion.moves, MOVE_SHINE, MOVE_GRAB)) {
        addCandidate({
          type: "shine-grab",
          title: "Shine Grab",
          body: `${actorName} converted shine -> grab at ${startedAt}.`,
          importance: "info",
          priority: 58,
        });
      }
      if (conversion.didKill && last === MOVE_SHINE && offstageKill) {
        addCandidate({
          type: "shine-spike",
          title: "Shine Spike",
          body: `${actorName} shined ${victimName} offstage at ${startPercent}%.`,
          importance: "high",
          priority: 121,
        });
      }
    }

    if (actor.character === "Marth") {
      if (throwCount(conversion) >= 2) {
        addCandidate({
          type: "chain-grab",
          title: conversion.didKill ? "Chain Grab Kill" : "Chain Grab",
          body: `${actorName} chained ${throwCount(conversion)} throws for ${damage}%.`,
          importance: conversion.didKill ? "high" : "info",
          priority: conversion.didKill ? 106 : 70,
        });
      }
      if (conversion.didKill && last === MOVE_FSMASH) {
        addCandidate({
          type: "fsmash-kill",
          title: "F-Smash Kill",
          body: `${actorName} killed ${victimName} with fsmash at ${startPercent}%.`,
          importance: "high",
          priority: 92,
        });
      }
    }

    if (actor.character === "Falcon") {
      if (conversion.didKill && hasSequence(conversion.moves, MOVE_DAIR, MOVE_FAIR)) {
        addCandidate({
          type: "stomp-knee",
          title: "Stomp Knee",
          body: `${actorName} hit stomp -> knee for the kill at ${startPercent}%.`,
          importance: "high",
          priority: 116,
        });
      } else if (conversion.didKill && last === MOVE_FAIR) {
        addCandidate({
          type: "knee-kill",
          title: "Knee Kill",
          body: `${actorName} killed ${victimName} with knee at ${startPercent}%.`,
          importance: "high",
          priority: 88,
        });
      }
    }

    if (actor.character === "Sheik") {
      const startsThrow = [MOVE_DTHROW, MOVE_FTHROW, MOVE_UTHROW].includes(conversion.moves[0]?.moveId ?? -1);
      if (startsThrow && conversion.moves.length >= 3) {
        addCandidate({
          type: "tech-chase",
          title: conversion.didKill ? "Tech Chase Kill" : "Tech Chase",
          body: `${actorName} got ${conversion.moves.length} hits from a throw for ${damage}%.`,
          importance: conversion.didKill ? "high" : "info",
          priority: conversion.didKill ? 102 : 66,
        });
      }
      if (conversion.didKill && last === MOVE_FAIR && (offstageKill || startPercent < 70)) {
        addCandidate({
          type: "fair-gimp",
          title: "Fair Gimp",
          body: `${actorName} cleaned up ${victimName} with fair at ${startPercent}%.`,
          importance: "high",
          priority: 110,
        });
      }
    }

    if (actor.character === "Puff" || actor.character === "Jigglypuff") {
      if (conversion.didKill && conversion.moves.some((m) => m.moveId === MOVE_SHINE)) {
        const restIndex = conversion.moves.findIndex((m) => m.moveId === MOVE_SHINE);
        const setup = restIndex > 0 ? moveName(conversion.moves[restIndex - 1]!.moveId) : "raw";
        addCandidate({
          type: "rest-kill",
          title: "Rest Kill",
          body: `${actorName} hit ${setup} -> rest at ${startPercent}%.`,
          importance: "high",
          priority: 120,
        });
      }
      const bairs = maxConsecutive(conversion.moves, MOVE_BAIR);
      if (bairs >= 3) {
        addCandidate({
          type: "bair-string",
          title: "Bair String",
          body: `${actorName} strung ${bairs} bairs for ${damage}%.`,
          importance: conversion.didKill ? "high" : "info",
          priority: conversion.didKill ? 96 : 64,
        });
      }
    }

    if (actor.character === "Peach") {
      if (conversion.didKill && last === MOVE_DSMASH) {
        addCandidate({
          type: "dsmash-kill",
          title: "Downsmash Kill",
          body: `${actorName} killed ${victimName} with downsmash at ${startPercent}%.`,
          importance: "high",
          priority: 92,
        });
      } else if (countMoveId(conversion.moves, MOVE_DSMASH) > 0 && damage >= 40) {
        addCandidate({
          type: "dsmash-kill",
          title: "Downsmash Blender",
          body: `${actorName} got ${damage}% from downsmash at ${startedAt}.`,
          importance: "info",
          priority: 60,
        });
      }
    }

    if (actor.character === "ICs" || actor.character === "Ice Climbers") {
      const pummels = countMoveId(conversion.moves, MOVE_PUMMEL);
      if (pummels >= 8) {
        addCandidate({
          type: "wobble",
          title: conversion.didKill ? "Wobble Kill" : "Wobble",
          body: `${actorName} landed ${pummels} pummels${conversion.didKill ? " into a kill" : ""}.`,
          importance: conversion.didKill ? "high" : "info",
          priority: conversion.didKill ? 118 : 82,
        });
      }
    }

    if (actor.character === "Samus") {
      if (conversion.didKill && last === MOVE_NEUTRAL_B) {
        addCandidate({
          type: "charge-shot",
          title: "Charge Shot Kill",
          body: `${actorName} killed ${victimName} with charge shot at ${startPercent}%.`,
          importance: "high",
          priority: 108,
        });
      } else if (conversion.didKill && last === MOVE_UP_B) {
        addCandidate({
          type: "up-b-kill",
          title: "Up-B Kill",
          body: `${actorName} killed ${victimName} with up-B at ${startPercent}%.`,
          importance: "high",
          priority: 90,
        });
      }
    }

    if (actor.character === "Pikachu" || actor.character === "Pichu") {
      if (conversion.didKill && last === MOVE_SHINE) {
        addCandidate({
          type: "thunder-kill",
          title: "Thunder Kill",
          body: `${actorName} killed ${victimName} with thunder at ${startPercent}%.`,
          importance: "high",
          priority: 110,
        });
      }
      if (maxConsecutive(conversion.moves, MOVE_UAIR) >= 3) {
        addCandidate({
          type: "upair-chain",
          title: "Upair Chain",
          body: `${actorName} linked ${maxConsecutive(conversion.moves, MOVE_UAIR)} upairs for ${damage}%.`,
          importance: conversion.didKill ? "high" : "info",
          priority: conversion.didKill ? 94 : 62,
        });
      }
      if (conversion.didKill && last === MOVE_USMASH) {
        addCandidate({
          type: "upsmash-kill",
          title: "Upsmash Kill",
          body: `${actorName} killed ${victimName} with upsmash at ${startPercent}%.`,
          importance: "high",
          priority: 88,
        });
      }
    }

    if (actor.character === "Luigi" && conversion.didKill && last === MOVE_UP_B) {
      addCandidate({
        type: "shoryuken",
        title: "Shoryuken",
        body: `${actorName} killed ${victimName} with up-B at ${startPercent}%.`,
        importance: "high",
        priority: 112,
      });
    }

    if (actor.character === "Ganon" || actor.character === "Ganondorf") {
      if (conversion.didKill && last === MOVE_DAIR) {
        addCandidate({
          type: "ganon-stomp",
          title: "Ganon Stomp",
          body: `${actorName} killed ${victimName} with stomp at ${startPercent}%.`,
          importance: "high",
          priority: 110,
        });
      } else if (conversion.didKill && conversion.moves.some((m) => m.moveId === MOVE_SIDE_B)) {
        addCandidate({
          type: "ganon-side-b",
          title: "Side-B Kill",
          body: `${actorName} killed ${victimName} with side-B at ${startPercent}%.`,
          importance: "high",
          priority: 100,
        });
      }
    }

    if ((actor.character === "Mario" || actor.character === "Doc") && conversion.didKill) {
      if (last === MOVE_FAIR && offstageKill) {
        addCandidate({
          type: "spike-kill",
          title: `${actor.character} Fair Spike`,
          body: `${actorName} spiked ${victimName} with fair at ${startPercent}%.`,
          importance: "high",
          priority: 110,
        });
      } else if (conversion.moves.some((m) => m.moveId === MOVE_SIDE_B) && offstageKill) {
        addCandidate({
          type: "cape-gimp",
          title: "Cape Gimp",
          body: `${actorName} turned ${victimName} around offstage at ${startPercent}%.`,
          importance: "high",
          priority: 106,
        });
      }
    }

    if (conversion.didKill && conversion.startPercent === 0) {
      addCandidate({
        type: "zero-to-death",
        title: "Zero-to-Death",
        body: `${actorName} took ${victimName} from 0% to stock in one opening.`,
        importance: "high",
        priority: 100,
      });
    }

    if (conversion.didKill && offstageKill) {
      addCandidate({
        type: startPercent < 70 ? "edgeguard-kill" : "spike-kill",
        title: startPercent < 70 ? "Gimp" : "Edgeguard Kill",
        body: `${actorName} finished ${victimName} offstage from ${startPercent}%.`,
        importance: "high",
        priority: startPercent < 70 ? 84 : 74,
      });
    }

    if (conversion.didKill && last === MOVE_DAIR && offstageKill) {
      addCandidate({
        type: "spike-kill",
        title: "Spike Kill",
        body: `${actorName} spiked ${victimName} with dair at ${startPercent}%.`,
        importance: "high",
        priority: 90,
      });
    }

    if (
      conversion.didKill &&
      (damage >= HIGH_COMBO_KILL_DAMAGE ||
        (conversion.moves.length >= HIGH_COMBO_KILL_HITS && damage >= HIGH_COMBO_KILL_DAMAGE - 15))
    ) {
      addCandidate({
        type: "high-combo-kill",
        title: "High Combo Kill",
        body: `${actorName} killed ${victimName}: ${damage}% over ${conversion.moves.length} hit${conversion.moves.length === 1 ? "" : "s"} from ${startPercent}%.`,
        importance: "high",
        priority: 80,
      });
    } else if (!conversion.didKill && damage >= HUGE_CONVERSION_DAMAGE) {
      addCandidate({
        type: "huge-conversion",
        title: damage >= 80 ? "Monster Punish" : "Huge Conversion",
        body: `${actorName} dealt ${damage}% in one opening from ${startPercent}%: ${describeSequence(names)}.`,
        importance: damage >= 80 ? "high" : "info",
        priority: damage >= 80 ? 72 : 54,
      });
    }

    if (conversion.didKill && startPercent <= 55) {
      addCandidate({
        type: "early-kill",
        title: "Early Kill",
        body: `${actorName} took ${victimName}'s stock from ${startPercent}%.`,
        importance: "high",
        priority: 52,
      });
    }

    candidates.sort((a, b) => b.priority - a.priority);
    const best = candidates[0];
    if (best) {
      const { priority: _priority, ...event } = best;
      pushOnce(events, seenKeys, event);
    }
  }

  return events;
}

export function detectLiveFrameEvents({
  frames,
  conversions,
  players,
  seenKeys,
  fromFrame,
  toFrame,
}: {
  frames: FramesType;
  conversions: ConversionType[];
  players: CornermanLivePlayer[];
  seenKeys: Set<string>;
  fromFrame: number;
  toFrame: number;
}): CornermanLiveEvent[] {
  const events: CornermanLiveEvent[] = [];

  for (let frame = fromFrame; frame <= toFrame; frame++) {
    const current = frames[frame];
    const previous = frames[frame - 1];
    if (!current || !previous) continue;

    for (const player of players) {
      const curPost = current.players[player.playerIndex]?.post;
      const prevPost = previous.players[player.playerIndex]?.post;
      if (!curPost || !prevPost) continue;

      const curState = curPost.actionStateId ?? 0;
      const prevState = prevPost.actionStateId ?? 0;

      // NOTE: no power-shield alert. GuardReflect (182) is the initial animation
      // of EVERY shield press (it only reflects on frames 1-2), so a state-only
      // heuristic can't tell a real power-shield from a normal shield raise and
      // fired on every shield. Reliable detection needs projectile-reflection
      // tracking; until then, no alert beats a wrong one.

      if (curState === SHIELD_BREAK_FLY && prevState !== SHIELD_BREAK_FLY) {
        pushOnce(events, seenKeys, {
          id: `shield-break:${player.playerIndex}:${frame}`,
          type: "shield-break",
          title: "Shield Break",
          body: `${shortActor(player)} got shield broken at ${frameToTimestamp(frame)}.`,
          timestamp: frameToTimestamp(frame),
          frame,
          actorTag: player.tag,
          actorCharacter: player.character,
          actorIsTarget: player.isTarget,
          victimTag: null,
          victimCharacter: null,
          victimIsTarget: null,
          importance: "high",
        });
      }

      const curStocks = curPost.stocksRemaining;
      const prevStocks = prevPost.stocksRemaining;
      if (curStocks == null || prevStocks == null || curStocks >= prevStocks) continue;

      const hadKillingConversion = conversions.some(
        (conversion) =>
          conversion.playerIndex === player.playerIndex &&
          conversion.didKill &&
          conversion.endFrame != null &&
          Math.abs(conversion.endFrame - frame) <= 10,
      );
      if (hadKillingConversion) continue;

      const airDodgeLike = prevState === State.AIR_DODGE || curState === State.LANDING_FALL_SPECIAL;
      pushOnce(events, seenKeys, {
        id: `self-destruct:${player.playerIndex}:${frame}`,
        type: "self-destruct",
        title: airDodgeLike ? "Air-Dodge Death" : "Self-Destruct",
        body: `${shortActor(player)} lost a stock without being killed at ${frameToTimestamp(frame)}.`,
        timestamp: frameToTimestamp(frame),
        frame,
        actorTag: player.tag,
        actorCharacter: player.character,
        actorIsTarget: player.isTarget,
        victimTag: null,
        victimCharacter: null,
        victimIsTarget: null,
        importance: "high",
      });
    }
  }

  return events;
}

export function detectLiveItemEvents({
  frames,
  players,
  seenKeys,
  fromFrame,
  toFrame,
}: {
  frames: FramesType;
  players: CornermanLivePlayer[];
  seenKeys: Set<string>;
  fromFrame: number;
  toFrame: number;
}): CornermanLiveEvent[] {
  const events: CornermanLiveEvent[] = [];

  for (let frame = fromFrame; frame <= toFrame; frame++) {
    const items = frames[frame]?.items;
    if (!items) continue;

    for (const item of items as ItemUpdateType[]) {
      const instanceKey = observeItemInstance(seenKeys, item);
      if (!instanceKey) continue;
      if (item.owner == null) continue;

      const actor = players.find((p) => p.playerIndex === item.owner);
      if (!actor || actor.character !== "Peach") continue;

      const rareItem = item.typeId == null ? null : (PEACH_RARE_ITEMS[item.typeId] ?? null);
      if (rareItem) {
        const id = `rare-item:${actor.playerIndex}:${instanceKey}:${item.typeId}`;
        pushOnce(events, seenKeys, {
          id,
          type: "rare-item",
          title: rareItem,
          body: `${shortActor(actor)} pulled ${rareItem} at ${frameToTimestamp(frame)}.`,
          timestamp: frameToTimestamp(frame),
          frame,
          actorTag: actor.tag,
          actorCharacter: actor.character,
          actorIsTarget: actor.isTarget,
          victimTag: null,
          victimCharacter: null,
          victimIsTarget: null,
          importance: "high",
        });
        continue;
      }

      if (item.typeId !== TURNIP_TYPE_ID || item.turnipFace !== STITCH_FACE_ID) continue;

      const id = `stitch-face:${actor.playerIndex}:${instanceKey}`;
      pushOnce(events, seenKeys, {
        id,
        type: "stitch-face",
        title: "Stitch Face",
        body: `${shortActor(actor)} pulled a stitch face at ${frameToTimestamp(frame)}.`,
        timestamp: frameToTimestamp(frame),
        frame,
        actorTag: actor.tag,
        actorCharacter: actor.character,
        actorIsTarget: actor.isTarget,
        victimTag: null,
        victimCharacter: null,
        victimIsTarget: null,
        importance: "high",
      });
    }
  }

  return events;
}
