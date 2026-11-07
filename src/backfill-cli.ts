/**
 * Backfill CLI: re-parse imported replays and rebuild every per-game derived
 * row (event tables, game_stats, signature stats, highlights) for games
 * imported before the current detectors.
 *
 * Usage:
 *   npm run backfill [-- --force] [-- --limit N]
 *   (scripts/backfill.js sets ELECTRON_RUN_AS_NODE=1 and runs this file under Electron's Node)
 *
 *   --force    Re-process every game, replacing existing event rows
 *   --limit N  Only process the first N candidate games (smoke testing)
 */

import { backfillFrameEvents } from "./backfill";
import { closeDb } from "./db";
import { parsePool } from "./parsePool";

function parseArgs(argv: string[]): { force: boolean; limit: number | undefined } {
  let force = false;
  let limit: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force") force = true;
    else if (arg === "--limit") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0) {
        console.error("--limit requires a positive number");
        process.exit(1);
      }
      limit = value;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: npm run backfill [-- --force] [-- --limit N]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return { force, limit };
}

async function main(): Promise<void> {
  const { force, limit } = parseArgs(process.argv.slice(2));

  console.log(`[backfill] Scanning for games ${force ? "(--force: all games)" : "missing per-instance events"}...`);
  const started = Date.now();

  const result = await backfillFrameEvents({
    force,
    ...(limit != null ? { limit } : {}),
    onProgress: (p) => {
      console.log(
        `[backfill] ${p.done}/${p.total} — ok ${p.backfilled}, missing ${p.missingFile}, moved ${p.hashMismatch}, failed ${p.failed}`,
      );
    },
  });

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log("");
  console.log(`Backfill complete in ${seconds}s:`);
  console.log(`  games examined:   ${result.total}`);
  console.log(`  backfilled:       ${result.backfilled}`);
  console.log(`  file missing:     ${result.missingFile}`);
  console.log(`  file moved/hash:  ${result.hashMismatch}`);
  console.log(`  parse failures:   ${result.failed}`);
  if (result.total === 0) {
    console.log("  (nothing to do — every game already has event rows; use --force to rebuild)");
  }
}

main()
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[backfill] Fatal: ${message}`);
    if (message.includes("NODE_MODULE_VERSION")) {
      // better-sqlite3 is compiled against Electron's ABI (electron-rebuild),
      // so plain node can't load it. Run through Electron's node instead:
      console.error("");
      console.error("better-sqlite3 is built for Electron's ABI. Run this CLI through Electron:");
      console.error("  npm run backfill");
      console.error("  (scripts/backfill.js sets ELECTRON_RUN_AS_NODE=1 for any shell; options go after --)");
    }
    process.exitCode = 1;
  })
  .finally(() => {
    parsePool.terminate();
    closeDb();
  });
