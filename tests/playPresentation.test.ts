import { describe, expect, it, vi } from "vitest";
import { PlayPresentation } from "../src/main/playPresentation";

function harness(fullscreen = false, shortcutAvailable = true) {
  let exit = () => {};
  const deps = {
    isFullScreen: () => fullscreen,
    setFullScreen: vi.fn(),
    registerExit: vi.fn((callback: () => void) => {
      exit = callback;
      return shortcutAvailable;
    }),
    unregisterExit: vi.fn(),
    publish: vi.fn(),
  };
  return { presentation: new PlayPresentation(deps), deps, exit: () => exit() };
}

describe("Game Only presentation", () => {
  it("publishes normal layout even when native fullscreen restoration fails", () => {
    const h = harness();
    h.presentation.enter();
    h.deps.setFullScreen.mockImplementationOnce(() => {
      throw new Error("Window closed");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => h.presentation.leave()).not.toThrow();
      expect(h.deps.publish).toHaveBeenLastCalledWith(false);
      expect(h.presentation.isActive()).toBe(false);
      expect(h.deps.unregisterExit).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
  it("reserves an exit shortcut and returns to the previous window state", () => {
    const h = harness();
    expect(h.presentation.enter()).toBe(true);
    expect(h.deps.setFullScreen).toHaveBeenLastCalledWith(true);
    expect(h.deps.publish).toHaveBeenLastCalledWith(true);
    h.exit();
    expect(h.presentation.isActive()).toBe(false);
    expect(h.deps.setFullScreen).toHaveBeenLastCalledWith(false);
    expect(h.deps.publish).toHaveBeenLastCalledWith(false);
    expect(h.deps.unregisterExit).toHaveBeenCalledOnce();
  });
  it("preserves an already-fullscreen MAGI window on return", () => {
    const h = harness(true);
    h.presentation.enter();
    h.presentation.leave();
    expect(h.deps.setFullScreen).toHaveBeenLastCalledWith(true);
  });
  it("keeps controls visible if the exit shortcut is unavailable", () => {
    const h = harness(false, false);
    expect(() => h.presentation.enter()).toThrow("in use");
    expect(h.presentation.isActive()).toBe(false);
    expect(h.deps.setFullScreen).not.toHaveBeenCalled();
    expect(h.deps.publish).not.toHaveBeenCalled();
    expect(h.deps.unregisterExit).not.toHaveBeenCalled();
  });
  it("cleans up after a native fullscreen exit without entering fullscreen again", () => {
    const h = harness(true);
    h.presentation.enter();
    h.deps.setFullScreen.mockClear();
    h.presentation.leave(false);
    expect(h.deps.setFullScreen).not.toHaveBeenCalled();
    expect(h.deps.unregisterExit).toHaveBeenCalledOnce();
    expect(h.deps.publish).toHaveBeenLastCalledWith(false);
  });
  it("makes repeated entry and cleanup harmless", () => {
    const h = harness();
    h.presentation.enter();
    h.presentation.enter();
    expect(h.deps.registerExit).toHaveBeenCalledOnce();
    h.presentation.leave();
    h.presentation.leave();
    h.exit();
    expect(h.deps.unregisterExit).toHaveBeenCalledOnce();
  });
  it("releases the shortcut if entering native fullscreen fails", () => {
    const h = harness();
    h.deps.setFullScreen.mockImplementationOnce(() => {
      throw new Error("Window unavailable");
    });
    expect(() => h.presentation.enter()).toThrow("Window unavailable");
    expect(h.presentation.isActive()).toBe(false);
    expect(h.deps.unregisterExit).toHaveBeenCalledOnce();
    expect(h.deps.publish).toHaveBeenLastCalledWith(false);
  });
});
