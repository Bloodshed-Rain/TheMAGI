import { describe, it, expect } from "vitest";
import { buildSparklinePoints } from "../src/renderer/components/ui/Sparkline";

describe("buildSparklinePoints", () => {
  it("maps a flat series to a horizontal line at mid-height", () => {
    const pts = buildSparklinePoints([5, 5, 5], 100, 40);
    expect(pts).toBe("0,40 50,40 100,40");
  });

  it("maps increasing series to a bottom-left → top-right diagonal", () => {
    const pts = buildSparklinePoints([0, 1, 2], 100, 40);
    expect(pts).toBe("0,40 50,20 100,0");
  });

  it("returns empty string for empty input", () => {
    expect(buildSparklinePoints([], 100, 40)).toBe("");
  });

  it("handles single-value series by centering", () => {
    expect(buildSparklinePoints([7], 100, 40)).toBe("0,40");
  });
});
