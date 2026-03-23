import { ipcMain } from "electron";
import * as path from "path";

export type SafeHandleFn = (
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any,
) => void;

/**
 * Validate that a path from the renderer is safe:
 * - Must be absolute
 * - Must not contain path traversal sequences
 * - Must not point to sensitive system directories
 */
export function validatePath(p: unknown): string {
  if (typeof p !== "string" || p.length === 0) {
    throw new Error("Invalid path: must be a non-empty string");
  }
  if (!path.isAbsolute(p)) {
    throw new Error("Invalid path: must be absolute");
  }
  // Normalize to resolve any .. segments, then check it didn't escape
  const normalized = path.normalize(p);
  if (normalized.includes("..")) {
    throw new Error("Invalid path: traversal not allowed");
  }
  return normalized;
}

/** Wrap an IPC handler so errors are always serialized properly to the renderer */
export function safeHandle(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(message);
    }
  });
}

import { registerAnalysisHandlers } from "./handlers/analysis.js";
import { registerConfigHandlers } from "./handlers/config.js";
import { registerDialogHandlers } from "./handlers/dialog.js";
import { registerDolphinHandlers } from "./handlers/dolphin.js";
import { registerImportHandlers } from "./handlers/import.js";
import { registerLlmHandlers } from "./handlers/llm.js";
import { registerStatsHandlers } from "./handlers/stats.js";
import { registerWatcherHandlers } from "./handlers/watcher.js";
import { registerStockTimelineHandlers } from "./handlers/stockTimeline.js";

export function setupIPC(): void {
  registerConfigHandlers(safeHandle);
  registerDialogHandlers(safeHandle);
  registerImportHandlers(safeHandle);
  registerAnalysisHandlers(safeHandle);
  registerLlmHandlers(safeHandle);
  registerStatsHandlers(safeHandle);
  registerWatcherHandlers(safeHandle);
  registerDolphinHandlers(safeHandle);
  registerStockTimelineHandlers(safeHandle);
}
