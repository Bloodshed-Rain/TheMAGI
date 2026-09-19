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

const FIXTURES = path.resolve(__dirname, "fixtures");
const game1 = path.join(FIXTURES, "game1.slp");
const game2 = path.join(FIXTURES, "game2.slp");

describe("truthfulness: truncated replay dedupe", () => {
  it("detects game2.slp as a truncated prefix of game1.slp", () => {
    expect(fs.existsSync(game1)).toBe(true);
    expect(fs.existsSync(game2)).toBe(true);

    const a = readReplayBuffer(game1);
    const b = readReplayBuffer(game2);
    expect(a.length).toBeGreaterThan(b.length);
    expect(isTruncatedOrDuplicateRaw(a, b)).toBe(true);

    const h1 = crypto.createHash("sha256").update(a).digest("hex");
    const h2 = crypto.createHash("sha256").update(b).digest("hex");
    expect(h1).not.toBe(h2);

    expect(rawPrefixFingerprint(a)).toBe(rawPrefixFingerprint(b));
  });
});

describe("truthfulness: vacuous rates", () => {
  it("ratioOrNull returns null for 0 attempts (never 0%)", () => {
    expect(ratioOrNull(0, 0)).toBeNull();
    expect(ratioOrNull(3, 0)).toBeNull();
    expect(ratioOrNull(1, 2)).toBe(0.5);
  });
});

describe("truthfulness: identity match failure", () => {
  it("does not silently attribute to port 0 when connect-code match fails", () => {
    expect(fs.existsSync(game1)).toBe(true);
    const { gameSummary } = processGame(game1, 1);
    expect(() => findPlayerIdx(gameSummary, "TEST#000")).toThrow(/Target player not found/);
  });
});
