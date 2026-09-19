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
import type { PlayerSummary, KenComboStats } from "./types.js";
import {
 getPlayerTag,
 getCharacterName,
 getMoveName,
 ratio,
 ratioOrNull,
 framesToSeconds,
 frameToTimestamp,
 isAirborne,
 isOnLedge,
 isOnPlatform,
 isOffstage,
 isDashDancing,
 stageBounds,
 moveIdToName,
 GUARD_ON,
 GUARD,
 GUARD_SET_OFF,
 GUARD_REFLECT,
 SHIELD_BREAK_FLY,
 FULL_SHIELD_SIZE,
 SHIELD_POKE_THRESHOLD,
} from "./helpers.js";
import { detectSignatureStats } from "./signatureStats.js";
import {
 getCharacterData,
 computeComboDIScore,
 computeSurvivalDIScore,
 getComboGameStrength,
} from "./characterData.js";
import { PEACH_CHARACTER_ID, collectPeachTurnipPullStats } from "../peachItems.js";
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
  if (hasFair && lastMoveId === DAIR_MOVE_ID) {
   const moveNames = conv.moves.map((m) => moveIdToName[m.moveId] ?? getMoveName(m.moveId));
   const totalDamage = Math.round((conv.endPercent ?? conv.currentPercent) - conv.startPercent);
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
 opponentCharacterId: number | undefined,
): PlayerSummary {
 const tag = getPlayerTag(player);
 const connectCode = player.connectCode || "";
 const character = getCharacterName(player.characterId);
 const neutralWins = overall.neutralWinRatio.count;
 const neutralTotal = overall.neutralWinRatio.total;
 const neutralLosses = neutralTotal - neutralWins;
 const counterHits = overall.counterHitRatio.count;
 const neutralWinRate = ratio(neutralWins, neutralTotal);
 const openingsPerKill = overall.openingsPerKill.ratio ?? 0;
 const totalOpenings = overall.openingsPerKill.count;
 const myConversions = conversions.filter((c) => c.playerIndex !== playerIndex);
 const totalConversions = overall.successfulConversions.count;
 const conversionRate = ratio(totalConversions, overall.successfulConversions.total);
 const averageDamagePerOpening = overall.damagePerOpening.ratio ?? 0;
 const killConversions = myConversions.filter((c) => c.didKill).length;
 let totalX = 0;
 let platformFrames = 0;
 let airFrames = 0;
 let ledgeFrames = 0;
 let dashDanceFrameCount = 0;
 let playableFrames = 0;
 let powerShieldCount = 0;
 let shieldRaisedAtFrame = -1;
 let prevActionState = 0;
 let shieldPressureSequences = 0;
 let totalShieldDamageDealt = 0;
 let shieldBreaks = 0;
 let shieldPokeHits = 0;
 let totalShieldHits = 0;
 let inPressureSequence = false;
 let currentSequenceShieldDamage = 0;
 let prevOppShieldSize = -1;
 let prevOppActionState = 0;
 let prevOppShielding = false;
 let framesWithoutShieldHit = 0;
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
  const inShield = actionState === GUARD_REFLECT || actionState === GUARD_ON || actionState === GUARD;
  const wasInShield = prevActionState === GUARD_REFLECT || prevActionState === GUARD_ON || prevActionState === GUARD;
  if (inShield && !wasInShield) {
   shieldRaisedAtFrame = f;
  }
  if (
   actionState === GUARD_SET_OFF &&
   prevActionState !== GUARD_SET_OFF &&
   shieldRaisedAtFrame >= 0 &&
   f - shieldRaisedAtFrame <= 4
  ) {
   powerShieldCount++;
  }
  if (!inShield && actionState !== GUARD_SET_OFF) {
   shieldRaisedAtFrame = -1;
  }
  prevActionState = actionState;
  const oppPost = frame.players[opponentIndex]?.post;
  if (oppPost) {
   const oppAction = oppPost.actionStateId ?? 0;
   const oppShield = oppPost.shieldSize ?? FULL_SHIELD_SIZE;
   const oppStocks = oppPost.stocksRemaining ?? 0;
   if (oppAction === SHIELD_BREAK_FLY && prevOppActionState !== SHIELD_BREAK_FLY && oppStocks > 0) {
    shieldBreaks++;
    if (inPressureSequence) {
     totalShieldDamageDealt += currentSequenceShieldDamage;
     currentSequenceShieldDamage = 0;
     inPressureSequence = false;
    }
   }
   const oppShielding = oppAction === GUARD_ON || oppAction === GUARD || oppAction === GUARD_SET_OFF;
   let shieldHitThisFrame = false;
   if (oppShielding && prevOppShielding && prevOppShieldSize >= 0) {
    const shieldLost = prevOppShieldSize - oppShield;
    if (shieldLost > 0.5) {
     shieldHitThisFrame = true;
     totalShieldHits++;
     if (!inPressureSequence) {
      shieldPressureSequences++;
      inPressureSequence = true;
      currentSequenceShieldDamage = 0;
     }
     currentSequenceShieldDamage += shieldLost;
     framesWithoutShieldHit = 0;
     if (oppShield < SHIELD_POKE_THRESHOLD) {
      shieldPokeHits++;
     }
    }
   }
   if (oppShielding) {
    prevOppShieldSize = oppShield;
   } else {
    prevOppShieldSize = -1;
   }
   prevOppShielding = oppShielding;
   if (inPressureSequence && !shieldHitThisFrame) {
    framesWithoutShieldHit++;
    if (framesWithoutShieldHit > PRESSURE_GAP_TOLERANCE) {
     totalShieldDamageDealt += currentSequenceShieldDamage;
     currentSequenceShieldDamage = 0;
     inPressureSequence = false;
     framesWithoutShieldHit = 0;
    }
   }
   prevOppActionState = oppAction;
  }
  totalX += posX;
  const airborne = pd.isAirborne === true || isAirborne(actionState);
  const onLedge = isOnLedge(actionState);
  if (isOnPlatform(posY, stageId) && !airborne && !onLedge) platformFrames++;
  if (airborne) airFrames++;
  if (onLedge) ledgeFrames++;
  if (isDashDancing(actionState)) dashDanceFrameCount++;
 }
 if (inPressureSequence) {
  totalShieldDamageDealt += currentSequenceShieldDamage;
 }
 const avgX = playableFrames > 0 ? totalX / playableFrames : 0;
 const bounds = stageBounds(stageId);
 const normalizedX = Math.round((avgX / bounds.x) * 10000) / 10000;
 const totalDamageTaken = playerStocks.reduce((sum, s) => {
  const end = s.endPercent ?? s.currentPercent;
  return sum + (end - s.startPercent);
 }, 0);
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
   ? Math.round(deaths.reduce((s, st) => s + (st.endPercent ?? st.currentPercent), 0) / deaths.length)
   : 0;
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
  if (prevStocks > 0 && currentStocks < prevStocks && inRecovery) {
   inRecovery = false;
  }
  prevStocks = currentStocks;
  if (currentStocks <= 0) continue;
  const posX = pd.positionX ?? 0;
  const posY = pd.positionY ?? 0;
  const actionState = pd.actionStateId ?? 0;
  const belowStage = posY < recoveryBounds.yMin;
  const farOffstage = Math.abs(posX) > recoveryBounds.x + 20;
  const inVulnerableState =
   actionState === State.DAMAGE_FALL ||
   (actionState >= State.DAMAGE_START && actionState <= State.DAMAGE_END) ||
   actionState === State.LANDING_FALL_SPECIAL;
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
 const recoverySuccessRate = ratioOrNull(recoverySuccesses, recoveryAttempts);
 let edgeguardAttempts = 0;
 let edgeguardKills = 0;
 let opponentInRecovery = false;
 let prevOppStocks = -1;
 for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
  const frame = frames[f];
  if (!frame) continue;
  const oppPost = frame.players[opponentIndex]?.post;
  if (!oppPost) continue;
  const currentStocks = oppPost.stocksRemaining ?? 0;
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
 const edgeguardSuccessRate = ratioOrNull(edgeguardKills, edgeguardAttempts);
 const lTotal = actionCounts.lCancelCount.success + actionCounts.lCancelCount.fail;
 const lCancelRate = ratioOrNull(actionCounts.lCancelCount.success, lTotal);
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
 const moveUsageMap = new Map<string, { count: number; hits: number }>();
 for (const [name, count] of attackEntries) {
  if (count === 0) continue;
  const existing = moveUsageMap.get(name) ?? { count: 0, hits: 0 };
  existing.count += count;
  moveUsageMap.set(name, existing);
 }
 const totalGrabs = actionCounts.grabCount.success + actionCounts.grabCount.fail;
 if (totalGrabs > 0) {
  moveUsageMap.set("grab", {
   count: totalGrabs,
   hits: actionCounts.grabCount.success,
  });
 }
 for (const conv of myConversions) {
  for (const move of conv.moves) {
   const name = moveIdToName[move.moveId] ?? getMoveName(move.moveId);
   const existing = moveUsageMap.get(name);
   if (existing) {
    existing.hits += move.hitCount;
   }
  }
 }
 const moveUsage = [...moveUsageMap.entries()]
  .map(([move, data]) => ({
   move,
   count: data.count,
   hitRate: data.count > 0 ? Math.min(1, ratio(data.hits, data.count)) : 0,
  }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 10);
 const stockBreakdown = playerStocks.map((stock) => {
  const stockNum = stock.count;
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
  const died = (stock.deathAnimation != null && stock.deathAnimation !== 0) || killingConversion != null;
  const percentLost = died ? (stock.endPercent ?? stock.currentPercent) : stock.currentPercent;
  let killMove: string | null = null;
  if (died) {
   if (killingConversion && killingConversion.moves.length > 0) {
    const lastMove = killingConversion.moves[killingConversion.moves.length - 1]!;
    killMove = moveIdToName[lastMove.moveId] ?? getMoveName(lastMove.moveId);
   }
  }
  const startF = stock.startFrame;
  const endF = stock.endFrame ?? lastFrame;
  const duration = framesToSeconds(endF - startF);
  const openingsGiven = allConversions.filter(
   (c) => c.playerIndex === playerIndex && c.startFrame >= startF && c.startFrame <= endF,
  ).length;
  const damageDealt = myConversions
   .filter((c) => c.startFrame >= startF && c.startFrame <= endF)
   .reduce((sum, c) => sum + ((c.endPercent ?? c.currentPercent) - c.startPercent), 0);
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
 const turnipPulls =
  player.characterId === PEACH_CHARACTER_ID
   ? collectPeachTurnipPullStats({ frames, playerIndex, myConversions, lastFrame })
   : null;
 const kenCombos = detectKenCombos(player.characterId, myConversions);
 const shieldPressure = {
  sequenceCount: shieldPressureSequences,
  avgShieldDamage:
   shieldPressureSequences > 0 ? Math.round((totalShieldDamageDealt / shieldPressureSequences) * 100) / 100 : 0,
  shieldBreaks,
  shieldPokeRate: totalShieldHits > 0 ? ratio(shieldPokeHits, totalShieldHits) : 0,
 };
 const conversionsReceived = allConversions.filter((c) => c.playerIndex === playerIndex && c.moves.length > 0);
 const avgComboLengthReceived =
  conversionsReceived.length > 0
   ? Math.round(
     (conversionsReceived.reduce((sum, c) => sum + c.moves.length, 0) / conversionsReceived.length) * 100,
    ) / 100
   : 0;
 const myConversionsWithMoves = myConversions.filter((c) => c.moves.length > 0);
 const avgComboLengthDealt =
  myConversionsWithMoves.length > 0
   ? Math.round(
     (myConversionsWithMoves.reduce((sum, c) => sum + c.moves.length, 0) / myConversionsWithMoves.length) * 100,
    ) / 100
   : 0;
 const opponentCharacter = getCharacterName(opponentCharacterId);
 const playerPhysics = getCharacterData(character);
 const opponentStrength = getComboGameStrength(opponentCharacter);
 let comboDIScore = 0.5;
 if (avgComboLengthReceived > 0) {
  comboDIScore = computeComboDIScore(character, avgComboLengthReceived, opponentCharacter);
 } else if (conversionsReceived.length === 0 && myConversionsWithMoves.length > 0) {
  comboDIScore = 1;
 }
 let survivalDIScore = 0.5;
 if (avgDeathPercent > 0) {
  survivalDIScore = computeSurvivalDIScore(character, avgDeathPercent);
 } else if (deaths.length === 0) {
  survivalDIScore = 1;
 }
 const rawExpected = playerPhysics?.expectedComboLength[0] ?? 3.0;
 const expectedComboLength = Math.round(rawExpected * opponentStrength * 100) / 100;
 const diQuality = {
  comboDIScore,
  survivalDIScore,
  avgComboLengthReceived,
  avgComboLengthDealt,
  expectedComboLength,
  comboSusceptibility: (playerPhysics?.comboSusceptibility ?? 3) as 1 | 2 | 3 | 4 | 5,
  expectedDeathPercentRange: {
   low: playerPhysics?.expectedKillPercent[0] ?? 70,
   high: playerPhysics?.expectedKillPercent[1] ?? 150,
  },
  opponentComboStrength: opponentStrength,
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
