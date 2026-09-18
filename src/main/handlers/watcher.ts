import { Notification } from "electron";
import { watchReplays } from "../../watcher.js";
import { getGameHighlights } from "../../db.js";
import { getMainWindow, getFileWatcher, setFileWatcher, getImportListener } from "../state.js";
import { type SafeHandleFn, validatePath } from "../ipc.js";

/** Desktop notification when an imported game recorded highlights. Shared by
 *  the folder watcher and Cornerman's live-completion import. */
export function notifyGameHighlights(gameId: number): void {
  try {
    const highlights = getGameHighlights(gameId);
    if (highlights.length > 0) {
      const labels = highlights.map((h) => h.label);
      const unique = [...new Set(labels)];
      new Notification({
        title: "MAGI — Game Highlights",
        body: unique.join(", "),
      }).show();
    }
  } catch {
    // Non-critical — don't break the import flow
  }
}

/** Start (or restart) the replay folder watcher. Shared by watcher:start and cornerman:start. */
export function startReplayWatcher(replayFolder: string, targetPlayer: string): void {
  const safeFolder = validatePath(replayFolder);
  const existing = getFileWatcher();
  if (existing) {
    existing.close();
  }
  setFileWatcher(
    watchReplays({
      replayFolder: safeFolder,
      targetPlayer,
      importExisting: false,
      onImport: (result) => {
        // Strip the parsed GameResult before crossing the IPC boundary — it's huge.
        getMainWindow()?.webContents.send("watcher:imported", {
          filePath: result.filePath,
          skipped: result.skipped,
          gameId: result.gameId,
        });

        // Fan out the full payload (incl. gameResult) to the in-process listener (Cornerman).
        try {
          getImportListener()?.(result);
        } catch (err) {
          console.error("[watcher] import listener failed:", err);
        }

        // Fire desktop notification if the game has highlights
        if (result.gameId && !result.skipped) {
          notifyGameHighlights(result.gameId);
        }
      },
      onError: (err) => {
        getMainWindow()?.webContents.send("watcher:error", err.message);
      },
    }),
  );
}

export function registerWatcherHandlers(safeHandle: SafeHandleFn): void {
  safeHandle("watcher:status", () => getFileWatcher() !== null);
  safeHandle("watcher:start", (_e, replayFolder: string, targetPlayer: string) => {
    startReplayWatcher(replayFolder, targetPlayer);
    return true;
  });

  safeHandle("watcher:stop", () => {
    const watcher = getFileWatcher();
    if (watcher) {
      watcher.close();
      setFileWatcher(null);
    }
    return true;
  });
}
