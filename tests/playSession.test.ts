import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaySessionController, type PlaySurface } from "../src/main/playSession";

function harness() {
  const child = Object.assign(new EventEmitter(), { pid: 123, kill: vi.fn(() => true) });
  let resolve!: (surface: PlaySurface) => void;
  let reject!: (error: Error) => void;
  const ready = new Promise<PlaySurface>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const deps = {
    spawn: vi.fn(() => child),
    findWindow: vi.fn((_pid: number, _signal?: AbortSignal) => ready),
    place: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    publish: vi.fn(),
  };
  const controller = new PlaySessionController(deps);
  const surface = { mainHwnd: 1n, renderHwnd: 2n, renderIsChild: true };
  return { controller, child, deps, surface, resolve, reject };
}
const bounds = { x: 200, y: 100, width: 640, height: 480 };
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
afterEach(() => vi.useRealTimers());

describe("persistent Play Mode game session", () => {
  it("contains a resize failure, keeps the match running, and recovers on the next resize", async () => {
    const h = harness();
    h.controller.open(bounds);
    h.resolve(h.surface);
    await flush();
    h.deps.place.mockImplementationOnce(() => {
      throw new Error("Display changed");
    });
    expect(() => h.controller.reposition()).not.toThrow();
    expect(h.controller.getStatus()).toMatchObject({
      phase: "running",
      error: "Could not position Melee: Display changed",
    });
    expect(h.child.kill).not.toHaveBeenCalled();
    h.controller.reposition();
    expect(h.controller.getStatus().error).toBeNull();
  });
  it("contains a hide failure without losing the live process", async () => {
    const h = harness();
    h.controller.open(bounds);
    h.resolve(h.surface);
    await flush();
    h.deps.hide.mockImplementationOnce(() => {
      throw new Error("Native failure");
    });
    expect(() => h.controller.hide()).not.toThrow();
    expect(h.controller.getStatus()).toMatchObject({ phase: "running", visible: false });
    h.controller.show(bounds);
    expect(h.controller.getStatus().error).toBeNull();
    expect(h.deps.spawn).toHaveBeenCalledOnce();
  });
  it("cancels window discovery on stop and independent Dolphin exit", () => {
    for (const stop of [true, false]) {
      const h = harness();
      h.controller.open(bounds);
      const signal = h.deps.findWindow.mock.calls[0]?.[1];
      expect(signal?.aborted).toBe(false);
      if (stop) h.controller.stop(true);
      else h.child.emit("exit", 0);
      expect(signal?.aborted).toBe(true);
    }
  });
  it("kills a process awaiting graceful stop if MAGI quits immediately", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.controller.open(bounds);
    h.resolve(h.surface);
    await flush();
    h.controller.stop();
    h.controller.stop(true);
    expect(h.child.kill).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(2000);
    expect(h.child.kill).toHaveBeenCalledOnce();
  });
  it("does not leave a fallback kill scheduled when graceful close exits synchronously", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.controller.open(bounds);
    h.resolve(h.surface);
    await flush();
    h.deps.close.mockImplementationOnce(() => h.child.emit("exit", 0));
    h.controller.stop();
    vi.advanceTimersByTime(2000);
    expect(h.child.kill).not.toHaveBeenCalled();
  });
  it("cleans up synchronous window discovery failures", () => {
    const h = harness();
    h.deps.findWindow.mockImplementationOnce(() => {
      throw new Error("FFI unavailable");
    });
    expect(() => h.controller.open(bounds)).not.toThrow();
    expect(h.controller.getStatus()).toMatchObject({ phase: "error", error: "FFI unavailable" });
    expect(h.child.kill).toHaveBeenCalledOnce();
  });
  it("takes a bounds snapshot instead of retaining a mutable caller object", async () => {
    const h = harness();
    const input = { ...bounds };
    h.controller.open(input);
    input.width = 1;
    h.resolve(h.surface);
    await flush();
    expect(h.deps.place).toHaveBeenLastCalledWith(h.surface, bounds);
  });
  it("hides on departure and reuses the same process on return", async () => {
    const h = harness();
    h.controller.open(bounds);
    h.resolve(h.surface);
    await flush();
    h.controller.hide();
    expect(h.deps.hide).toHaveBeenCalledWith(h.surface);
    expect(h.child.kill).not.toHaveBeenCalled();
    expect(h.controller.getStatus()).toEqual({ phase: "running", visible: false, error: null });
    const changed = { ...bounds, x: 250 };
    h.controller.open(changed);
    expect(h.deps.spawn).toHaveBeenCalledTimes(1);
    expect(h.deps.place).toHaveBeenLastCalledWith(h.surface, changed);
    expect(h.controller.getStatus().visible).toBe(true);
  });
  it("honors leaving and resizing while Dolphin is still starting", async () => {
    const h = harness();
    h.controller.open(bounds);
    const changed = { ...bounds, width: 400, height: 300 };
    h.controller.show(changed);
    h.controller.hide();
    h.resolve(h.surface);
    await flush();
    expect(h.deps.place).toHaveBeenCalledWith(h.surface, changed);
    expect(h.deps.hide).toHaveBeenCalledWith(h.surface);
    expect(h.controller.getStatus().visible).toBe(false);
  });
  it("does not reposition a game hidden behind the rest of MAGI", async () => {
    const h = harness();
    h.controller.open(bounds);
    h.resolve(h.surface);
    await flush();
    h.controller.hide();
    h.deps.place.mockClear();
    h.controller.reposition();
    expect(h.deps.place).not.toHaveBeenCalled();
  });
  it("uses the latest stage bounds for later native move and maximize events", async () => {
    const h = harness();
    h.controller.open(bounds);
    h.resolve(h.surface);
    await flush();
    const maximized = { x: 280, y: 150, width: 1068, height: 801 };
    h.controller.show(maximized);
    h.deps.place.mockClear();
    h.controller.reposition();
    expect(h.deps.place).toHaveBeenCalledExactlyOnceWith(h.surface, maximized);
    expect(h.deps.spawn).toHaveBeenCalledOnce();
  });
  it("ignores late attachment after an explicit stop", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.controller.open(bounds);
    h.controller.stop();
    h.resolve(h.surface);
    await flush();
    expect(h.deps.place).not.toHaveBeenCalled();
    expect(h.controller.getStatus().phase).toBe("stopped");
    vi.advanceTimersByTime(1500);
    expect(h.child.kill).toHaveBeenCalledOnce();
  });
  it("requests graceful shutdown and cancels fallback kill after exit", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.controller.open(bounds);
    h.resolve(h.surface);
    await flush();
    h.controller.stop();
    expect(h.deps.close).toHaveBeenCalledWith(h.surface);
    h.child.emit("exit", 0);
    vi.advanceTimersByTime(2000);
    expect(h.child.kill).not.toHaveBeenCalled();
  });
  it("terminates a failed launch and reports the error", async () => {
    const h = harness();
    h.controller.open(bounds);
    h.reject(new Error("No render window"));
    await flush();
    expect(h.child.kill).toHaveBeenCalledOnce();
    expect(h.controller.getStatus()).toEqual({ phase: "error", visible: false, error: "No render window" });
  });
  it("handles a process error and ignores its late discovery result", async () => {
    const h = harness();
    h.controller.open(bounds);
    h.child.emit("error", new Error("Cannot launch"));
    h.resolve(h.surface);
    await flush();
    expect(h.controller.getStatus().error).toBe("Cannot launch");
    expect(h.deps.place).not.toHaveBeenCalled();
  });
  it("reports Dolphin closing independently", async () => {
    const h = harness();
    h.controller.open(bounds);
    h.resolve(h.surface);
    await flush();
    h.child.emit("exit", 0);
    expect(h.controller.getStatus().phase).toBe("stopped");
  });
  it("terminates immediately on application shutdown", async () => {
    const h = harness();
    h.controller.open(bounds);
    h.resolve(h.surface);
    await flush();
    h.controller.stop(true);
    expect(h.child.kill).toHaveBeenCalledOnce();
    expect(h.controller.getStatus().phase).toBe("stopped");
  });
});
