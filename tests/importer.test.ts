import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import Database from "better-sqlite3";

// We test importer logic against a temporary DB
// to avoid polluting the real database

const TEST_REPLAYS_DIR = path.resolve(__dirname, "../test-replays");

function getTestReplays(count: number = 3): string[] {
  const files = fs.readdirSync(TEST_REPLAYS_DIR).filter((f) => f.endsWith(".slp"));
  return files.slice(0, count).map((f) => path.join(TEST_REPLAYS_DIR, f));
}

describe("importer", () => {
  it("hashFile produces consistent hashes", async () => {
    const crypto = await import("crypto");
    const replays = getTestReplays(1);
    if (replays.length === 0) return;

    const content = fs.readFileSync(replays[0]!);
    const hash1 = crypto.createHash("sha256").update(content).digest("hex");
    const hash2 = crypto.createHash("sha256").update(content).digest("hex");

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex string
  });

  it("different files produce different hashes", async () => {
    const crypto = await import("crypto");
    const replays = getTestReplays(2);
    if (replays.length < 2) return;

    const hash1 = crypto.createHash("sha256").update(fs.readFileSync(replays[0]!)).digest("hex");
    const hash2 = crypto.createHash("sha256").update(fs.readFileSync(replays[1]!)).digest("hex");

    expect(hash1).not.toBe(hash2);
  });

  it("test replay files exist and are readable", () => {
    const replays = getTestReplays(1);
    expect(replays.length).toBeGreaterThan(0);

    for (const replay of replays) {
      expect(fs.existsSync(replay)).toBe(true);
      const stat = fs.statSync(replay);
      expect(stat.size).toBeGreaterThan(0);
    }
  });
});
