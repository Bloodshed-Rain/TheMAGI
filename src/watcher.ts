import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import { importReplay } from "./importer";
import { closeDb } from "./db";
import { resolveTarget, resolveReplayFolder } from "./config";

interface WatcherOptions {
  replayFolder: string;
  targetPlayer: string | null;
  importExisting?: boolean;
  onImport?: (result: { filePath: string; skipped: boolean; gameId?: number | undefined }) => void;
  onError?: (error: Error, filePath: string) => void;
}

// ── Find existing .slp files ─────────────────────────────────────────

function findSlpFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".slp")) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files.sort();
}

// ── Watcher ──────────────────────────────────────────────────────────

export function watchReplays(options: WatcherOptions): { close: () => void } {
  const { replayFolder, targetPlayer, importExisting = true, onImport, onError } = options;

  let gameCount = 0;

  // Import existing replays first
  if (importExisting) {
    const existing = findSlpFiles(replayFolder);
    if (existing.length > 0) {
      console.log(`Found ${existing.length} existing replay(s), importing...`);
      let imported = 0;
      let skipped = 0;
      for (const filePath of existing) {
        gameCount++;
        try {
          const result = importReplay(filePath, targetPlayer, gameCount);
          if (result.skipped) {
            skipped++;
          } else {
            imported++;
          }
          onImport?.({
            filePath,
            skipped: result.skipped,
            gameId: result.gameId,
          });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.error(`[error] ${path.basename(filePath)}: ${error.message}`);
          onError?.(error, filePath);
        }
      }
      console.log(`Imported: ${imported}, Skipped (duplicate): ${skipped}`);
    }
  }

  console.log(`\nWatching for new .slp files in: ${replayFolder}`);

  const watcher = chokidar.watch("**/*.slp", {
    cwd: replayFolder,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 500,
    },
  });

  watcher.on("add", (relativePath) => {
    const absolutePath = path.join(replayFolder, relativePath);
    gameCount++;

    try {
      const result = importReplay(absolutePath, targetPlayer, gameCount);

      if (result.skipped) {
        console.log(`[skip] Already imported: ${relativePath}`);
      } else {
        console.log(
          `[imported] ${relativePath} → game #${result.gameId}`,
        );
      }

      onImport?.({
        filePath: absolutePath,
        skipped: result.skipped,
        gameId: result.gameId,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[error] Failed to import ${relativePath}: ${error.message}`);
      onError?.(error, absolutePath);
    }
  });

  watcher.on("error", (err: unknown) => {
    console.error(`Watcher error: ${err instanceof Error ? err.message : String(err)}`);
  });

  return {
    close: () => {
      watcher.close();
      closeDb();
    },
  };
}

// ── CLI entry point ──────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  let cliFolder: string | null = null;
  let cliTarget: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--target" && i + 1 < args.length) {
      cliTarget = args[++i]!;
    } else if (!arg.startsWith("--")) {
      cliFolder = arg;
    }
  }

  const replayFolder = resolveReplayFolder(cliFolder);
  const targetPlayer = resolveTarget(cliTarget);

  if (!replayFolder) {
    console.error(
      "Usage: npx tsx src/watcher.ts [replay-folder] [--target player]",
    );
    console.error("");
    console.error("Tip: Run 'npx tsx src/setup.ts --tag YourTag --folder /path/to/replays' once,");
    console.error("     then just run 'npx tsx src/watcher.ts' with no args.");
    process.exit(1);
  }

  const absoluteFolder = path.resolve(replayFolder);

  const { close } = watchReplays({
    replayFolder: absoluteFolder,
    targetPlayer,
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down watcher...");
    close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    close();
    process.exit(0);
  });

  console.log("Press Ctrl+C to stop.\n");
}

if (require.main === module) {
  main();
}
