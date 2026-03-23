import {
  Frames,
  State,
  type OverallType,
  type ActionCountsType,
  type ConversionType,
  type StockType,
  type FramesType,
  type PlayerType,
} from "@slippi/slippi-js/node";

import type { PlayerSummary, KenComboStats, TurnipPullStats } from "./types.js";
import {
  getPlayerTag, getCharacterName, getMoveName, ratio, framesToSeconds,
  frameToTimestamp, isAirborne, isOnLedge, isOnPlatform, isOffstage,
  isDashDancing, stageBounds, moveIdToName,
  GUARD_ON, GUARD, GUARD_SET_OFF, GUARD_REFLECT,
  SHIELD_BREAK_FLY, FULL_SHIELD_SIZE, SHIELD_POKE_THRESHOLD,
} from "./helpers.js";
import { detectSignatureStats } from "./signatureStats.js";

// ── Ken combo detection (Marth only) ─────────────────────────────────

const MARTH_CHARACTER_ID = 9;
const FAIR_MOVE_ID = 14;
const DAIR_MOVE_ID = 17;

export function detectKenCombos(
  characterId: number | undefined,
  myConversions: ConversionType[],
): KenComboStats | null {
  if (characterId !== MARTH_CHARACTER_ID) return null;

  const combos: KenComboStats["combos"] = [];

  for (const conv of myConversions) {
    if (conv.moves.length < 2) continue;

    const moveIds = conv.moves.map((m) => m.moveId);
    const hasFair = moveIds.includes(FAIR_MOVE_ID);
    const lastMoveId = moveIds[moveIds.length - 1];

    // Ken combo: at least one fair, ending with dair
    if (hasFair && lastMoveId === DAIR_MOVE_ID) {
      const moveNames = conv.moves.map(
        (m) => moveIdToName[m.moveId] ?? getMoveName(m.moveId),
      );
      const totalDamage = Math.round(
        (conv.endPercent ?? conv.currentPercent) - conv.startPercent,
      );

      combos.push({
        moves: moveNames,
        totalDamage,
        startPercent: Math.round(conv.startPercent),
        endedInKill: conv.didKill,
      });
    }
  }

  if (combos.length === 0) return null;

  return {
    total: combos.length,
    kills: combos.filter((c) => c.endedInKill).length,
    combos,
  };
}

// ── Peach turnip pull tracking constants ──────────────────────────────

const PEACH_CHARACTER_ID = 12;
const TURNIP_TYPE_ID = 99;
const PEACH_RARE_ITEMS: Record<number, string> = {
  103: "Mr. Saturn",
  104: "Bob-omb",
  55: "Beam Sword",
};
const TURNIP_FACE_NAMES: Record<number, string> = {
  0: "neutral",
  1: "smile",
  2: "wink",
  3: "surprised",
  4: "happy",
  5: "circle eyes",
  6: "carrot eyes",
  7: "stitch face",
};

// ── Core pipeline ─────────────────────────────────────────────────────

export function buildPlayerSummary(
  playerIndex: number,
  player: PlayerType,
  overall: OverallType,
  actionCounts: ActionCountsType,
  conversions: ConversionType[],
  playerStocks: StockType[],
  allConversions: ConversionType[],
  frames: FramesType,
  lastFrame: number,
  stageId: number,
  opponentIndex: number,
): PlayerSummary {
  const tag = getPlayerTag(player);
  const connectCode = player.connectCode || "";
  const character = getCharacterName(player.characterId);

  // Neutral
  const neutralWins = overall.neutralWinRatio.count;
  const neutralTotal = overall.neutralWinRatio.total;
  const neutralLosses = neutralTotal - neutralWins;
  const counterHits = overall.counterHitRatio.count;
  const neutralWinRate = ratio(neutralWins, neutralTotal);

  // Openings & conversions
  // NOTE: conversion.playerIndex = the VICTIM. So "my conversions" (attacks I landed)
  // are conversions where the opponent is the victim (playerIndex !== me).
  const openingsPerKill = overall.openingsPerKill.ratio ?? 0;
  const totalOpenings = overall.openingsPerKill.count; // openings I created
  const myConversions = conversions.filter(
    (c) => c.playerIndex !== playerIndex,
  );
  const totalConversions = overall.successfulConversions.count;
  const conversionRate = ratio(
    totalConversions,
    overall.successfulConversions.total,
  );
  const averageDamagePerOpening = overall.damagePerOpening.ratio ?? 0;
  const killConversions = myConversions.filter((c) => c.didKill).length;

  // Movement & positioning from frames
  let totalX = 0;
  let platformFrames = 0;
  let airFrames = 0;
  let ledgeFrames = 0;
  let dashDanceFrameCount = 0;
  let playableFrames = 0;

  // Power shield tracking
  let powerShieldCount = 0;
  let shieldFrameCount = 0; // how many frames since shield was first activated
  let prevActionState = 0;

  // Shield pressure tracking: detect sequences where THIS player attacks
  // while OPPONENT is shielding, tracking shield health changes.
  let shieldPressureSequences = 0;
  let totalShieldDamageDealt = 0;
  let shieldBreaks = 0;
  let shieldPokeHits = 0;
  let totalShieldHits = 0;
  let inPressureSequence = false;
  let currentSequenceShieldDamage = 0;
  let prevOppShieldSize = FULL_SHIELD_SIZE;
  let prevOppActionState = 0;
  let framesWithoutPressure = 0;
  // Gap tolerance: shield pressure sequence ends if >30 frames pass without
  // the opponent being in shield while this player is in an attack state.
  const PRESSURE_GAP_TOLERANCE = 30;

  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const frame = frames[f];
    if (!frame) continue;
    const pd = frame.players[playerIndex]?.post;
    if (!pd) continue;
    if (pd.stocksRemaining != null && pd.stocksRemaining <= 0) continue;

    playableFrames++;
    const posX = pd.positionX ?? 0;
    const posY = pd.positionY ?? 0;
    const actionState = pd.actionStateId ?? 0;

    // Power shield detection:
    // Projectile reflect: transition into GuardReflect (182)
    if (actionState === GUARD_REFLECT && prevActionState !== GUARD_REFLECT) {
      powerShieldCount++;
    }
    // Physical powershield: transition into GuardSetOff (181) within the 2-frame window
    // Melee's physical powershield window is frames 1-2 of shield activation
    if (actionState === GUARD_SET_OFF && prevActionState !== GUARD_SET_OFF && shieldFrameCount > 0 && shieldFrameCount <= 2) {
      powerShieldCount++;
    }
    // Track total frames in shield (GuardOn or Guard)
    if (actionState === GUARD_ON || actionState === GUARD) {
      shieldFrameCount++;
    } else {
      shieldFrameCount = 0;
    }
    prevActionState = actionState;

    // ── Shield pressure detection ──────────────────────────────────
    const oppPost = frame.players[opponentIndex]?.post;
    if (oppPost) {
      const oppAction = oppPost.actionStateId ?? 0;
      const oppShield = oppPost.shieldSize ?? FULL_SHIELD_SIZE;
      const oppStocks = oppPost.stocksRemaining ?? 0;

      // Detect shield break: opponent transitions into ShieldBreakFly (205)
      if (oppAction === SHIELD_BREAK_FLY && prevOppActionState !== SHIELD_BREAK_FLY && oppStocks > 0) {
        shieldBreaks++;
        // End current pressure sequence — it resulted in a break
        if (inPressureSequence) {
          totalShieldDamageDealt += currentSequenceShieldDamage;
          currentSequenceShieldDamage = 0;
          inPressureSequence = false;
        }
      }

      // Is opponent currently shielding?
      const oppShielding = oppAction === GUARD_ON || oppAction === GUARD || oppAction === GUARD_SET_OFF;

      // Is this player currently in an attack action state?
      const myAction = actionState;
      const inAttackState =
        (myAction >= State.GROUND_ATTACK_START && myAction <= State.GROUND_ATTACK_END) ||
        (myAction >= State.AERIAL_ATTACK_START && myAction <= 69) || // AERIAL_DAIR
        myAction === State.DASH_GRAB || myAction === State.GRAB;

      if (oppShielding && inAttackState) {
        if (!inPressureSequence) {
          // Start a new pressure sequence
          shieldPressureSequences++;
          inPressureSequence = true;
          currentSequenceShieldDamage = 0;
        }
        framesWithoutPressure = 0;

        // Track shield damage: decrease in opponent's shield size
        const shieldLost = prevOppShieldSize - oppShield;
        if (shieldLost > 0) {
          currentSequenceShieldDamage += shieldLost;
          totalShieldHits++;
          // Shield poke: attack connected while opponent's shield was very low
          if (oppShield < SHIELD_POKE_THRESHOLD) {
            shieldPokeHits++;
          }
        }
      } else if (inPressureSequence) {
        framesWithoutPressure++;
        if (framesWithoutPressure > PRESSURE_GAP_TOLERANCE) {
          // End pressure sequence
          totalShieldDamageDealt += currentSequenceShieldDamage;
          currentSequenceShieldDamage = 0;
          inPressureSequence = false;
          framesWithoutPressure = 0;
        }
      }

      prevOppShieldSize = oppShield;
      prevOppActionState = oppAction;
    }

    totalX += posX;
    const airborne = pd.isAirborne === true || isAirborne(actionState);
    const onLedge = isOnLedge(actionState);
    // Platform = elevated position but NOT airborne (standing on platform, not jumping above it)
    if (isOnPlatform(posY, stageId) && !airborne && !onLedge) platformFrames++;
    if (airborne) airFrames++;
    if (onLedge) ledgeFrames++;
    if (isDashDancing(actionState)) dashDanceFrameCount++;
  }

  // Close any still-open pressure sequence
  if (inPressureSequence) {
    totalShieldDamageDealt += currentSequenceShieldDamage;
  }

  const avgX = playableFrames > 0 ? totalX / playableFrames : 0;
  // Normalize to roughly -1..1 (divide by typical stage half-width)
  const bounds = stageBounds(stageId);
  const normalizedX =
    Math.round((avgX / bounds.x) * 10000) / 10000;

  // Defense & recovery
  const totalDamageTaken = playerStocks.reduce((sum, s) => {
    const end = s.endPercent ?? s.currentPercent;
    return sum + (end - s.startPercent);
  }, 0);

  // Detect deaths — deathAnimation can be 0 for real deaths, so also check
  // kill conversions that end on the same frame as the stock
  const deaths = playerStocks.filter(
    (s) =>
      (s.deathAnimation != null && s.deathAnimation !== 0) ||
      (s.endFrame != null &&
        allConversions.some(
          (c) =>
            c.playerIndex === playerIndex &&
            c.didKill &&
            c.endFrame != null &&
            Math.abs((c.endFrame ?? 0) - (s.endFrame ?? 0)) < 10,
        )),
  );
  const avgDeathPercent =
    deaths.length > 0
      ? Math.round(
          deaths.reduce((s, st) => s + (st.endPercent ?? st.currentPercent), 0) /
            deaths.length,
        )
      : 0;

  // Recovery: count times player was knocked into a recovery situation.
  // Only count when player is below stage level OR far past the edge AND
  // in hitstun/tumble/freefall (not just voluntarily jumping near ledge).
  let recoveryAttempts = 0;
  let recoverySuccesses = 0;
  let inRecovery = false;
  let prevStocks = -1;
  const recoveryBounds = stageBounds(stageId);

  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const frame = frames[f];
    if (!frame) continue;
    const pd = frame.players[playerIndex]?.post;
    if (!pd) continue;

    const currentStocks = pd.stocksRemaining ?? 0;

    // Detect stock loss during recovery — death, not a successful recovery
    if (prevStocks > 0 && currentStocks < prevStocks && inRecovery) {
      inRecovery = false;
      // Don't increment recoverySuccesses — player died
    }
    prevStocks = currentStocks;

    if (currentStocks <= 0) continue;

    const posX = pd.positionX ?? 0;
    const posY = pd.positionY ?? 0;
    const actionState = pd.actionStateId ?? 0;

    // Below stage level = clearly needs to recover
    const belowStage = posY < recoveryBounds.yMin;
    // Far past edge in a vulnerable state (tumble, damage, freefall)
    const farOffstage = Math.abs(posX) > recoveryBounds.x + 20;
    const inVulnerableState =
      actionState === State.DAMAGE_FALL ||
      (actionState >= State.DAMAGE_START && actionState <= State.DAMAGE_END) ||
      actionState === State.LANDING_FALL_SPECIAL; // freefall after up-b

    const needsRecovery = belowStage || (farOffstage && inVulnerableState);
    const onStage = !isOffstage(posX, posY, stageId);

    if (needsRecovery && !inRecovery) {
      recoveryAttempts++;
      inRecovery = true;
    } else if (onStage && inRecovery) {
      recoverySuccesses++;
      inRecovery = false;
    }
  }

  const recoverySuccessRate = ratio(recoverySuccesses, recoveryAttempts);

  // Edgeguard tracking: count times opponent entered a recovery situation
  // and whether they died or returned to stage.
  let edgeguardAttempts = 0;
  let edgeguardKills = 0;
  let opponentInRecovery = false;
  let prevOppStocks = -1; // track stock transitions to detect mid-game deaths

  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const frame = frames[f];
    if (!frame) continue;
    const oppPost = frame.players[opponentIndex]?.post;
    if (!oppPost) continue;

    const currentStocks = oppPost.stocksRemaining ?? 0;

    // Detect stock loss (opponent died) — works for all deaths, not just last stock
    if (prevOppStocks > 0 && currentStocks < prevOppStocks) {
      if (opponentInRecovery) {
        edgeguardKills++;
        opponentInRecovery = false;
      }
    }
    prevOppStocks = currentStocks;

    if (currentStocks <= 0) continue;

    const oppX = oppPost.positionX ?? 0;
    const oppY = oppPost.positionY ?? 0;
    const oppAction = oppPost.actionStateId ?? 0;

    const oppBelowStage = oppY < recoveryBounds.yMin;
    const oppFarOffstage = Math.abs(oppX) > recoveryBounds.x + 20;
    const oppVulnerable =
      oppAction === State.DAMAGE_FALL ||
      (oppAction >= State.DAMAGE_START && oppAction <= State.DAMAGE_END) ||
      oppAction === State.LANDING_FALL_SPECIAL;

    const oppNeedsRecovery = oppBelowStage || (oppFarOffstage && oppVulnerable);
    const oppOnStage = !isOffstage(oppX, oppY, stageId);

    if (oppNeedsRecovery && !opponentInRecovery) {
      edgeguardAttempts++;
      opponentInRecovery = true;
    } else if (oppOnStage && opponentInRecovery) {
      opponentInRecovery = false;
    }
  }

  const edgeguardSuccessRate = ratio(edgeguardKills, edgeguardAttempts);

  // L-cancel rate
  const lTotal =
    actionCounts.lCancelCount.success + actionCounts.lCancelCount.fail;
  const lCancelRate = ratio(actionCounts.lCancelCount.success, lTotal);

  // Move usage — build from attack counts + conversion move data
  // Count from action counts (attacks thrown out)
  // Names must match moveIdToName so hit counting from conversions lines up
  const atk = actionCounts.attackCount;
  const attackEntries: [string, number][] = [
    ["jab", atk.jab1 + atk.jab2 + atk.jab3],
    ["rapid jab", atk.jabm],
    ["dash attack", atk.dash],
    ["ftilt", atk.ftilt],
    ["utilt", atk.utilt],
    ["dtilt", atk.dtilt],
    ["fsmash", atk.fsmash],
    ["usmash", atk.usmash],
    ["dsmash", atk.dsmash],
    ["nair", atk.nair],
    ["fair", atk.fair],
    ["bair", atk.bair],
    ["uair", atk.uair],
    ["dair", atk.dair],
  ];

  // Count total uses per move name from attackCount
  const moveUsageMap = new Map<string, { count: number; hits: number }>();

  for (const [name, count] of attackEntries) {
    if (count === 0) continue;
    const existing = moveUsageMap.get(name) ?? { count: 0, hits: 0 };
    existing.count += count;
    moveUsageMap.set(name, existing);
  }

  // Add grabs
  const totalGrabs =
    actionCounts.grabCount.success + actionCounts.grabCount.fail;
  if (totalGrabs > 0) {
    moveUsageMap.set("grab", {
      count: totalGrabs,
      hits: actionCounts.grabCount.success,
    });
  }

  // Count hits from conversions to compute hit rates
  // myConversions has conversions where opponent is victim; moves inside are by this player
  for (const conv of myConversions) {
    for (const move of conv.moves) {
      const name = moveIdToName[move.moveId] ?? getMoveName(move.moveId);
      const existing = moveUsageMap.get(name);
      if (existing) {
        existing.hits += move.hitCount;
      }
    }
  }

  // For moves where we don't have separate "thrown out" vs "connected" data,
  // estimate hit rate from conversion data
  const moveUsage = [...moveUsageMap.entries()]
    .map(([move, data]) => ({
      move,
      count: data.count,
      hitRate: data.count > 0 ? Math.min(1, ratio(data.hits, data.count)) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Stock-by-stock breakdown
  // conversion.playerIndex = victim. For this player's stocks:
  // - killMove: conversion where THIS player is victim (c.playerIndex === playerIndex)
  // - openingsGiven: conversions where THIS player is victim
  // - damageDealt: conversions where OPPONENT is victim (myConversions)
  const stockBreakdown = playerStocks.map((stock, i) => {
    const stockNum = stock.count;

    // Find what killed this player — conversion where THIS player is the victim
    // Do this first to help determine if the stock ended in death
    let killingConversion: ConversionType | undefined;
    if (stock.endFrame != null) {
      killingConversion = allConversions.find(
        (c) =>
          c.playerIndex === playerIndex &&
          c.didKill &&
          c.endFrame != null &&
          Math.abs((c.endFrame ?? 0) - (stock.endFrame ?? 0)) < 10,
      );
    }

    // Detect death: deathAnimation is sometimes 0 even for real deaths
    const died =
      (stock.deathAnimation != null && stock.deathAnimation !== 0) ||
      killingConversion != null;
    const percentLost = died
      ? (stock.endPercent ?? stock.currentPercent)
      : stock.currentPercent;

    let killMove: string | null = null;
    if (died) {
      if (killingConversion && killingConversion.moves.length > 0) {
        const lastMove =
          killingConversion.moves[killingConversion.moves.length - 1]!;
        killMove =
          moveIdToName[lastMove.moveId] ?? getMoveName(lastMove.moveId);
      }
    }

    // Duration
    const startF = stock.startFrame;
    const endF = stock.endFrame ?? lastFrame;
    const duration = framesToSeconds(endF - startF);

    // Openings given = conversions where THIS player is victim during this stock
    const openingsGiven = allConversions.filter(
      (c) =>
        c.playerIndex === playerIndex &&
        c.startFrame >= startF &&
        c.startFrame <= endF,
    ).length;

    // Damage dealt = conversions where OPPONENT is victim during this stock
    const damageDealt = myConversions
      .filter(
        (c) => c.startFrame >= startF && c.startFrame <= endF,
      )
      .reduce(
        (sum, c) => sum + ((c.endPercent ?? c.currentPercent) - c.startPercent),
        0,
      );

    return {
      stockNumber: stockNum,
      percentLost: Math.round(percentLost),
      killMove,
      duration,
      openingsGiven,
      damageDealt: Math.round(damageDealt),
      startTime: frameToTimestamp(startF),
      endTime: frameToTimestamp(endF),
    };
  });

  // ── Peach turnip pull tracking ────────────────────────────────────
  let turnipPulls: TurnipPullStats | null = null;

  if (player.characterId === PEACH_CHARACTER_ID) {
    const seenSpawnIds = new Set<number>();
    const faceCounts = new Map<number, number>();
    const rareItemCounts = new Map<string, number>();
    let totalPulls = 0;
    let turnipsHit = 0;

    for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
      const items = frames[f]?.items;
      if (!items) continue;

      for (const item of items) {
        if (item.owner !== playerIndex) continue;
        const spawnId = item.spawnId;
        if (spawnId == null || seenSpawnIds.has(spawnId)) continue;
        seenSpawnIds.add(spawnId);

        const typeId = item.typeId ?? -1;

        if (typeId === TURNIP_TYPE_ID) {
          totalPulls++;
          const face = item.turnipFace ?? 0;
          faceCounts.set(face, (faceCounts.get(face) ?? 0) + 1);
        } else if (PEACH_RARE_ITEMS[typeId]) {
          totalPulls++;
          const name = PEACH_RARE_ITEMS[typeId]!;
          rareItemCounts.set(name, (rareItemCounts.get(name) ?? 0) + 1);
        }
      }
    }

    // Detect turnip hits from conversion data.
    // In Melee, item throw hits register as moveId 1 ("misc") in slippi-js.
    // Count conversion moves with moveId 1 where Peach is the attacker.
    // (conversions where opponent is victim = playerIndex !== this player)
    const ITEM_THROW_MOVE_ID = 1;
    for (const conv of myConversions) {
      for (const move of conv.moves) {
        if (move.moveId === ITEM_THROW_MOVE_ID) {
          turnipsHit++;
        }
      }
    }

    if (totalPulls > 0) {
      const faces = [...faceCounts.entries()]
        .map(([face, count]) => ({ face: TURNIP_FACE_NAMES[face] ?? `face ${face}`, count }))
        .sort((a, b) => b.count - a.count);

      const rareItems = [...rareItemCounts.entries()]
        .map(([item, count]) => ({ item, count }))
        .sort((a, b) => b.count - a.count);

      // Hit rate: item throw hits / total turnip pulls (not counting rare items)
      const turnipCount = [...faceCounts.values()].reduce((a, b) => a + b, 0);

      turnipPulls = {
        totalPulls,
        faces,
        turnipsHit,
        hitRate: turnipCount > 0 ? ratio(turnipsHit, turnipCount) : 0,
        rareItems,
      };
    }
  }

  const kenCombos = detectKenCombos(player.characterId, myConversions);

  // ── Shield pressure stats ──────────────────────────────────────────
  const shieldPressure = {
    sequenceCount: shieldPressureSequences,
    avgShieldDamage: shieldPressureSequences > 0
      ? Math.round((totalShieldDamageDealt / shieldPressureSequences) * 100) / 100
      : 0,
    shieldBreaks,
    shieldPokeRate: totalShieldHits > 0 ? ratio(shieldPokeHits, totalShieldHits) : 0,
  };

  // ── DI quality estimation ─────────────────────────────────────────
  // conversion.playerIndex = VICTIM. So:
  //   conversions where I am the victim: c.playerIndex === playerIndex
  //   conversions where opponent is the victim: c.playerIndex !== playerIndex (= myConversions)
  const conversionsReceived = allConversions.filter(
    (c) => c.playerIndex === playerIndex && c.moves.length > 0,
  );
  const avgComboLengthReceived = conversionsReceived.length > 0
    ? Math.round(
        (conversionsReceived.reduce((sum, c) => sum + c.moves.length, 0) /
          conversionsReceived.length) *
          100,
      ) / 100
    : 0;

  const myConversionsWithMoves = myConversions.filter((c) => c.moves.length > 0);
  const avgComboLengthDealt = myConversionsWithMoves.length > 0
    ? Math.round(
        (myConversionsWithMoves.reduce((sum, c) => sum + c.moves.length, 0) /
          myConversionsWithMoves.length) *
          100,
      ) / 100
    : 0;

  // comboDIScore: how effectively this player escapes combos via DI.
  // Heuristic: compare received combo length against dealt combo length.
  // If you receive shorter combos than you deal, your DI is relatively good.
  // Baseline expectation: avgComboLengthReceived ~ avgComboLengthDealt.
  // Score 0.5 = average DI, >0.5 = good DI (escaping early), <0.5 = poor DI.
  // Uses a sigmoid-like mapping centered on the ratio.
  let comboDIScore = 0.5;
  if (avgComboLengthDealt > 0 && avgComboLengthReceived > 0) {
    // ratio < 1 = you escape faster than opponent (good DI)
    // ratio > 1 = you get comboed harder than opponent (bad DI)
    const comboRatio = avgComboLengthReceived / avgComboLengthDealt;
    // Map: ratio 0.5 → 1.0, ratio 1.0 → 0.5, ratio 2.0 → 0.0
    // Using clamped linear: score = 1 - (comboRatio - 0.5) / 1.5
    comboDIScore = Math.max(0, Math.min(1,
      Math.round((1 - (comboRatio - 0.5) / 1.5) * 10000) / 10000,
    ));
  } else if (conversionsReceived.length === 0 && myConversionsWithMoves.length > 0) {
    // Never got comboed — perfect DI score
    comboDIScore = 1;
  }

  // survivalDIScore: how long the player survives before dying.
  // Higher average death percent relative to a baseline = better survival DI.
  // Baseline depends on character weight class, but we use a universal heuristic:
  //   - Typical death percent range: 60% (very light / poor DI) to 160% (heavy / great DI)
  //   - Map avgDeathPercent into 0..1 within that range
  // Only counts actual deaths (avgDeathPercent > 0 means deaths occurred).
  let survivalDIScore = 0.5;
  if (avgDeathPercent > 0) {
    const DEATH_PCT_LOW = 60;   // poor survival baseline
    const DEATH_PCT_HIGH = 160; // excellent survival baseline
    survivalDIScore = Math.max(0, Math.min(1,
      Math.round(
        ((avgDeathPercent - DEATH_PCT_LOW) / (DEATH_PCT_HIGH - DEATH_PCT_LOW)) * 10000,
      ) / 10000,
    ));
  } else if (deaths.length === 0) {
    // Never died — perfect survival DI
    survivalDIScore = 1;
  }

  const diQuality = {
    survivalDIScore,
    comboDIScore,
    avgComboLengthReceived,
    avgComboLengthDealt,
  };

  return {
    tag,
    connectCode,
    character,
    neutralWins,
    neutralLosses,
    counterHits,
    neutralWinRate,
    openingsPerKill: Math.round(openingsPerKill * 100) / 100,
    totalOpenings,
    totalConversions,
    conversionRate,
    averageDamagePerOpening: Math.round(averageDamagePerOpening * 100) / 100,
    killConversions,
    avgStagePosition: { x: normalizedX },
    timeOnPlatform: ratio(platformFrames, playableFrames),
    timeInAir: ratio(airFrames, playableFrames),
    timeAtLedge: ratio(ledgeFrames, playableFrames),
    totalDamageTaken: Math.round(totalDamageTaken),
    avgDeathPercent,
    recoveryAttempts,
    recoverySuccessRate,
    edgeguardAttempts,
    edgeguardSuccessRate,
    lCancelRate,
    wavedashCount: actionCounts.wavedashCount,
    dashDanceFrames: dashDanceFrameCount,
    powerShieldCount,
    shieldPressure,
    diQuality,
    moveUsage,
    stocks: stockBreakdown,
    turnipPulls,
    kenCombos,
    signatureStats: detectSignatureStats(
      character,
      playerIndex,
      myConversions,
      moveUsageMap,
      turnipPulls,
      kenCombos,
      frames,
      lastFrame,
      stageId,
      allConversions,
    ),
  };
}
