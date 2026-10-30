import { State, Frames, type FramesType, type ConversionType } from "@slippi/slippi-js/node";

import type { CharacterSignatureStats, TurnipPullStats, KenComboStats } from "./types.js";
import { moveIdToName, getMoveName, stageBounds } from "./helpers.js";

// ── Character signature stat detection ────────────────────────────────
// NOTE: Many of these stats are approximations based on conversion move
// sequences. For example, "tipperKills" counts fsmash kills as a proxy
// since replay data doesn't distinguish tipper vs sourspot hits.

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

export const MOVE_SHINE = 21;
export const MOVE_DOWN_B = 21; // Same as MOVE_SHINE — used by all characters' down-b
export const MOVE_USMASH = 11;
export const MOVE_UTHROW = 54;
export const MOVE_UAIR = 16;
export const MOVE_DAIR = 17;
export const MOVE_FAIR = 14;
export const MOVE_BAIR = 15;
export const MOVE_GRAB = 50;
export const MOVE_PUMMEL = 51;
export const MOVE_FTHROW = 52;
export const MOVE_DTHROW = 55;
export const MOVE_NEUTRAL_B = 18;
export const MOVE_FSMASH = 10;
export const MOVE_DSMASH = 12;
export const MOVE_SIDE_B = 19;
export const MOVE_UP_B = 20;
export const MOVE_UTILT = 8;
export const MOVE_DTILT = 9;
export const MOVE_NAIR = 13;
export const MOVE_BTHROW = 53;
export const MOVE_DASH_ATTACK = 6;

export function detectSignatureStats(
  character: string,
  playerIndex: number,
  myConversions: ConversionType[],
  moveUsageMap: Map<string, { count: number; hits: number }>,
  turnipPullStats: TurnipPullStats | null,
  kenComboStats: KenComboStats | null,
  frames: FramesType,
  lastFrame: number,
  stageId: number,
  _allConversions: ConversionType[],
): CharacterSignatureStats | null {
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
        // Multi-shine combos: shine appears 2+ times in a conversion
        if (countMoveId(moves, MOVE_SHINE) >= 2) multiShineCombos++;
        // Waveshine to upsmash: shine → usmash sequence
        if (hasSequence(moves, MOVE_SHINE, MOVE_USMASH)) waveshineToUpsmash++;
        // Upthrow → uair
        if (moves.some((m) => m.moveId === MOVE_UTHROW) && moves.some((m) => m.moveId === MOVE_UAIR)) {
          upthrowUpairs++;
          if (conv.didKill) upthrowUpairKills++;
        }
        // Drill (dair) → shine
        if (hasAdjacentSequence(moves, MOVE_DAIR, MOVE_SHINE)) drillShines++;
        // Shine spike kills: conversion ending in shine where opponent dies offstage
        if (moves.length > 0) {
          const lastMove = moves[moves.length - 1]!;
          if (lastMove.moveId === MOVE_DOWN_B && conv.didKill) {
            const endFrame = conv.endFrame;
            if (endFrame != null) {
              const victimIndex = conv.playerIndex;
              const fd = frames[endFrame];
              if (fd) {
                const victimPost = fd.players[victimIndex]?.post;
                if (victimPost) {
                  const posX = victimPost.positionX ?? 0;
                  const posY = victimPost.positionY ?? 0;
                  const bounds = stageBounds(stageId);
                  if (Math.abs(posX) > bounds.x || posY < bounds.yMin) {
                    shineSpikeKills++;
                  }
                }
              }
            }
          }
        }
      }

      return {
        character: "Fox",
        multiShineCombos,
        waveshineToUpsmash,
        upthrowUpairs,
        upthrowUpairKills,
        drillShines,
        shineSpikeKills,
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
        // Shine → grab
        if (hasAdjacentSequence(moves, MOVE_SHINE, MOVE_GRAB)) shineGrabs++;
      }

      const laserEntry = moveUsageMap.get("neutral b");
      const laserCount = laserEntry?.count ?? 0;

      return { character: "Falco", pillarCombos, pillarKills, shineGrabs, laserCount };
    }

    case "Sheik": {
      let techChases = 0;
      let techChaseKills = 0;
      let needleHits = 0;
      let fairChains = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        // Needle hits
        needleHits += countMoveId(moves, MOVE_NEUTRAL_B);
        // Fair chains: 3+ consecutive fairs
        if (maxConsecutive(moves, MOVE_FAIR) >= 3) fairChains++;

        // Tech chase: conversion with a throw that has the opponent in tech/down state
        const hasThrow = moves.some((m) => m.moveId === MOVE_DTHROW || m.moveId === MOVE_FTHROW);
        if (!hasThrow || moves.length < 2) continue;

        const startFrame = conv.startFrame;
        if (startFrame == null) continue;

        let hasTechSituation = false;
        const endF = conv.endFrame ?? startFrame + 300;
        const victimIndex = conv.playerIndex;
        for (let f = startFrame; f <= Math.min(endF, lastFrame); f++) {
          const fd = frames[f];
          if (!fd) continue;
          const victimPost = fd.players[victimIndex]?.post;
          if (!victimPost) continue;
          const victimState = victimPost.actionStateId ?? 0;
          if (
            (victimState >= State.DOWN_START && victimState <= State.DOWN_END) ||
            (victimState >= State.TECH_START && victimState <= State.TECH_END) ||
            (victimState >= 195 && victimState <= 198)
          ) {
            hasTechSituation = true;
            break;
          }
        }

        if (hasTechSituation && moves.length >= 3) {
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
      let techChaseGrabs = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;

        // Knee kills: conversion ending with fair that killed
        if (lastMove.moveId === MOVE_FAIR && conv.didKill) kneeKills++;
        // Stomp to knee: dair → fair
        if (hasSequence(moves, MOVE_DAIR, MOVE_FAIR)) stompKnees++;
        // Upthrow → knee kill: starts with uthrow, ends with fair kill
        if (moves.some((m) => m.moveId === MOVE_UTHROW) && lastMove.moveId === MOVE_FAIR && conv.didKill)
          upthrowKnees++;
        // Tech chase grabs: starts with grab and opponent was in tech/down state
        if (moves[0]!.moveId !== MOVE_GRAB) continue;

        const startFrame = conv.startFrame;
        if (startFrame == null) continue;
        const victimIndex = conv.playerIndex;

        for (let f = startFrame - 10; f <= startFrame; f++) {
          const fd = frames[f];
          if (!fd) continue;
          const victimPost = fd.players[victimIndex]?.post;
          if (!victimPost) continue;
          const victimState = victimPost.actionStateId ?? 0;
          if (
            (victimState >= State.DOWN_START && victimState <= State.DOWN_END) ||
            (victimState >= State.TECH_START && victimState <= State.TECH_END) ||
            (victimState >= 195 && victimState <= 198)
          ) {
            techChaseGrabs++;
            break;
          }
        }
      }

      // Gentleman detection: jab1 → jab2 → jab3 without transitioning to rapid jab
      let gentlemanCount = 0;
      let jabSequence = 0; // 0=none, 1=jab1, 2=jab2, 3=jab3
      let lastJabFrame = 0;

      for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
        const frame = frames[f];
        if (!frame) continue;
        const pd = frame.players[playerIndex]?.post;
        if (!pd) continue;
        const actionState = pd.actionStateId ?? 0;

        if (actionState === State.ATTACK_JAB1) {
          jabSequence = 1;
          lastJabFrame = f;
        } else if (actionState === 45 && jabSequence === 1 && f - lastJabFrame < 30) {
          jabSequence = 2;
          lastJabFrame = f;
        } else if (actionState === 46 && jabSequence === 2 && f - lastJabFrame < 30) {
          jabSequence = 3;
          lastJabFrame = f;
        } else if (actionState === 47 && jabSequence === 3) {
          // Went into rapid jab — not a gentleman
          jabSequence = 0;
        } else if (jabSequence === 3 && f - lastJabFrame > 20) {
          // jab3 happened and no rapid jab followed — gentleman!
          gentlemanCount++;
          jabSequence = 0;
        } else if (jabSequence > 0 && f - lastJabFrame > 40) {
          jabSequence = 0;
        }
      }

      return { character: "Falcon", kneeKills, stompKnees, upthrowKnees, techChaseGrabs, gentlemanCount };
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
        const lastMove = moves[moves.length - 1]!;

        // Rest: down b in conversion
        if (moves.some((m) => m.moveId === MOVE_DOWN_B)) {
          restAttempts++;
          if (lastMove.moveId === MOVE_DOWN_B && conv.didKill) restKills++;
        }
        // Rest setup: track what move preceded rest
        for (let i = 0; i < moves.length; i++) {
          if (moves[i]!.moveId === MOVE_DOWN_B && i > 0) {
            const setupMove = moveIdToName[moves[i - 1]!.moveId] ?? getMoveName(moves[i - 1]!.moveId);
            restSetupMap.set(setupMove, (restSetupMap.get(setupMove) ?? 0) + 1);
          }
        }
        // Bair strings
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
        const { moves } = conv;
        // Wobble: 8+ pummels in a single conversion
        if (countMoveId(moves, MOVE_PUMMEL) >= 8) {
          wobbles++;
          if (conv.didKill) wobbleKills++;
        }
      }

      // Desync detection: Nana performing different attacks while Popo is in a different state
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

        const nanaAttacking =
          (nanaState >= State.GROUND_ATTACK_START && nanaState <= State.GROUND_ATTACK_END) ||
          (nanaState >= State.AERIAL_ATTACK_START && nanaState <= State.AERIAL_DAIR) ||
          nanaState === State.GRAB ||
          nanaState === State.DASH_GRAB;
        const popoAttacking =
          (popoState >= State.GROUND_ATTACK_START && popoState <= State.GROUND_ATTACK_END) ||
          (popoState >= State.AERIAL_ATTACK_START && popoState <= State.AERIAL_DAIR) ||
          popoState === State.GRAB ||
          popoState === State.DASH_GRAB;

        const isDesync = nanaAttacking && (!popoAttacking || Math.abs(popoState - nanaState) > 2);

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
        const startFrame = conv.startFrame;
        if (startFrame == null) continue;
        const nana = frames[startFrame]?.followers?.[playerIndex]?.post;
        if (!nana || (nana.stocksRemaining ?? 0) <= 0) {
          sopoKills++;
        }
      }

      // Nana deaths: count how many times Nana lost a stock
      let nanaDeaths = 0;
      let prevNanaStocks = 4;
      for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
        const frame = frames[f];
        if (!frame) continue;
        const nana = frame.followers?.[playerIndex]?.post;
        if (!nana) continue;
        const nanaStocks = nana.stocksRemaining ?? prevNanaStocks;
        if (nanaStocks < prevNanaStocks) {
          nanaDeaths += prevNanaStocks - nanaStocks;
        }
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

        // Chain grabs: 2+ throws in one conversion
        const throwIds = [MOVE_FTHROW, MOVE_UTHROW, MOVE_DTHROW, MOVE_BTHROW];
        const throwCount = moves.filter((m) => throwIds.includes(m.moveId)).length;
        if (throwCount >= 2) chainGrabs++;

        // Fsmash kills
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_FSMASH && conv.didKill) fsmashKills++;
      }

      return { character: "Marth", kenCombos, chainGrabs, fsmashKills };
    }

    case "Peach": {
      let dsmashKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_DSMASH && conv.didKill) dsmashKills++;
      }

      const stitchFaces = turnipPullStats?.faces.find((f) => f.face === "stitch face")?.count ?? 0;

      // Float cancel aerials: detect aerials performed while floating low to ground
      // Float = airborne + near-zero Y velocity + low altitude + performing aerial
      let floatCancelAerials = 0;
      let wasFloatAerial = false;

      for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
        const frame = frames[f];
        if (!frame) continue;
        const pd = frame.players[playerIndex]?.post;
        if (!pd) continue;
        const actionState = pd.actionStateId ?? 0;
        const posY = pd.positionY ?? 0;
        const isPlayerAirborne = pd.isAirborne === true;
        const speeds = pd.selfInducedSpeeds;
        const ySpeed = speeds?.y ?? 999;

        // Aerial attack action states
        const isAerial = actionState >= State.AERIAL_ATTACK_START && actionState <= State.AERIAL_DAIR;
        // Floating near ground: airborne, low altitude, near-zero self-induced Y velocity
        const isLowFloat = isPlayerAirborne && posY > 0 && posY < 15 && Math.abs(ySpeed) < 1.0;

        if (isAerial && isLowFloat && !wasFloatAerial) {
          floatCancelAerials++;
          wasFloatAerial = true;
        } else if (!isAerial) {
          wasFloatAerial = false;
        }
      }

      return {
        character: "Peach",
        turnipPulls: turnipPullStats?.totalPulls ?? 0,
        turnipHits: turnipPullStats?.turnipsHit ?? 0,
        stitchFaces,
        dsmashKills,
        floatCancelAerials,
      };
    }

    case "Samus": {
      let chargeShotKills = 0;
      let upBKills = 0;
      let dairKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_NEUTRAL_B && conv.didKill) chargeShotKills++;
        if (lastMove.moveId === MOVE_UP_B && conv.didKill) upBKills++;
        if (lastMove.moveId === MOVE_DAIR && conv.didKill) dairKills++;
      }

      const missileEntry = moveUsageMap.get("side b");
      const missileCount = missileEntry?.count ?? 0;

      return { character: "Samus", chargeShotKills, missileCount, upBKills, dairKills };
    }

    case "Pikachu": {
      let thunderKills = 0;
      let upSmashKills = 0;
      let upairChains = 0;
      let nairCombos = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_DOWN_B && conv.didKill) thunderKills++;
        if (lastMove.moveId === MOVE_USMASH && conv.didKill) upSmashKills++;
        if (maxConsecutive(moves, MOVE_UAIR) >= 3) upairChains++;
        if (countMoveId(moves, MOVE_NAIR) >= 2) nairCombos++;
      }

      return { character: "Pikachu", thunderKills, upSmashKills, upairChains, nairCombos };
    }

    case "Luigi": {
      let shoryukenKills = 0;
      let dairKills = 0;
      let downSmashKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_UP_B && conv.didKill) shoryukenKills++;
        if (lastMove.moveId === MOVE_DAIR && conv.didKill) dairKills++;
        if (lastMove.moveId === MOVE_DSMASH && conv.didKill) downSmashKills++;
      }

      const fireBallEntry = moveUsageMap.get("neutral b");
      const fireBallCount = fireBallEntry?.count ?? 0;

      return { character: "Luigi", shoryukenKills, dairKills, downSmashKills, fireBallCount };
    }

    case "Mario": {
      let fsmashKills = 0;
      let upSmashKills = 0;
      let fairSpikeKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_FSMASH && conv.didKill) fsmashKills++;
        if (lastMove.moveId === MOVE_USMASH && conv.didKill) upSmashKills++;
        if (lastMove.moveId === MOVE_FAIR && conv.didKill) {
          if (conv.endFrame != null) {
            const victimIndex = conv.playerIndex;
            const fd = frames[conv.endFrame];
            if (fd) {
              const victimPost = fd.players[victimIndex]?.post;
              if (victimPost) {
                const posX = victimPost.positionX ?? 0;
                const posY = victimPost.positionY ?? 0;
                const bounds = stageBounds(stageId);
                if (Math.abs(posX) > bounds.x || posY < bounds.yMin) {
                  fairSpikeKills++;
                }
              }
            }
          }
        }
      }

      const capeEntry = moveUsageMap.get("side b");
      const capeCount = capeEntry?.count ?? 0;
      const marioFireBallEntry = moveUsageMap.get("neutral b");
      const marioFireBallCount = marioFireBallEntry?.count ?? 0;

      return {
        character: "Mario",
        capeCount,
        fireBallCount: marioFireBallCount,
        fsmashKills,
        upSmashKills,
        fairSpikeKills,
      };
    }

    case "Doc": {
      let fsmashKills = 0;
      let upBKills = 0;
      let dairKills = 0;
      let fairSpikeKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_FSMASH && conv.didKill) fsmashKills++;
        if (lastMove.moveId === MOVE_UP_B && conv.didKill) upBKills++;
        if (lastMove.moveId === MOVE_DAIR && conv.didKill) dairKills++;
        if (lastMove.moveId === MOVE_FAIR && conv.didKill) {
          if (conv.endFrame != null) {
            const victimIndex = conv.playerIndex;
            const fd = frames[conv.endFrame];
            if (fd) {
              const victimPost = fd.players[victimIndex]?.post;
              if (victimPost) {
                const posX = victimPost.positionX ?? 0;
                const posY = victimPost.positionY ?? 0;
                const bounds = stageBounds(stageId);
                if (Math.abs(posX) > bounds.x || posY < bounds.yMin) {
                  fairSpikeKills++;
                }
              }
            }
          }
        }
      }

      const pillEntry = moveUsageMap.get("neutral b");
      const pillCount = pillEntry?.count ?? 0;

      return { character: "Doc", pillCount, fsmashKills, upBKills, dairKills, fairSpikeKills };
    }

    case "Yoshi": {
      let dairKills = 0;
      let upSmashKills = 0;
      let fairSpikeKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_DAIR && conv.didKill) dairKills++;
        if (lastMove.moveId === MOVE_USMASH && conv.didKill) upSmashKills++;
        if (lastMove.moveId === MOVE_FAIR && conv.didKill) {
          if (conv.endFrame != null) {
            const victimIndex = conv.playerIndex;
            const fd = frames[conv.endFrame];
            if (fd) {
              const victimPost = fd.players[victimIndex]?.post;
              if (victimPost) {
                const posX = victimPost.positionX ?? 0;
                const posY = victimPost.positionY ?? 0;
                const bounds = stageBounds(stageId);
                if (Math.abs(posX) > bounds.x || posY < bounds.yMin) {
                  fairSpikeKills++;
                }
              }
            }
          }
        }
      }

      const eggThrowEntry = moveUsageMap.get("up b");
      const eggThrowCount = eggThrowEntry?.count ?? 0;

      return { character: "Yoshi", eggThrowCount, dairKills, upSmashKills, fairSpikeKills };
    }

    case "Ganon": {
      let stompKills = 0;
      let sideBKills = 0;
      let upTiltKills = 0;
      let fairKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_DAIR && conv.didKill) stompKills++;
        if (lastMove.moveId === MOVE_SIDE_B && conv.didKill) sideBKills++;
        if (lastMove.moveId === MOVE_UTILT && conv.didKill) upTiltKills++;
        if (lastMove.moveId === MOVE_FAIR && conv.didKill) fairKills++;
      }

      return { character: "Ganon", stompKills, sideBKills, upTiltKills, fairKills };
    }

    case "Link": {
      let dairSpikeKills = 0;
      let upSmashKills = 0;
      let grabCombos = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_USMASH && conv.didKill) upSmashKills++;
        if (lastMove.moveId === MOVE_DAIR && conv.didKill) {
          if (conv.endFrame != null) {
            const victimIndex = conv.playerIndex;
            const fd = frames[conv.endFrame];
            if (fd) {
              const victimPost = fd.players[victimIndex]?.post;
              if (victimPost) {
                const posX = victimPost.positionX ?? 0;
                const posY = victimPost.positionY ?? 0;
                const bounds = stageBounds(stageId);
                if (Math.abs(posX) > bounds.x || posY < bounds.yMin) {
                  dairSpikeKills++;
                }
              }
            }
          }
        }
        // Grab combos: starts with grab, 3+ moves
        if (moves[0]!.moveId === MOVE_GRAB && moves.length >= 3) grabCombos++;
      }

      const boomerangEntry = moveUsageMap.get("side b");
      const boomerangCount = boomerangEntry?.count ?? 0;
      const linkBombEntry = moveUsageMap.get("down b");
      const linkBombCount = linkBombEntry?.count ?? 0;

      return { character: "Link", boomerangCount, bombCount: linkBombCount, dairSpikeKills, upSmashKills, grabCombos };
    }

    case "YLink": {
      let dairSpikeKills = 0;
      let nairCombos = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_DAIR && conv.didKill) {
          if (conv.endFrame != null) {
            const victimIndex = conv.playerIndex;
            const fd = frames[conv.endFrame];
            if (fd) {
              const victimPost = fd.players[victimIndex]?.post;
              if (victimPost) {
                const posX = victimPost.positionX ?? 0;
                const posY = victimPost.positionY ?? 0;
                const bounds = stageBounds(stageId);
                if (Math.abs(posX) > bounds.x || posY < bounds.yMin) {
                  dairSpikeKills++;
                }
              }
            }
          }
        }
        if (countMoveId(moves, MOVE_NAIR) >= 2) nairCombos++;
      }

      const fireArrowEntry = moveUsageMap.get("neutral b");
      const fireArrowCount = fireArrowEntry?.count ?? 0;
      const ylinkBombEntry = moveUsageMap.get("down b");
      const ylinkBombCount = ylinkBombEntry?.count ?? 0;

      return { character: "YLink", fireArrowCount, bombCount: ylinkBombCount, dairSpikeKills, nairCombos };
    }

    case "Zelda": {
      let lightningKickKills = 0;
      let upBKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if ((lastMove.moveId === MOVE_FAIR || lastMove.moveId === MOVE_BAIR) && conv.didKill) lightningKickKills++;
        if (lastMove.moveId === MOVE_UP_B && conv.didKill) upBKills++;
      }

      const dinsFireEntry = moveUsageMap.get("side b");
      const dinsFireCount = dinsFireEntry?.count ?? 0;

      return { character: "Zelda", lightningKickKills, dinsFireCount, upBKills };
    }

    case "Roy": {
      let fsmashKills = 0;
      let blazerKills = 0;
      let chainGrabs = 0;
      let dtiltConversions = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_FSMASH && conv.didKill) fsmashKills++;
        if (lastMove.moveId === MOVE_UP_B && conv.didKill) blazerKills++;

        // Chain grabs: 2+ throws
        const throwIds = [MOVE_FTHROW, MOVE_UTHROW, MOVE_DTHROW, MOVE_BTHROW];
        const throwCount = moves.filter((m) => throwIds.includes(m.moveId)).length;
        if (throwCount >= 2) chainGrabs++;

        // Dtilt conversions: starts with dtilt, 2+ moves
        if (moves[0]!.moveId === MOVE_DTILT && moves.length >= 2) dtiltConversions++;
      }

      const counterEntry = moveUsageMap.get("down b");
      const counterCount = counterEntry?.count ?? 0;

      return { character: "Roy", fsmashKills, blazerKills, counterCount, chainGrabs, dtiltConversions };
    }

    case "Mewtwo": {
      let upThrowKills = 0;
      let fairKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_FAIR && conv.didKill) fairKills++;
        if (moves.some((m) => m.moveId === MOVE_UTHROW) && conv.didKill) upThrowKills++;
      }

      const shadowBallEntry = moveUsageMap.get("neutral b");
      const shadowBallCount = shadowBallEntry?.count ?? 0;
      const confusionEntry = moveUsageMap.get("side b");
      const confusionCount = confusionEntry?.count ?? 0;

      return { character: "Mewtwo", shadowBallCount, confusionCount, upThrowKills, fairKills };
    }

    case "G&W": {
      let judgementKills = 0;
      let upAirKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_SIDE_B && conv.didKill) judgementKills++;
        if (lastMove.moveId === MOVE_UAIR && conv.didKill) upAirKills++;
      }

      const judgementEntry = moveUsageMap.get("side b");
      const judgementCount = judgementEntry?.count ?? 0;
      const baconEntry = moveUsageMap.get("neutral b");
      const baconCount = baconEntry?.count ?? 0;

      return { character: "G&W", judgementCount, judgementKills, upAirKills, baconCount };
    }

    case "Ness": {
      let backThrowKills = 0;
      let dairKills = 0;
      let fairKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_DAIR && conv.didKill) dairKills++;
        if (lastMove.moveId === MOVE_FAIR && conv.didKill) fairKills++;
        if (moves.some((m) => m.moveId === MOVE_BTHROW) && conv.didKill) backThrowKills++;
      }

      const pkFireEntry = moveUsageMap.get("side b");
      const pkFireCount = pkFireEntry?.count ?? 0;

      return { character: "Ness", pkFireCount, backThrowKills, dairKills, fairKills };
    }

    case "Bowser": {
      let upBKills = 0;
      let fsmashKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_UP_B && conv.didKill) upBKills++;
        if (lastMove.moveId === MOVE_FSMASH && conv.didKill) fsmashKills++;
      }

      const flameEntry = moveUsageMap.get("neutral b");
      const flameCount = flameEntry?.count ?? 0;
      const koopaClawEntry = moveUsageMap.get("side b");
      const koopaClaw = koopaClawEntry?.count ?? 0;

      return { character: "Bowser", flameCount, koopaClaw, upBKills, fsmashKills };
    }

    case "Kirby": {
      let upTiltKills = 0;
      let fsmashKills = 0;
      let dairCombos = 0;
      let stoneKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_UTILT && conv.didKill) upTiltKills++;
        if (lastMove.moveId === MOVE_FSMASH && conv.didKill) fsmashKills++;
        if (lastMove.moveId === MOVE_DOWN_B && conv.didKill) stoneKills++;
        if (maxConsecutive(moves, MOVE_DAIR) >= 3) dairCombos++;
      }

      const inhaleEntry = moveUsageMap.get("neutral b");
      const inhaleCount = inhaleEntry?.count ?? 0;

      return { character: "Kirby", inhaleCount, upTiltKills, fsmashKills, dairCombos, stoneKills };
    }

    case "DK": {
      let giantPunchKills = 0;
      let spikeKills = 0;
      let bairKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_NEUTRAL_B && conv.didKill) giantPunchKills++;
        if (lastMove.moveId === MOVE_BAIR && conv.didKill) bairKills++;
        if (lastMove.moveId === MOVE_FAIR && conv.didKill) {
          if (conv.endFrame != null) {
            const victimIndex = conv.playerIndex;
            const fd = frames[conv.endFrame];
            if (fd) {
              const victimPost = fd.players[victimIndex]?.post;
              if (victimPost) {
                const posX = victimPost.positionX ?? 0;
                const posY = victimPost.positionY ?? 0;
                const bounds = stageBounds(stageId);
                if (Math.abs(posX) > bounds.x || posY < bounds.yMin) {
                  spikeKills++;
                }
              }
            }
          }
        }
      }

      const headbuttEntry = moveUsageMap.get("side b");
      const headbuttCount = headbuttEntry?.count ?? 0;

      return { character: "DK", giantPunchKills, headbuttCount, spikeKills, bairKills };
    }

    case "Pichu": {
      let thunderKills = 0;
      let upSmashKills = 0;
      let nairCombos = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_DOWN_B && conv.didKill) thunderKills++;
        if (lastMove.moveId === MOVE_USMASH && conv.didKill) upSmashKills++;
        if (countMoveId(moves, MOVE_NAIR) >= 2) nairCombos++;
      }

      const thunderJoltEntry = moveUsageMap.get("neutral b");
      const thunderJoltCount = thunderJoltEntry?.count ?? 0;

      return { character: "Pichu", thunderJoltCount, thunderKills, upSmashKills, nairCombos };
    }

    default:
      return null;
  }
}
