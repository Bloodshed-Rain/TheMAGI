import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, saveConfig, type Config } from "../src/config";
import { registerConfigHandlers } from "../src/main/handlers/config";
import type { SafeHandleFn } from "../src/main/ipc";

vi.mock("../src/config", () => ({ loadConfig: vi.fn(), saveConfig: vi.fn() }));

describe("config IPC handlers", () => {
  const handlers = new Map<string, Parameters<SafeHandleFn>[1]>();
  const stored = {
    targetPlayer: "TestPlayer",
    apiKeys: { openai: "test-openai-secret", anthropic: "test-anthropic-secret", gemini: "" },
  } as Config;

  beforeEach(() => {
    vi.resetAllMocks();
    handlers.clear();
    registerConfigHandlers((channel, handler) => handlers.set(channel, handler));
    vi.mocked(loadConfig).mockReturnValue(stored);
    vi.mocked(saveConfig).mockReturnValue(stored);
  });

  it.each(["config:load", "config:save"])("%s returns key-presence flags without modifying stored keys", (channel) => {
    const result = handlers.get(channel)!(undefined as never, { theme: "test" });
    expect(result).toEqual({ targetPlayer: "TestPlayer", apiKeys: { openai: true, anthropic: true } });
    expect(stored.apiKeys.openai).toBe("test-openai-secret");
    expect(stored.apiKeys.anthropic).toBe("test-anthropic-secret");
  });

  it("passes key updates to persistence and redacts the merged result", () => {
    const update = { apiKeys: { openai: "replacement-test-secret" } };
    vi.mocked(saveConfig).mockReturnValue({ ...stored, apiKeys: { ...stored.apiKeys, ...update.apiKeys } });
    const result = handlers.get("config:save")!(undefined as never, update);
    expect(saveConfig).toHaveBeenCalledWith(update);
    expect(result.apiKeys).toEqual({ openai: true, anthropic: true });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("propagates persistence errors", () => {
    vi.mocked(saveConfig).mockImplementation(() => {
      throw new Error("Write failed");
    });
    expect(() => handlers.get("config:save")!(undefined as never, {})).toThrow("Write failed");
  });
});
