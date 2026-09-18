import type { BrowserWindow } from "electron";
import type { GameResult } from "../pipeline/index.js";

let mainWindow: BrowserWindow | null = null;
let fileWatcher: { close: () => void } | null = null;

export interface WatcherImportEvent {
  filePath: string;
  skipped: boolean;
  gameId?: number | undefined;
  gameResult?: GameResult | undefined;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function getFileWatcher(): { close: () => void } | null {
  return fileWatcher;
}

export function setFileWatcher(watcher: { close: () => void } | null): void {
  fileWatcher = watcher;
  mainWindow?.webContents.send("watcher:status", watcher !== null);
}

let importListener: ((result: WatcherImportEvent) => void) | null = null;

/** Single-slot hook; one consumer at a time — currently Cornerman. */
export function setImportListener(fn: ((result: WatcherImportEvent) => void) | null): void {
  importListener = fn;
}

export function getImportListener(): ((result: WatcherImportEvent) => void) | null {
  return importListener;
}
