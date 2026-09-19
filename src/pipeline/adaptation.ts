import type { GameSummary, GameResult, DerivedInsights, PlayerSummary } from "./types.js";
import { ratio } from "./helpers.js";

// ── Adaptation signals ────────────────────────────────────────────────

/** Normalize a connect code for comparison: uppercase, strip leading zeros from number */
function normalizeCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  const hashIdx = trimmed.indexOf("#");
  if (hashIdx < 0) return trimmed;
  const prefix = trimmed.slice(0, hashIdx);
  const num = trimmed.slice(hashIdx + 1).replace(/^0+/, "") || "0";
  return `${prefix}#${num}`;
}

/** Check if a tag is effectively empty/unknown */
function isEmptyTag(tag: string): boolean {
  const t = tag.trim().toLowerCase();
  return t === "" || t === "unknown" || t === "player" || t === "no tag";
}

/**
 * Score how well a player matches the identifier. Higher = better match.
 * Returns 0 if no match at all.
 */
function matchScore(
  player: { tag: string; connectCode: string },
  id: string,
  idLower: string,
  isConnectCode: boolean,
): number {
  const tagLower = player.tag.toLowerCase();
  const codeLower = player.connectCode.toLowerCase();
  const tagEmpty = isEmptyTag(player.tag);

  // Connect code matching (identifier contains #)
  if (isConnectCode) {
    const idNorm = normalizeCode(id);
    if (player.connectCode && normalizeCode(player.connectCode) === idNorm) return 100;

    const codePrefix = idLower.split("#")[0]!;
    if (codePrefix && !tagEmpty && tagLower === codePrefix) return 80;
    if (codePrefix && codePrefix.length >= 3 && !tagEmpty && tagLower.includes(codePrefix)) return 40;
  }

  // Exact tag match (case-sensitive)
  if (!tagEmpty && player.tag === id) return 100;
  // Case-insensitive tag match
  if (!tagEmpty && tagLower === idLower) return 95;

  // Connect code match for tag-style identifiers
  if (!isConnectCode && player.connectCode && codeLower === idLower) return 90;

  // Tag contains identifier (e.g., id "Sait" in tag "Saitor")
  if (idLower.length >= 3 && !tagEmpty && tagLower.includes(idLower)) return 50;
  // Identifier contains tag (e.g., id "Saitor123" contains tag "Saitor")
  if (!tagEmpty && player.tag.length >= 3 && idLower.includes(tagLower)) return 45;

  // Connect code prefix match (e.g., id "FOX" matches code "FOX#123")
  if (!isConnectCode && idLower.length >= 3 && player.connectCode && codeLower.startsWith(idLower)) return 30;

  return 0;
}

export function findPlayerIdx(gameSummary: GameSummary, playerIdentifier: string): 0 | 1 {
  const id = playerIdentifier.trim();
  if (!id) {
    throw new Error("Target player not found in replay: empty player identifier");
  }

  const idLower = id.toLowerCase();
  const p0 = gameSummary.players[0];
  const p1 = gameSummary.players[1];
  const isConnectCode = id.includes("#");

  // Score both players and pick the better match. No silent port-0 fallback:
  // a miss must surface so UI / import can mark the game unmatched.
  const score0 = matchScore(p0, id, idLower, isConnectCode);
  const score1 = matchScore(p1, id, idLower, isConnectCode);

  if (score0 > 0 || score1 > 0) {
    if (score0 >= score1) return 0;
    return 1;
  }

  const detail =
    `p0="${p0.tag}" (${p0.connectCode || "no code"}), ` +
    `p1="${p1.tag}" (${p1.connectCode || "no code"})`;
  console.error(`[findPlayerIdx] MATCH FAILED for "${id}" — ${detail}`);
  throw new Error(`Target player not found in replay: "${id}" (${detail})`);
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

  // Extract per-game values for each metric across the full set
  type MetricExtractor = (player: PlayerSummary, insights: DerivedInsights) => number | null;

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

  // Build trajectory (per-game values) for each metric.
  // Withhold metrics that are null for any game (e.g. vacuous L-cancel 0/0).
  const metrics = metricDefs.flatMap(({ metric, extract, higherIsBetter }) => {
    const trajectory = gameResults.map((gr) => {
      const idx = findPlayerIdx(gr.gameSummary, playerTag);
      return extract(gr.gameSummary.players[idx], gr.derivedInsights[idx]);
    });
    if (trajectory.some((v) => v == null)) return [];
    const nums = trajectory as number[];
    return [
      {
        metric,
        game1Value: nums[0]!,
        lastGameValue: nums[nums.length - 1]!,
        higherIsBetter,
        trajectory: nums,
      },
    ];
  });

  const THRESHOLD = 0.03; // 3% change threshold for "stable"

  return metrics.map(({ metric, game1Value, lastGameValue, higherIsBetter, trajectory }) => {
    const delta = lastGameValue - game1Value;
    const relativeDelta = game1Value !== 0 ? Math.abs(delta / game1Value) : Math.abs(delta);

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
