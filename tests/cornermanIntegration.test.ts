import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  config: { cornermanEnabled: true, cornermanLiveStatsEnabled: true },
  send: vi.fn(),
  close: vi.fn(),
  monitor: vi.fn(),
  watcher: vi.fn(),
}));
vi.mock("electron", () => ({ Notification: vi.fn() }));
vi.mock("../src/config", () => ({ loadConfig: () => state.config }));
vi.mock("../src/db", () => ({
  getDb: () => ({ prepare: () => ({ all: () => [] }) }),
  insertCoachingAnalysis: vi.fn(),
}));
vi.mock("../src/main/ipc", () => ({ validatePath: (p: string) => p }));
vi.mock("../src/main/state", () => ({
  getMainWindow: () => ({ webContents: { send: state.send } }),
  setImportListener: vi.fn(),
}));
vi.mock("../src/main/handlers/watcher", () => ({ startReplayWatcher: state.watcher, notifyGameHighlights: vi.fn() }));
vi.mock("../src/cornermanLiveMonitor", () => ({ startCornermanLiveMonitor: state.monitor }));
vi.mock("../src/importer", () => ({ importReplay: vi.fn() }));
vi.mock("../src/main/handlers/analysis", () => ({ resolveLLMConfig: vi.fn() }));
import { registerCornermanHandlers, shutdownCornerman } from "../src/main/handlers/cornerman";

describe("Cornerman main-window integration", () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  beforeEach(() => {
    shutdownCornerman();
    vi.clearAllMocks();
    state.config = { cornermanEnabled: true, cornermanLiveStatsEnabled: true };
    state.monitor.mockReturnValue({ close: state.close });
    handlers.clear();
    registerCornermanHandlers((name, fn) => handlers.set(name, fn));
  });
  it("does not expose popup window controls", () => {
    expect([...handlers.keys()].some((name) => name.includes("overlay"))).toBe(false);
  });
  it("requires the enable preference before tracking starts", () => {
    state.config.cornermanEnabled = false;
    expect(() => handlers.get("cornerman:start")!(null, "/replays", "YOU#1")).toThrow("Enable Cornerman");
    expect(state.monitor).not.toHaveBeenCalled();
    expect(state.watcher).not.toHaveBeenCalled();
  });
  it("delivers live alerts and stats to the main renderer and closes its monitor when stopped", () => {
    expect(handlers.get("cornerman:start")!(null, "/replays", "YOU#1").active).toBe(true);
    const callbacks = state.monitor.mock.calls[0]![0];
    const event = { id: "event", title: "Test alert", importance: "high" };
    callbacks.onEvents([event]);
    expect(state.send).toHaveBeenCalledWith("cornerman:live-event", event);
    callbacks.onSnapshot({ gameKey: "game", phase: "live", players: [] });
    expect(state.send).toHaveBeenCalledWith("cornerman:live-stats", expect.objectContaining({ gameKey: "game" }));
    expect(handlers.get("cornerman:stop")!().active).toBe(false);
    expect(state.close).toHaveBeenCalled();
  });
});
