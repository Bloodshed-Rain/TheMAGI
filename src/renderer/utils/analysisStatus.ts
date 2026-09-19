/** Renderer-side copy of fail-closed analysis status helpers (keep in sync with pipeline/analysisStatus). */

export type AnalysisStatus = "ok" | "failed" | "unavailable";

export function isSuccessfulAnalysisStatus(status: AnalysisStatus | string | null | undefined): boolean {
  return status === "ok";
}

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
