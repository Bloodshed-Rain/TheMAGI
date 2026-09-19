/**
 * Fail-closed analysis status for Magi game parsing / stats.
 *
 * - ok: real stats were computed and may be shown / aggregated
 * - failed: analysis threw or produced unusable output — never treat as real stats
 * - unavailable: analysis could not be attributed (e.g. target player unmatched)
 */

export const ANALYSIS_STATUSES = ["ok", "failed", "unavailable"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export function isSuccessfulAnalysisStatus(status: AnalysisStatus | string | null | undefined): boolean {
  return status === "ok";
}

/** User-facing copy for empty / error states in Library, Theater, coaching. */
export function analysisStatusLabel(status: AnalysisStatus | string | null | undefined): string {
  switch (status) {
    case "failed":
      return "Analysis failed";
    case "unavailable":
      return "Stats unavailable";
    case "ok":
      return "Analyzed";
    default:
      return "Stats unavailable";
  }
}

export function analysisStatusDetail(
  status: AnalysisStatus | string | null | undefined,
  error?: string | null,
): string {
  if (error && error.trim()) return error.trim();
  switch (status) {
    case "failed":
      return "Magi could not analyze this replay. Stats are hidden so zeros are never shown as real data.";
    case "unavailable":
      return "Magi could not attribute this replay to your player. Stats are hidden to avoid misleading numbers.";
    default:
      return "Stats are not available for this game.";
  }
}
