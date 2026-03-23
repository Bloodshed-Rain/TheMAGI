import type { GameSummary, GameResult, DerivedInsights, PlayerSummary } from "./types.js";
import { ratio } from "./helpers.js";

// ── Adaptation signals ────────────────────────────────────────────────

export function findPlayerIdx(
  gameSummary: GameSummary,
  playerIdentifier: string,
): 0 | 1 {
  const id = playerIdentifier.trim();
  if (!id) {
    console.warn("[findPlayerIdx] Empty player identifier — defaulting to player 0");
    return 0;
  }

  const idLower = id.toLowerCase();
  const p0 = gameSummary.players[0];
  const p1 = gameSummary.players[1];
  const isConnectCode = id.includes("#");

  // When the identifier is a connect code (contains #), prioritize code matching
  if (isConnectCode) {
    // Exact connect code match (case-insensitive)
    if (p0.connectCode.toLowerCase() === idLower) return 0;
    if (p1.connectCode.toLowerCase() === idLower) return 1;

    // Connect code prefix before # matches tag (e.g., "SAIT#123" → look for tag "Sait")
    const codePrefix = idLower.split("#")[0]!;
    if (codePrefix && p0.tag.toLowerCase() === codePrefix) return 0;
    if (codePrefix && p1.tag.toLowerCase() === codePrefix) return 1;

    // Tag contains the code prefix (e.g., tag "Saitor" contains "sait")
    if (codePrefix && codePrefix.length >= 2) {
      if (p0.tag.toLowerCase().includes(codePrefix)) return 0;
      if (p1.tag.toLowerCase().includes(codePrefix)) return 1;
    }
  }

  // 1. Exact tag match
  if (p0.tag === id) return 0;
  if (p1.tag === id) return 1;

  // 2. Case-insensitive tag match
  if (p0.tag.toLowerCase() === idLower) return 0;
  if (p1.tag.toLowerCase() === idLower) return 1;

  // 3. Exact connect code match (for non-# identifiers too)
  if (!isConnectCode) {
    if (p0.connectCode.toLowerCase() === idLower) return 0;
    if (p1.connectCode.toLowerCase() === idLower) return 1;
  }

  // 4. Tag contains identifier (e.g., identifier "Sait" matches tag "Saitor")
  if (idLower.length >= 2) {
    if (p0.tag.toLowerCase().includes(idLower)) return 0;
    if (p1.tag.toLowerCase().includes(idLower)) return 1;
  }

  // 5. Identifier contains tag (e.g., identifier "Saitor123" contains tag "Saitor")
  if (p0.tag.toLowerCase() !== "unknown" && p0.tag.length >= 2 && idLower.includes(p0.tag.toLowerCase())) return 0;
  if (p1.tag.toLowerCase() !== "unknown" && p1.tag.length >= 2 && idLower.includes(p1.tag.toLowerCase())) return 1;

  // 6. Connect code prefix match (e.g., "FOX" matches "FOX#123")
  if (!isConnectCode) {
    if (p0.connectCode.toLowerCase().startsWith(idLower) && p0.connectCode.length > 0) return 0;
    if (p1.connectCode.toLowerCase().startsWith(idLower) && p1.connectCode.length > 0) return 1;
  }

  // 7. Fallback: prefer the player with a non-generic tag
  if (p0.tag.toLowerCase() !== "unknown" && p1.tag.toLowerCase() === "unknown") return 0;
  if (p1.tag.toLowerCase() !== "unknown" && p0.tag.toLowerCase() === "unknown") return 1;

  // No match found — this is concerning, log it
  console.warn(
    `[findPlayerIdx] Could not match "${id}" to either player: ` +
    `p0="${p0.tag}" (${p0.connectCode}), p1="${p1.tag}" (${p1.connectCode}). Defaulting to 0.`,
  );
  return 0;
}

function getGrabFrequency(player: PlayerSummary): number {
  const grab = player.moveUsage.find((m) => m.move === "grab");
  const totalMoves = player.moveUsage.reduce((s, m) => s + m.count, 0);
  if (!grab || totalMoves === 0) return 0;
  return ratio(grab.count, totalMoves);
}

export function computeAdaptationSignals(
  gameResults: GameResult[],
  playerTag: string,
): DerivedInsights["adaptationSignals"] {
  if (gameResults.length < 2) return [];

  const first = gameResults[0]!;
  const last = gameResults[gameResults.length - 1]!;

  const firstIdx = findPlayerIdx(first.gameSummary, playerTag);
  const lastIdx = findPlayerIdx(last.gameSummary, playerTag);

  const firstPlayer = first.gameSummary.players[firstIdx];
  const lastPlayer = last.gameSummary.players[lastIdx];
  const firstInsights = first.derivedInsights[firstIdx];
  const lastInsights = last.derivedInsights[lastIdx];

  // Extract per-game values for each metric across the full set
  type MetricExtractor = (player: PlayerSummary, insights: DerivedInsights) => number;

  const metricDefs: {
    metric: string;
    extract: MetricExtractor;
    higherIsBetter: boolean;
  }[] = [
    { metric: "neutral win rate", extract: (p) => p.neutralWinRate, higherIsBetter: true },
    { metric: "ledge option entropy", extract: (_, i) => i.afterLedgeGrab.entropy, higherIsBetter: true },
    { metric: "knockdown option entropy", extract: (_, i) => i.afterKnockdown.entropy, higherIsBetter: true },
    { metric: "shield option entropy", extract: (_, i) => i.afterShieldPressure.entropy, higherIsBetter: true },
    { metric: "L-cancel rate", extract: (p) => p.lCancelRate, higherIsBetter: true },
    { metric: "openings per kill", extract: (p) => p.openingsPerKill, higherIsBetter: false },
    { metric: "avg damage per opening", extract: (p) => p.averageDamagePerOpening, higherIsBetter: true },
    { metric: "grab frequency", extract: (p) => getGrabFrequency(p), higherIsBetter: true },
    { metric: "power shields", extract: (p) => p.powerShieldCount, higherIsBetter: true },
    { metric: "edgeguard success", extract: (p) => p.edgeguardSuccessRate, higherIsBetter: true },
    { metric: "shield pressure sequences", extract: (p) => p.shieldPressure.sequenceCount, higherIsBetter: true },
    { metric: "combo DI score", extract: (p) => p.diQuality.comboDIScore, higherIsBetter: true },
    { metric: "survival DI score", extract: (p) => p.diQuality.survivalDIScore, higherIsBetter: true },
  ];

  // Build trajectory (per-game values) for each metric
  const metrics = metricDefs.map(({ metric, extract, higherIsBetter }) => {
    const trajectory = gameResults.map((gr) => {
      const idx = findPlayerIdx(gr.gameSummary, playerTag);
      return extract(gr.gameSummary.players[idx], gr.derivedInsights[idx]);
    });
    return {
      metric,
      game1Value: trajectory[0]!,
      lastGameValue: trajectory[trajectory.length - 1]!,
      higherIsBetter,
      trajectory,
    };
  });

  const THRESHOLD = 0.03; // 3% change threshold for "stable"

  return metrics.map(({ metric, game1Value, lastGameValue, higherIsBetter, trajectory }) => {
    const delta = lastGameValue - game1Value;
    const relativeDelta =
      game1Value !== 0 ? Math.abs(delta / game1Value) : Math.abs(delta);

    let direction: "improving" | "declining" | "stable";
    if (relativeDelta < THRESHOLD) {
      direction = "stable";
    } else if (higherIsBetter) {
      direction = delta > 0 ? "improving" : "declining";
    } else {
      direction = delta < 0 ? "improving" : "declining";
    }

    return {
      metric,
      game1Value: Math.round(game1Value * 10000) / 10000,
      lastGameValue: Math.round(lastGameValue * 10000) / 10000,
      direction,
      trajectory: trajectory.map((v) => Math.round(v * 10000) / 10000),
    };
  });
}
