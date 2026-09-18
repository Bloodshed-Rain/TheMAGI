import { describe, expect, it } from "vitest";
import {
  appendWhichSlippiDolphin,
  buildExternalReplayComm,
  clampReplayStartFrame,
  listLinuxDolphinCandidates,
} from "../src/main/handlers/dolphinResolve";

describe("clampReplayStartFrame", () => {
  it("clamps countdown frames to 0", () => {
    expect(clampReplayStartFrame(-123)).toBe(0);
    expect(clampReplayStartFrame(-1)).toBe(0);
    expect(clampReplayStartFrame(0)).toBe(0);
  });

  it("floors positive frames", () => {
    expect(clampReplayStartFrame(60.9)).toBe(60);
    expect(clampReplayStartFrame(120)).toBe(120);
  });
});

describe("listLinuxDolphinCandidates", () => {
  it("puts Slippi Playback AppImage before Online and never leads with dolphin-emu", () => {
    const home = "/home/tester";
    const candidates = listLinuxDolphinCandidates(home);
    expect(candidates[0]).toBe(`${home}/.config/Slippi Launcher/playback/Slippi_Playback-x86_64.AppImage`);
    const onlineIdx = candidates.findIndex((c) => c.includes("Slippi_Online"));
    const playbackIdx = candidates.findIndex((c) => c.includes("Slippi_Playback"));
    expect(playbackIdx).toBeGreaterThanOrEqual(0);
    expect(onlineIdx).toBeGreaterThan(playbackIdx);
    expect(candidates[0]).not.toMatch(/dolphin-emu$/);
  });
});

describe("appendWhichSlippiDolphin", () => {
  it("does not invent a PATH entry when which fails (returns same list)", () => {
    const base = ["/opt/slippi/Slippi_Playback-x86_64.AppImage"];
    const next = appendWhichSlippiDolphin(base);
    expect(next[0]).toBe(base[0]);
  });
});

describe("buildExternalReplayComm", () => {
  it("uses normal mode without startFrame", () => {
    const { seekFrame, commData } = buildExternalReplayComm("/tmp/game.slp");
    expect(seekFrame).toBeNull();
    expect(commData.mode).toBe("normal");
    expect(commData.replay).toBe("/tmp/game.slp");
    expect(commData.isRealTimeMode).toBe(false);
  });

  it("uses queue mode with clamped startFrame", () => {
    const { seekFrame, commData } = buildExternalReplayComm("/tmp/game.slp", -40);
    expect(seekFrame).toBe(0);
    expect(commData.mode).toBe("queue");
    expect(commData.queue).toEqual([{ path: "/tmp/game.slp", startFrame: 0 }]);
  });
});
