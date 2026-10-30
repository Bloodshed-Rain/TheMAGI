import { afterEach, describe, expect, it, vi } from "vitest";
import { playPreset } from "../src/playMode";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("Play Mode preference persistence", () => {
  it("waits for an outgoing draft before loading a returning workspace", async () => {
    let finish!: () => void;
    const saved = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const draft = { playLayout: playPreset("practice"), playFocus: "Hold center", playNotes: "Review ledge choices" };
    const saveConfig = vi.fn(() => saved);
    const loadConfig = vi.fn(() => Promise.resolve(draft));
    vi.stubGlobal("window", { clippi: { saveConfig, loadConfig } });
    const { savePlayPreferences, loadPlayPreferences } = await import("../src/renderer/playPreferences");
    const write = savePlayPreferences(draft);
    const read = loadPlayPreferences();
    await Promise.resolve();
    await Promise.resolve();
    expect(saveConfig).toHaveBeenCalledWith(draft);
    expect(loadConfig).not.toHaveBeenCalled();
    finish();
    await write;
    expect(await read).toEqual(draft);
  });
  it("saves the newer draft after a failed write instead of blocking the queue", async () => {
    const saveConfig = vi.fn().mockRejectedValueOnce(new Error("Disk unavailable")).mockResolvedValueOnce({});
    vi.stubGlobal("window", { clippi: { saveConfig } });
    const { savePlayPreferences } = await import("../src/renderer/playPreferences");
    const original = { playLayout: playPreset("minimal"), playFocus: "", playNotes: "" };
    await expect(savePlayPreferences(original)).rejects.toThrow("Disk unavailable");
    const updated = { ...original, playNotes: "Latest note" };
    await savePlayPreferences(updated);
    expect(saveConfig).toHaveBeenLastCalledWith(updated);
  });
});
