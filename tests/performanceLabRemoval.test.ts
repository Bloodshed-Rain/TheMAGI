// Performance Lab was removed in 1.16.0. These checks pin what went with it and
// what had to stay: Play Mode's Recent form query, per-game review notes, and
// the training-log table with whatever a player already saved in it.

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { Dashboard, pageForHash } from "../src/renderer/pageRegistry";

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf-8");
const APP = read("src/renderer/App.tsx");
const PALETTE = read("src/renderer/components/CommandPalette.tsx");
const REGISTRY = read("src/renderer/pageRegistry.ts");
const HANDLERS = read("src/main/handlers/stats.ts");
const PRELOAD = read("src/preload/index.ts");
const TYPES = read("src/renderer/global.d.ts");
const DB = read("src/db.ts");

describe("Performance Lab removal", () => {
  it("NEGATIVE: the page file, its nav entry and its command-palette entry are gone", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../src/renderer/pages/PerformanceLab.tsx"))).toBe(false);
    expect(APP).not.toContain('label: "Performance Lab"');
    expect(APP).not.toContain("<PerformanceLab");
    expect(PALETTE).not.toContain("nav-performance");
    expect(REGISTRY).not.toContain("PerformanceLab");
  });

  it("sends an old /performance link to the Dashboard", () => {
    expect(APP).toContain('<Route path="/performance" element={<Navigate to="/dashboard" replace />} />');
    expect(pageForHash("#/performance")).toBe(Dashboard);
  });

  it("NEGATIVE: no training-log channel is exposed any more", () => {
    for (const source of [HANDLERS, PRELOAD, TYPES]) {
      expect(source).not.toMatch(/trainingLog/i);
    }
    expect(DB).not.toContain("export function createTrainingLogEntry");
    expect(DB).not.toContain("export function listTrainingLogEntries");
  });

  it("keeps the training-log table and never drops saved entries", () => {
    expect(DB).toContain("CREATE TABLE IF NOT EXISTS training_log_entries");
    expect(DB).not.toMatch(/DROP TABLE[^;]*training_log_entries/);
    expect(DB).not.toMatch(/DELETE FROM training_log_entries/);
  });

  it("keeps the Recent form query Play Mode reads, without the page-only parts", () => {
    expect(HANDLERS).toContain('"stats:performanceHub"');
    expect(PRELOAD).toContain("getPerformanceHub");
    expect(read("src/renderer/components/PlayRecentForm.tsx")).toContain("usePerformanceHub");
    const start = DB.indexOf("export function getPerformanceHub(");
    const hub = DB.slice(start, DB.indexOf("\nexport ", start + 1));
    expect(hub).toContain("sample: { currentGames: currentRows.length");
    expect(hub).not.toContain("reviewQueue");
    expect(hub).not.toContain("insights");
  });

  it("keeps per-game review notes", () => {
    expect(HANDLERS).toContain('"stats:gameReviewNotes"');
    expect(HANDLERS).toContain('"stats:gameReviewNotes:add"');
    expect(PRELOAD).toContain("addGameReviewNote");
    expect(DB).toContain("export function listGameReviewNotes");
    expect(DB).toContain("export function addGameReviewNote");
  });
});
