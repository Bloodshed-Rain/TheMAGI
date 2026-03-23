import * as path from "path";
import { importReplays, importAndAnalyze, type ImportProgressCallback } from "../../importer.js";
import { type SafeHandleFn, validatePath } from "../ipc.js";
import { getMainWindow } from "../state.js";

function createProgressSender(): ImportProgressCallback {
  return (progress) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("import:progress", progress);
    }
  };
}

export function registerImportHandlers(safeHandle: SafeHandleFn): void {
  safeHandle("import:folder", async (_e, folderPath: string, targetPlayer: string) => {
    const safePath = validatePath(folderPath);
    const fs = require("fs") as typeof import("fs");
    const files: string[] = [];
    const walk = (dir: string) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith(".slp")) files.push(full);
        }
      } catch (err) {
        console.error(`[import] Cannot read directory ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    walk(safePath);

    if (files.length === 0) {
      throw new Error(`No .slp replay files found in: ${safePath}`);
    }

    files.sort();

    const onProgress = createProgressSender();
    const result = importReplays(files, targetPlayer, onProgress);
    return {
      imported: result.imported.filter((r) => !r.skipped).length,
      skipped: result.skipped,
      total: files.length,
    };
  });

  safeHandle("import:analyze", async (_e, filePaths: string[], targetPlayer: string) => {
    const onProgress = createProgressSender();
    return importAndAnalyze(filePaths, targetPlayer, onProgress);
  });
}
