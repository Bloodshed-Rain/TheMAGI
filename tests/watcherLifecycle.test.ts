import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ watch: vi.fn(), importReplay: vi.fn() }));
vi.mock("chokidar", () => ({ default: { watch: mocks.watch } }));
vi.mock("../src/importer", () => ({ importReplay: mocks.importReplay }));
vi.mock("../src/db", () => ({ closeDb: vi.fn() }));
import { watchReplays } from "../src/watcher";

let directory: string;
let source: EventEmitter & { close: ReturnType<typeof vi.fn> };
let resolve: (value: { skipped: boolean; gameId: number }) => void;
let reject: (error: Error) => void;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "magi-watch-lifecycle-"));
  source = Object.assign(new EventEmitter(), { close: vi.fn(async () => {}) });
  mocks.watch.mockReturnValue(source);
  mocks.importReplay.mockReset().mockImplementation(
    () =>
      new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("replay watcher lifecycle", () => {
  it("does not send a late import into a restarted live session", async () => {
    const onImport = vi.fn();
    const watcher = watchReplays({ replayFolder: directory, targetPlayer: "FOX#1", importExisting: false, onImport });
    source.emit("add", path.join(directory, "game.slp"));
    watcher.close();
    resolve({ skipped: false, gameId: 1 });
    await flush();
    expect(onImport).not.toHaveBeenCalled();
  });
  it("ignores queued events and errors after close, and closes only once", async () => {
    const onError = vi.fn();
    const watcher = watchReplays({ replayFolder: directory, targetPlayer: null, importExisting: false, onError });
    watcher.close();
    watcher.close();
    source.emit("add", path.join(directory, "game.slp"));
    source.emit("error", new Error("Closed handle"));
    await flush();
    expect(mocks.importReplay).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(source.close).toHaveBeenCalledOnce();
  });
  it("suppresses an in-flight import failure after the watcher is replaced", async () => {
    const onError = vi.fn();
    const watcher = watchReplays({ replayFolder: directory, targetPlayer: null, importExisting: false, onError });
    source.emit("add", path.join(directory, "game.slp"));
    watcher.close();
    reject(new Error("Parser stopped"));
    await flush();
    expect(onError).not.toHaveBeenCalled();
  });
  it("stops importing the initial batch when closed", async () => {
    fs.writeFileSync(path.join(directory, "1.slp"), "fixture");
    fs.writeFileSync(path.join(directory, "2.slp"), "fixture");
    const onImport = vi.fn();
    const watcher = watchReplays({ replayFolder: directory, targetPlayer: null, onImport });
    watcher.close();
    resolve({ skipped: false, gameId: 1 });
    await flush();
    expect(mocks.importReplay).toHaveBeenCalledOnce();
    expect(onImport).not.toHaveBeenCalled();
  });
  it("still dispatches a successful import from an active watcher", async () => {
    const onImport = vi.fn();
    const watcher = watchReplays({ replayFolder: directory, targetPlayer: null, importExisting: false, onImport });
    source.emit("add", path.join(directory, "game.slp"));
    resolve({ skipped: false, gameId: 1 });
    await flush();
    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ gameId: 1, skipped: false }));
    watcher.close();
  });
});
