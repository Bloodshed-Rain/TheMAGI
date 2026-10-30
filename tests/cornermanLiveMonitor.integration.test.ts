import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { startCornermanLiveMonitor } from "../src/cornermanLiveMonitor";
import type { CornermanLiveSnapshot } from "../src/cornermanLiveStats";

describe("live monitoring of Slippi output folders", () => {
  it("emits real replay stats from a monthly subfolder without treating an old completed game as new coaching", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "magi-live-integration-"));
    fs.mkdirSync(path.join(directory, "2026-10"));
    fs.copyFileSync(path.resolve(__dirname, "fixtures/game1.slp"), path.join(directory, "2026-10/game.slp"));
    // Windows CopyFile can retain the fixture's old mtime; this represents a
    // replay just written by Dolphin and must fall inside the attach window.
    fs.utimesSync(path.join(directory, "2026-10/game.slp"), new Date(), new Date());
    const snapshots: CornermanLiveSnapshot[] = [];
    const onGameComplete = vi.fn();
    const errors: Error[] = [];
    const monitor = startCornermanLiveMonitor({
      replayFolder: directory,
      targetPlayer: "SLOP#790",
      onEvents: () => {},
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      onGameComplete,
      onError: (error) => errors.push(error),
    });
    try {
      await vi.waitFor(
        () => {
          expect(errors).toEqual([]);
          expect(snapshots.length).toBeGreaterThan(0);
        },
        { timeout: 5000 },
      );
      expect(snapshots[0]!.players).toHaveLength(2);
      expect(snapshots[0]!.latestFrame).toBeGreaterThan(0);
      expect(snapshots[0]!.players.find((player) => player.isTarget)!.stats.length).toBeGreaterThan(0);
      expect(snapshots[0]!.phase).toBe("ended");
      expect(errors).toEqual([]);
      expect(onGameComplete).not.toHaveBeenCalled();
    } finally {
      monitor.close();
      const resolved = path.resolve(directory);
      if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep))
        throw new Error("Unexpected test cleanup directory");
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  });
});
