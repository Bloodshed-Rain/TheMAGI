import fs from "fs";
import path from "path";
import { importReplays, importAndAnalyze } from "./importer";
import { closeDb } from "./db";
import { resolveTarget, resolveReplayFolder } from "./config";

function resolveSlpPaths(inputs: string[]): string[] {
  const files: string[] = [];
  for (const input of inputs) {
    const resolved = path.resolve(input);
    const stat = fs.statSync(resolved, { throwIfNoEntry: false });
    if (!stat) {
      console.error(`Warning: ${input} does not exist, skipping`);
      continue;
    }
    if (stat.isDirectory()) {
      // Recursively find all .slp files
      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.name.endsWith(".slp")) {
            files.push(full);
          }
        }
      };
      walk(resolved);
    } else if (resolved.endsWith(".slp")) {
      files.push(resolved);
    }
  }
  // Sort by filename (which typically contains timestamps)
  return files.sort();
}

function parseArgs(argv: string[]): {
  inputs: string[];
  targetPlayer: string | null;
  analyze: boolean;
} {
  const args = argv.slice(2);
  const inputs: string[] = [];
  let targetPlayer: string | null = null;
  let analyze = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--target" && i + 1 < args.length) {
      targetPlayer = args[++i]!;
    } else if (arg === "--analyze") {
      analyze = true;
    } else if (!arg.startsWith("--")) {
      inputs.push(arg);
    }
  }

  return { inputs, targetPlayer, analyze };
}

async function main() {
  const { inputs, targetPlayer: cliTarget, analyze } = parseArgs(process.argv);

  const targetPlayer = resolveTarget(cliTarget);

  // If no inputs given, try config replay folder
  let resolvedInputs = inputs;
  if (resolvedInputs.length === 0) {
    const folder = resolveReplayFolder(null);
    if (folder) {
      resolvedInputs = [folder];
    } else {
      console.error(
        "Usage: npx tsx src/import-cli.ts <file.slp | folder> [...] [--target player] [--analyze]",
      );
      console.error("");
      console.error("Options:");
      console.error("  --target <player>  Analyze from this player's perspective (or set via setup)");
      console.error("  --analyze          Also run AI coaching analysis (requires API key in config)");
      console.error("");
      console.error("Tip: Run 'npx tsx src/setup.ts --tag YourTag --folder /path/to/replays' once,");
      console.error("     then just run 'npx tsx src/import-cli.ts' with no args.");
      process.exit(1);
    }
  }

  const filePaths = resolveSlpPaths(resolvedInputs);

  if (filePaths.length === 0) {
    console.error("No .slp files found.");
    process.exit(1);
  }

  console.error(`Found ${filePaths.length} replay(s).`);

  try {
    if (analyze) {
      console.error(`Importing and analyzing...`);
      const { batchResult, analysis } = await importAndAnalyze(filePaths, targetPlayer);

      const imported = batchResult.imported.filter((r) => !r.skipped);
      console.error(
        `Imported: ${imported.length}, Skipped (duplicate): ${batchResult.skipped}`,
      );

      if (analysis) {
        console.log(analysis);
      } else {
        console.error("No new games to analyze (all duplicates).");
      }
    } else {
      console.error(`Importing ${filePaths.length} replay(s)...`);
      const result = importReplays(filePaths, targetPlayer);

      for (const r of result.imported) {
        if (r.skipped) {
          console.error(`  [skip] ${r.filePath}`);
        } else {
          console.error(`  [ok]   ${r.filePath} → game #${r.gameId}`);
        }
      }

      const imported = result.imported.filter((r) => !r.skipped);
      console.error(
        `\nDone. Imported: ${imported.length}, Skipped: ${result.skipped}`,
      );
    }
  } finally {
    closeDb();
  }
}

main();
