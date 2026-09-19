import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import {
  analyzeGame,
  assertAnalysisOk,
  isDegenerateAnalysis,
  requirePlayerIdx,
  PlayerMatchError,
  processGame,
} from "../src/pipeline";

const TEST_REPLAYS_DIR = path.resolve(__dirname, "fixtures");

function getTestReplay(): string | null {
  if (!fs.existsSync(TEST_REPLAYS_DIR)) return null;
  const files = fs.readdirSync(TEST_REPLAYS_DIR).filter((f) => f.endsWith(".slp"));
  if (files.length === 0) return null;
  return path.join(TEST_REPLAYS_DIR, files[0]!);
}

describe("analyzeGame fail-closed boundary", () => {
  it("returns status failed for nonexistent files instead of inventing stats", () => {
    const outcome = analyzeGame("/nonexistent/file.slp", 1);
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "ok") {
      expect(outcome.reason.length).toBeGreaterThan(0);
      expect(outcome).not.toHaveProperty("result");
    }
  });

  it("returns status failed for non-slp files", () => {
    const outcome = analyzeGame(path.resolve(__dirname, "../package.json"), 1);
    expect(outcome.status).toBe("failed");
  });

  it("returns ok with real stats for a valid replay when fixtures exist", () => {
    const filePath = getTestReplay();
    if (!filePath) return;

    const outcome = analyzeGame(filePath, 1);
    expect(outcome.status).toBe("ok");
    const result = assertAnalysisOk(outcome);
    expect(result.gameSummary.duration).toBeGreaterThan(0);
    expect(result.gameSummary.players).toHaveLength(2);
    for (const player of result.gameSummary.players) {
      expect(typeof player.lCancelRate).toBe("number");
      expect(typeof player.neutralWinRate).toBe("number");
    }
  });

  it("treats placeholder-shaped summaries as degenerate", () => {
    expect(
      isDegenerateAnalysis({
        gameSummary: {
          gameNumber: 1,
          stage: "Unknown",
          duration: 0,
          result: { winner: "Unknown", endMethod: "unknown", finalStocks: [0, 0], finalPercents: [0, 0] },
          players: [
            { tag: "Unknown", connectCode: "", character: "Unknown" } as any,
            { tag: "Unknown", connectCode: "", character: "Unknown" } as any,
          ],
        },
      }),
    ).toBe(true);
  });
});

describe("requirePlayerIdx fail-closed", () => {
  it("throws PlayerMatchError when the target is not in the replay", () => {
    const filePath = getTestReplay();
    if (!filePath) return;
    const { gameSummary } = processGame(filePath, 1);
    expect(() => requirePlayerIdx(gameSummary, "NONEXISTENT_PLAYER_TAG_XYZ")).toThrow(PlayerMatchError);
  });

  it("resolves a real player tag", () => {
    const filePath = getTestReplay();
    if (!filePath) return;
    const { gameSummary } = processGame(filePath, 1);
    const tag = gameSummary.players[0].tag;
    expect(requirePlayerIdx(gameSummary, tag)).toBe(0);
  });
});
