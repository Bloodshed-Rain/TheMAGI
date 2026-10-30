import { describe, expect, it } from "vitest";
import path from "path";
import { parseSlippiReplaySettings, readSlippiReplaySettings, selectPlayReplayFolder } from "../src/slippiReplaySetup";

describe("hosted Dolphin replay setup", () => {
  const directory = path.resolve("test-netplay");
  it("reads Core replay settings without being confused by other sections", () => {
    const folder = path.resolve("real-replays");
    const result = parseSlippiReplaySettings(
      `\uFEFF[General]\r\nSlippiReplayDir = ignored\r\n[Core]\r\nSlippiReplayDir = "${folder}"\r\nSlippiSaveReplays = True\r\nSlippiReplayMonthFolders = True\r\n`,
      directory,
    );
    expect(result).toEqual({ replayFolder: folder, savingEnabled: true });
  });
  it("resolves relative output folders against the emulator directory", () => {
    expect(parseSlippiReplaySettings("[Core]\nSlippiReplayDir = Replays\nSlippiSaveReplays = 1", directory)).toEqual({
      replayFolder: path.join(directory, "Replays"),
      savingEnabled: true,
    });
  });
  it("ignores comments and empty settings", () => {
    expect(
      parseSlippiReplaySettings(
        "[Core]\n; SlippiReplayDir = nope\n# SlippiSaveReplays = false\nSlippiReplayDir = \nOther = value",
        directory,
      ),
    ).toEqual({ replayFolder: null, savingEnabled: null });
  });
  it("uses Dolphin’s actual output instead of a stale fixture/import folder", () => {
    expect(
      selectPlayReplayFolder(
        "fixtures",
        { replayFolder: "live-replays", savingEnabled: true },
        (folder) => folder === "live-replays",
      ),
    ).toBe("live-replays");
  });
  it("uses an explicit folder when Dolphin settings are unavailable", () => {
    expect(selectPlayReplayFolder("custom-replays", { replayFolder: null, savingEnabled: null }, () => true)).toBe(
      "custom-replays",
    );
  });
  it("reports disabled recording even if a folder already contains old replays", () => {
    const disabled = parseSlippiReplaySettings(
      "[Core]\nSlippiSaveReplays = False\nSlippiReplayDir = Replays",
      directory,
    );
    expect(() => selectPlayReplayFolder("old-replays", disabled, () => true)).toThrow("replay saving is disabled");
  });
  it("does not silently fall back when the detected output folder is missing", () => {
    expect(() =>
      selectPlayReplayFolder(
        "old-replays",
        { replayFolder: "missing", savingEnabled: true },
        (folder) => folder === "old-replays",
      ),
    ).toThrow("No readable live replay folder");
  });
  it("tolerates a missing Dolphin INI", () => {
    expect(readSlippiReplaySettings(path.join(directory, "missing", "Dolphin.exe"))).toEqual({
      replayFolder: null,
      savingEnabled: null,
    });
  });
});
