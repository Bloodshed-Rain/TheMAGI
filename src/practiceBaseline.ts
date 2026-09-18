export interface PracticeBaseline {
  capturedAt: string;
  sampleGames: number;
  latestReplayId: number | null;
  evidenceReplayId: number | null;
  metrics: Array<{ key: string; label: string; value: number }>;
}

export function parsePracticeBaseline(json: string | null | undefined): PracticeBaseline | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as PracticeBaseline;
    if (!value || typeof value.capturedAt !== "string" || !Number.isFinite(value.sampleGames) ||
      !Array.isArray(value.metrics) || !value.metrics.every(metric => metric && typeof metric.key === "string" && typeof metric.label === "string" && Number.isFinite(metric.value)) ||
      ![value.latestReplayId, value.evidenceReplayId].every(id => id === null || (Number.isInteger(id) && id! > 0))) return null;
    return value;
  } catch { return null; }
}

export function formatPracticeMetric(key: string, value: number | null | undefined): string {
  if (value == null) return "—";
  if (key.endsWith("Rate") || key === "diSurvivalScore") return `${(value * 100).toFixed(1)}%`;
  if (key === "avgDeathPercent") return `${value.toFixed(1)}%`;
  return value.toFixed(1);
}
