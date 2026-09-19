/** Pure sample/span gates so Magi surfaces stay evidence-backed. */

/** Rival / Problem Match labels require n≥3 games. */
export function rivalLabelAllowed(totalGames: number): boolean {
  return totalGames >= 3;
}

/**
 * Trend / "weekly" / WoW-style windows: require enough samples AND enough
 * calendar span so 1–2 adjacent games cannot invent a drop.
 */
export const MIN_TREND_SAMPLES = 5;
export const MIN_TREND_SPAN_MS: Record<"7d" | "30d" | "all", number> = {
  "7d": 3 * 24 * 60 * 60 * 1000,
  "30d": 7 * 24 * 60 * 60 * 1000,
  all: 0,
};

export function trendWindowAllowed(
  sampleCount: number,
  range: "7d" | "30d" | "all",
  firstPlayedAt?: string | null,
  lastPlayedAt?: string | null,
): boolean {
  if (sampleCount < MIN_TREND_SAMPLES) return false;
  const minSpan = MIN_TREND_SPAN_MS[range];
  if (minSpan <= 0) return true;
  if (!firstPlayedAt || !lastPlayedAt) return false;
  const first = Date.parse(firstPlayedAt);
  const last = Date.parse(lastPlayedAt);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return false;
  return last - first >= minSpan;
}
