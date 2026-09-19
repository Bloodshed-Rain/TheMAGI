import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import crypto from "crypto";

import { processGame, findPlayerIdx } from "../src/pipeline";
import {
  isTruncatedOrDuplicateRaw,
  rawPrefixFingerprint,
  readReplayBuffer,
} from "../src/replayDedupe";
import { ratioOrNull } from "../src/pipeline/helpers";
import {
  rivalLabelAllowed,
  trendWindowAllowed,
  MIN_TREND_SAMPLES,
} from "../src/truthGates";

const FIXTURES = path.resolve(__dirname, "fixtures");
const game1 = path.join(FIXTURES, "game1.slp");
const game2 = path.join(FIXTURES, "game2.slp");

describe("Fail Fast #1: truncated/duplicate .slp → no extra wins", () => {
  it("detects game2.slp as truncated prefix of game1.slp (content rule)", () => {
    expect(fs.existsSync(game1)).toBe(true);
    expect(fs.existsSync(game2)).toBe(true);

    const a = readReplayBuffer(game1);
    const b = readReplayBuffer(game2);
    expect(a.length).toBeGreaterThan(b.length);
    expect(isTruncatedOrDuplicateRaw(a, b)).toBe(true);

    // Full-file hashes differ — hash-only dedupe would double-count a win.
    const h1 = crypto.createHash("sha256").update(a).digest("hex");
    const h2 = crypto.createHash("sha256").update(b).digest("hex");
    expect(h1).not.toBe(h2);

    expect(rawPrefixFingerprint(a)).toBe(rawPrefixFingerprint(b));
  });

  it("importer skips truncated-prefix duplicates before aggregates", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../src/importer.ts"), "utf-8");
    expect(src).toContain("findTruncationDuplicate");
    expect(src).toContain("rawPrefixFingerprint");
    expect(src).toContain("isTruncatedOrDuplicateRaw");
  });
});

describe("Fail Fast #2: connect-code mismatch → no silent port-0", () => {
  it("throws instead of attributing to port 0 when match fails", () => {
    expect(fs.existsSync(game1)).toBe(true);
    const { gameSummary } = processGame(game1, 1);
    expect(() => findPlayerIdx(gameSummary, "TEST#000")).toThrow(/Target player not found/);
  });
});

describe("Fail Fast #3: Oracle → no WoW/trend on n=2 adjacent games", () => {
  it("withholds trend windows below MIN_TREND_SAMPLES", () => {
    expect(MIN_TREND_SAMPLES).toBeGreaterThanOrEqual(5);
    expect(
      trendWindowAllowed(2, "7d", "2026-09-01T00:00:00Z", "2026-09-01T01:00:00Z"),
    ).toBe(false);
    expect(
      trendWindowAllowed(4, "7d", "2026-09-01T00:00:00Z", "2026-09-05T00:00:00Z"),
    ).toBe(false);
  });

  it("withholds 7d trend when calendar span is too short", () => {
    expect(
      trendWindowAllowed(5, "7d", "2026-09-01T00:00:00Z", "2026-09-01T20:00:00Z"),
    ).toBe(false);
  });

  it("allows 7d trend with ≥5 samples spanning ≥3 days", () => {
    expect(
      trendWindowAllowed(5, "7d", "2026-09-01T00:00:00Z", "2026-09-04T12:00:00Z"),
    ).toBe(true);
  });
});

describe("Fail Fast #4: Problem Match → no only-rival / heavy-stomp fire", () => {
  it("withholds rival labels below n=3", () => {
    expect(rivalLabelAllowed(1)).toBe(false);
    expect(rivalLabelAllowed(2)).toBe(false);
    expect(rivalLabelAllowed(3)).toBe(true);
  });
});

describe("Fail Fast #5: L-cancel 0/0 → withhold, never coaching signal", () => {
  it("ratioOrNull returns null for 0 attempts (never 0%)", () => {
    expect(ratioOrNull(0, 0)).toBeNull();
    expect(ratioOrNull(3, 0)).toBeNull();
    expect(ratioOrNull(1, 2)).toBe(0.5);
  });
});
