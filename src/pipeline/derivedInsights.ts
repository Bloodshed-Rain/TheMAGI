import { type FramesType, type StatsType, type ConversionType, type StockType } from "@slippi/slippi-js/node";

import type { DerivedInsights, HabitProfile } from "./types.js";
import type { GameFrameEvents, HabitInstance, HabitSituation, PlayerSlot } from "./frameEvents.js";
import { ratio, entropy, frameToTimestamp, moveIdToName, getMoveName } from "./helpers.js";
import { isOffstageKill } from "./killEvidence.js";

// ── Derived insights ──────────────────────────────────────────────────

/**
 * Aggregate per-instance habit choices (from frameEvents) into the legacy
 * HabitProfile shape. Single source of truth for situation/option detection
 * lives in frameEvents.ts — this replaced the old aggregate-only walkers,
 * whose ledge classifier used wrong action-state IDs (250/254/256).
 */
function buildHabitProfile(habits: HabitInstance[], playerSlot: PlayerSlot, situation: HabitSituation): HabitProfile {
  const counts = new Map<string, number>();
  for (const h of habits) {
    if (h.playerSlot !== playerSlot || h.situation !== situation) continue;
    counts.set(h.option, (counts.get(h.option) ?? 0) + 1);
  }

  const options = [...counts.entries()]
    .map(([action, frequency]) => ({ action, frequency }))
    .sort((a, b) => b.frequency - a.frequency);

  return { options, entropy: entropy(options) };
}

function computePerformanceByStock(
  playerIndex: number,
  playerStocks: StockType[],
  conversions: ConversionType[],
  opponentIndex: number,
  lastFrame: number,
): DerivedInsights["performanceByStock"] {
  return playerStocks.map((stock) => {
    const startF = stock.startFrame;
    const endF = stock.endFrame ?? lastFrame;

    // conversion.playerIndex = victim
    // My attacks (opponent is victim); opponent's attacks (I am victim)
    const myAttacks = conversions.filter(
      (c) => c.playerIndex === opponentIndex && c.startFrame >= startF && c.startFrame <= endF,
    );
    const oppAttacks = conversions.filter(
      (c) => c.playerIndex === playerIndex && c.startFrame >= startF && c.startFrame <= endF,
    );

    const dmgDealt = myAttacks.reduce((s, c) => s + ((c.endPercent ?? c.currentPercent) - c.startPercent), 0);
    const dmgTaken = oppAttacks.reduce((s, c) => s + ((c.endPercent ?? c.currentPercent) - c.startPercent), 0);

    // Neutral win rate per stock uses the same opening type as the headline
    // stat (slippi-js "neutral-win"), so counter-attacks and trades do not
    // inflate it.
    const myNeutralWins = myAttacks.filter((c) => c.openingType === "neutral-win").length;
    const oppNeutralWins = oppAttacks.filter((c) => c.openingType === "neutral-win").length;

    return {
      stock: stock.count,
      neutralWinRate: ratio(myNeutralWins, myNeutralWins + oppNeutralWins),
      damageEfficiency: dmgTaken > 0 ? Math.round((dmgDealt / dmgTaken) * 100) / 100 : dmgDealt > 0 ? 999 : 0,
    };
  });
}

function findBestConversion(
  conversions: ConversionType[],
  playerIndex: number,
  opponentIndex: number,
): DerivedInsights["bestConversion"] {
  // conversion.playerIndex = victim. My best conversion = opponent is victim.
  const playerConvs = conversions.filter((c) => c.playerIndex === opponentIndex && c.moves.length > 0);

  let best: ConversionType | undefined;
  let bestDmg = 0;

  for (const c of playerConvs) {
    const dmg = (c.endPercent ?? c.currentPercent) - c.startPercent;
    if (dmg > bestDmg || (dmg === bestDmg && c.didKill)) {
      bestDmg = dmg;
      best = c;
    }
  }

  if (!best) {
    return {
      moves: [],
      totalDamage: 0,
      startPercent: 0,
      endedInKill: false,
      timestamp: "0:00",
    };
  }

  return {
    moves: best.moves.map((m) => moveIdToName[m.moveId] ?? getMoveName(m.moveId)),
    totalDamage: Math.round(bestDmg),
    startPercent: Math.round(best.startPercent),
    endedInKill: best.didKill,
    timestamp: frameToTimestamp(best.startFrame),
  };
}

function findWorstMissedPunish(
  conversions: ConversionType[],
  playerIndex: number,
  opponentIndex: number,
): DerivedInsights["worstMissedPunish"] {
  // conversion.playerIndex = victim. My missed punish = opponent is victim but I did low damage.
  const playerConvs = conversions.filter((c) => c.playerIndex === opponentIndex && c.moves.length > 0);

  let worst: ConversionType | undefined;
  let worstScore = -Infinity;

  for (const c of playerConvs) {
    const dmg = (c.endPercent ?? c.currentPercent) - c.startPercent;
    if (dmg >= 10) continue; // Not a missed punish
    if (c.didKill) continue;

    // Score = opponent percent at time (higher = worse missed opportunity)
    const opponentPercent = c.startPercent;
    const score = opponentPercent - dmg; // Higher opponent % + lower damage = worse
    if (score > worstScore) {
      worstScore = score;
      worst = c;
    }
  }

  if (!worst) return null;

  const firstMove = worst.moves[0]!;
  return {
    opener: moveIdToName[firstMove.moveId] ?? getMoveName(firstMove.moveId),
    damageDealt: Math.round((worst.endPercent ?? worst.currentPercent) - worst.startPercent),
    opponentPercent: Math.round(worst.startPercent),
    timestamp: frameToTimestamp(worst.startFrame),
  };
}

export function buildDerivedInsights(
  playerIndex: number,
  opponentIndex: number,
  stats: StatsType,
  frames: FramesType,
  lastFrame: number,
  stageId: number,
  frameEvents: GameFrameEvents,
  playerSlot: PlayerSlot,
): DerivedInsights {
  const playerStocks = stats.stocks.filter((s) => s.playerIndex === playerIndex);

  const afterKnockdown = buildHabitProfile(frameEvents.habits, playerSlot, "knockdown");

  const afterLedgeGrab = buildHabitProfile(frameEvents.habits, playerSlot, "ledge");

  const afterShieldPressure = buildHabitProfile(frameEvents.habits, playerSlot, "oos");

  const performanceByStock = computePerformanceByStock(
    playerIndex,
    playerStocks,
    stats.conversions,
    opponentIndex,
    lastFrame,
  );

  const bestConversion = findBestConversion(stats.conversions, playerIndex, opponentIndex);
  const worstMissedPunish = findWorstMissedPunish(stats.conversions, playerIndex, opponentIndex);

  // Build chronological timeline of key moments for timestamp-backed analysis
  const keyMoments: DerivedInsights["keyMoments"] = [];

  // Kills the player landed (opponent is victim + didKill)
  for (const c of stats.conversions) {
    if (c.playerIndex === opponentIndex && c.didKill && c.moves.length > 0) {
      const lastMove = c.moves[c.moves.length - 1]!;
      const moveName = moveIdToName[lastMove.moveId] ?? getMoveName(lastMove.moveId);
      const dmg = Math.round((c.endPercent ?? c.currentPercent) - c.startPercent);
      // Edgeguard kill = the final hit landed with the opponent already
      // offstage and they did not die off the top (killEvidence.ts). The
      // victim's position on the stock-loss frame is the blast zone for every
      // death, so it must not be used here.
      const offstageKill = isOffstageKill(c, frames, stageId);

      // startPercent is where the kill CONVERSION began, not where the
      // finishing move landed; endPercent is the opponent's percent at death.
      keyMoments.push({
        timestamp: frameToTimestamp(c.startFrame),
        frame: c.startFrame,
        type: offstageKill ? "edgeguard_kill" : "kill",
        description: `Took a stock: conversion from ${Math.round(c.startPercent)}% finished with ${moveName} (${c.moves.length} hits, ${dmg}%; opponent died at ${Math.round(c.endPercent ?? c.currentPercent)}%)`,
      });
    }
  }

  // Deaths the player suffered (player is victim + didKill)
  for (const c of stats.conversions) {
    if (c.playerIndex === playerIndex && c.didKill && c.moves.length > 0) {
      const lastMove = c.moves[c.moves.length - 1]!;
      const moveName = moveIdToName[lastMove.moveId] ?? getMoveName(lastMove.moveId);

      // Measured DI: attach the stick-input verdict for this death when the
      // kill conversion lines up with a died stock record.
      const stock = frameEvents.stocks.find(
        (s) =>
          s.victimSlot === playerSlot &&
          s.died &&
          s.endFrame != null &&
          c.endFrame != null &&
          Math.abs(s.endFrame - c.endFrame) < 15,
      );
      const verdictText =
        stock?.verdict === "NO_DI"
          ? " — no DI input"
          : stock?.verdict === "WRONG_DI"
            ? ` — DI with no survival benefit (score ${stock.diScore ?? 0})`
            : stock?.verdict === "OK_DI"
              ? " — partial survival DI"
              : stock?.verdict === "GOOD_DI"
                ? " — good survival DI"
                : stock?.verdict === "FAILED_RECOVERY"
                  ? " — not hit again after that; did not make it back (no DI to grade)"
                  : "";
      const resourceText = stock?.resourceFault ? " (double jump unused)" : "";
      const deathPercent = Math.round(stock?.deathPercent ?? c.endPercent ?? c.currentPercent);

      keyMoments.push({
        timestamp: frameToTimestamp(c.startFrame),
        frame: c.startFrame,
        type: "death",
        description: `Lost a stock at ${deathPercent}%: opponent's conversion from ${Math.round(c.startPercent)}% ended with ${moveName}${verdictText}${resourceText}`,
      });
    }
  }

  // Big punishes the player landed (≥40% damage in one conversion)
  for (const c of stats.conversions) {
    if (c.playerIndex === opponentIndex && c.moves.length > 0) {
      const dmg = (c.endPercent ?? c.currentPercent) - c.startPercent;
      if (dmg >= 40 && !c.didKill) {
        const moves = c.moves.map((m) => moveIdToName[m.moveId] ?? getMoveName(m.moveId));
        const opener = moves[0] ?? "unknown";
        keyMoments.push({
          timestamp: frameToTimestamp(c.startFrame),
          frame: c.startFrame,
          type: "big_punish",
          description: `${Math.round(dmg)}% punish starting with ${opener} (${moves.length} hits, opponent at ${Math.round(c.startPercent)}%)`,
        });
      }
    }
  }

  // Low-yield openings: an opening at high % that did <15% and didn't kill.
  // Type kept as "missed_punish" for consumers; the text states only what was
  // observed — the data does not establish that a bigger punish was available.
  for (const c of stats.conversions) {
    if (c.playerIndex === opponentIndex && c.moves.length > 0 && c.startPercent >= 80 && !c.didKill) {
      const dmg = (c.endPercent ?? c.currentPercent) - c.startPercent;
      if (dmg < 15) {
        const opener = moveIdToName[c.moves[0]!.moveId] ?? getMoveName(c.moves[0]!.moveId);
        keyMoments.push({
          timestamp: frameToTimestamp(c.startFrame),
          frame: c.startFrame,
          type: "missed_punish",
          description: `Low-yield opening: ${opener} with opponent at ${Math.round(c.startPercent)}% led to only ${Math.round(dmg)}% and no kill`,
        });
      }
    }
  }

  // Sort chronologically
  keyMoments.sort((a, b) => a.frame - b.frame);

  return {
    afterKnockdown,
    afterLedgeGrab,
    afterShieldPressure,
    performanceByStock,
    bestConversion,
    worstMissedPunish,
    keyMoments,
    adaptationSignals: [], // Only for multi-game sets
  };
}
