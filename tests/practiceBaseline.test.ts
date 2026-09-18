import { describe, expect, it } from "vitest";
import { formatPracticeMetric, parsePracticeBaseline } from "../src/practiceBaseline";

describe("saved practice context", () => {
  const baseline = {capturedAt: "2026-09-06", sampleGames: 20, latestReplayId: 40, evidenceReplayId: 32, metrics: [{key: "avgDeathPercent", label: "Death percent", value: 161}]};
  it("round trips evidence and values above 100 without changing units", () => {
    expect(parsePracticeBaseline(JSON.stringify(baseline))).toEqual(baseline);
    expect(formatPracticeMetric("avgDeathPercent", 161)).toBe("161.0%");
    expect(formatPracticeMetric("neutralWinRate", 0.52)).toBe("52.0%");
  });
  it("handles older plans and corrupt snapshots without crashing the plan list", () => {
    for (const value of [null, "broken", "{}", JSON.stringify({...baseline, metrics:[{value:"bad"}]}), JSON.stringify({...baseline, evidenceReplayId:-1})]) {
      expect(parsePracticeBaseline(value)).toBeNull();
    }
  });
});
