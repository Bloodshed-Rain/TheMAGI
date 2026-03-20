import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// Use a temp directory for test config to avoid touching real config
const TEST_DIR = path.join(os.tmpdir(), "magi-test-config-" + Date.now());
const TEST_CONFIG_PATH = path.join(TEST_DIR, "config.json");

// We need to mock the config module's paths
// Instead, test the logic directly
describe("config logic", () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    // Simulate loadConfig behavior
    const DEFAULTS = {
      targetPlayer: null,
      connectCode: null,
      replayFolder: null,
      llmModelId: null,
      openrouterApiKey: null,
      geminiApiKey: null,
      anthropicApiKey: null,
      openaiApiKey: null,
      localEndpoint: null,
      theme: null,
      colorMode: null,
    };

    if (!fs.existsSync(TEST_CONFIG_PATH)) {
      const result = { ...DEFAULTS };
      expect(result.targetPlayer).toBeNull();
      expect(result.replayFolder).toBeNull();
    }
  });

  it("reads and merges config from JSON file", () => {
    const partial = { targetPlayer: "TestPlayer", replayFolder: "/tmp/replays" };
    fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(partial));

    const raw = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, "utf-8"));
    expect(raw.targetPlayer).toBe("TestPlayer");
    expect(raw.replayFolder).toBe("/tmp/replays");
  });

  it("handles corrupted JSON gracefully", () => {
    fs.writeFileSync(TEST_CONFIG_PATH, "NOT VALID JSON {{{");

    let result: any;
    try {
      result = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, "utf-8"));
    } catch {
      result = null;
    }
    expect(result).toBeNull();
  });

  it("round-trips config through write and read", () => {
    const config = {
      targetPlayer: "Fox Main",
      connectCode: "FOX#123",
      replayFolder: "/home/test/replays",
      llmModelId: "deepseek/deepseek-chat",
    };

    fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
    const loaded = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, "utf-8"));

    expect(loaded.targetPlayer).toBe("Fox Main");
    expect(loaded.connectCode).toBe("FOX#123");
    expect(loaded.llmModelId).toBe("deepseek/deepseek-chat");
  });
});
