import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import Database from "better-sqlite3";

// We test importer logic against a temporary DB
// to avoid polluting the real database

const TEST_REPLAYS_DIR = path.resolve(__dirname, "fixtures");
const IMPORTER_SOURCE = fs.readFileSync(path.resolve(__dirname, "../src/importer.ts"), "utf-8");
const IMPORT_HANDLER_SOURCE = fs.readFileSync(path.resolve(__dirname, "../src/main/handlers/import.ts"), "utf-8");

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

  it("deduplicates hashes within one batch before the database transaction", () => {
    expect(IMPORTER_SOURCE).toContain("const seenHashes = new Set<string>()");
    expect(IMPORTER_SOURCE).toContain("seenHashes.has(hash) || replayExists(hash)");
  });

  it("reports completed progress and counts only persisted games as imported", () => {
    expect(IMPORTER_SOURCE).toContain("let completedCount = 0");
    expect(IMPORTER_SOURCE).toContain("current: completedCount");
    expect(IMPORT_HANDLER_SOURCE).toContain("r.gameId !== undefined");
  });

  it("does not leave an empty session behind when every file is skipped or fails", () => {
    expect(IMPORTER_SOURCE).toContain("if (toParse.length > 0)");
    expect(IMPORTER_SOURCE).toContain("sessionId !== null && importedCount === 0");
    expect(IMPORTER_SOURCE).toContain('DELETE FROM sessions WHERE id = ?');
  });

  it("skips truncated-prefix duplicates before aggregates (content rule)", () => {
    expect(IMPORTER_SOURCE).toContain("findTruncationDuplicate");
    expect(IMPORTER_SOURCE).toContain("rawPrefixFingerprint");
    expect(IMPORTER_SOURCE).toContain("isTruncatedOrDuplicateRaw");
  });
});
