// CLI entry point for the analysis pipeline.
// Usage: npx tsx src/pipeline-cli.ts <file.slp> [--target player] [--json]

import { processGame, computeAdaptationSignals, findPlayerIdx, assembleUserPrompt, SYSTEM_PROMPT } from "./pipeline/index.js";
import type { GameResult } from "./pipeline/index.js";

function parseArgs(argv: string[]): {
  filePaths: string[];
  targetPlayer: string | null;
  jsonMode: boolean;
  dir: string | null;
  setNumber: number | null;
  listSets: boolean;
} {
  const args = argv.slice(2);
  const filePaths: string[] = [];
  let targetPlayer: string | null = null;
  let jsonMode = false;
  let dir: string | null = null;
  let setNumber: number | null = null;
  let listSets = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--target" && i + 1 < args.length) {
      targetPlayer = args[++i]!;
    } else if (arg === "--json") {
      jsonMode = true;
    } else if (arg === "--dir" && i + 1 < args.length) {
      dir = args[++i]!;
    } else if (arg === "--set" && i + 1 < args.length) {
      setNumber = parseInt(args[++i]!, 10);
    } else if (arg === "--sets") {
      listSets = true;
    } else if (!arg.startsWith("--")) {
      filePaths.push(arg);
    }
  }

  return { filePaths, targetPlayer, jsonMode, dir, setNumber, listSets };
}

function dumpJson(gameResults: GameResult[]): void {
  const output = {
    games: gameResults.map((r) => ({
      gameSummary: r.gameSummary,
      derivedInsights: {
        [r.gameSummary.players[0].tag]: r.derivedInsights[0],
        [r.gameSummary.players[1].tag]: r.derivedInsights[1],
      },
    })),
  };
  console.log(JSON.stringify(output, null, 2));
}

async function main() {
  const { filePaths, targetPlayer, jsonMode, dir, setNumber, listSets } =
    parseArgs(process.argv);

  // --dir mode: auto-detect sets from a replay folder
  if (dir || listSets) {
    const { detectSets } = require("./detect-sets") as typeof import("./detect-sets");
    const replayDir = dir || "test-replays";
    const sets = detectSets(replayDir);

    if (listSets || setNumber == null) {
      // List all detected sets
      console.error(`Found ${sets.length} sets in ${replayDir}\n`);
      for (let i = 0; i < sets.length; i++) {
        const set = sets[i]!;
        const wins = [0, 0];
        for (const g of set.games) {
          if (g.winner === set.players[0]) wins[0]!++;
          else if (g.winner === set.players[1]) wins[1]!++;
        }
        const chars = set.games.map(
          (g) => `${g.players[0].character}/${g.players[1].character}`,
        );
        console.error(
          `  ${(i + 1).toString().padStart(2)}. ${set.players[0]} vs ${set.players[1]} — ${set.games.length} game${set.games.length > 1 ? "s" : ""} (${wins[0]}-${wins[1]}) [${chars.join(", ")}]`,
        );
      }
      if (!listSets) {
        console.error(
          "\nUse --set <number> to analyze a set, e.g.: npx tsx src/pipeline-cli.ts --dir test-replays --set 9",
        );
      }
      return;
    }

    // Validate set number
    if (setNumber < 1 || setNumber > sets.length) {
      console.error(`Set ${setNumber} not found. There are ${sets.length} sets.`);
      process.exit(1);
    }

    const selectedSet = sets[setNumber - 1]!;

    // Use the set's file paths, fall through to normal processing
    for (const g of selectedSet.games) {
      filePaths.push(g.filePath);
    }
  }

  if (filePaths.length === 0) {
    console.error(
      "Usage:\n" +
        "  npx tsx src/pipeline-cli.ts <file1.slp> [file2.slp ...] [--target player] [--json]\n" +
        "  npx tsx src/pipeline-cli.ts --dir <replay-folder> [--sets]\n" +
        "  npx tsx src/pipeline-cli.ts --dir <replay-folder> --set <number> [--target player] [--json]",
    );
    process.exit(1);
  }

  // Process all games
  const gameResults: GameResult[] = [];
  for (let i = 0; i < filePaths.length; i++) {
    gameResults.push(processGame(filePaths[i]!, i + 1));
  }

  const firstGame = gameResults[0]!.gameSummary;

  // Resolve target player tag (default to first named player)
  const targetTag =
    targetPlayer ??
    firstGame.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ??
    firstGame.players[0].tag;

  // Compute adaptation signals for multi-game sets
  if (gameResults.length >= 2) {
    const p0Tag = firstGame.players[0].tag;
    const p1Tag = firstGame.players[1].tag;

    const p0Signals = computeAdaptationSignals(gameResults, p0Tag);
    const p1Signals = computeAdaptationSignals(gameResults, p1Tag);

    // Attach to the last game's derived insights
    const lastResult = gameResults[gameResults.length - 1]!;
    const lastP0Idx = findPlayerIdx(lastResult.gameSummary, p0Tag);
    const lastP1Idx = findPlayerIdx(lastResult.gameSummary, p1Tag);
    lastResult.derivedInsights[lastP0Idx].adaptationSignals = p0Signals;
    lastResult.derivedInsights[lastP1Idx].adaptationSignals = p1Signals;
  }

  // JSON-only mode
  if (jsonMode) {
    dumpJson(gameResults);
    return;
  }

  const userPrompt = assembleUserPrompt(gameResults, targetTag);

  // Status output
  for (const r of gameResults) {
    const g = r.gameSummary;
    console.error(
      `Game ${g.gameNumber}: ${g.stage} — ${g.players[0].tag} (${g.players[0].character}) vs ${g.players[1].tag} (${g.players[1].character})`,
    );
  }
  console.error(`Perspective: ${targetTag}`);

  // Resolve LLM config from user config + env vars
  const configMod = require("./config") as typeof import("./config");
  const llmMod = require("./llm") as typeof import("./llm");
  const userConfig = configMod.loadConfig();
  const llmConfig: import("./llm").LLMConfig = {
    modelId: userConfig.llmModelId ?? llmMod.LLM_DEFAULTS.modelId,
    apiKeys: userConfig.apiKeys,
    localEndpoint: userConfig.localEndpoint,
  };

  console.error(`Calling ${llmMod.getModelLabel(llmConfig.modelId)}...`);

  try {
    const analysis = await llmMod.callLLM({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      config: llmConfig,
    });
    console.log(analysis);
  } catch (err) {
    console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
    console.error("Game summary data (so your analysis isn't lost):\n");
    dumpJson(gameResults);
    process.exit(1);
  }
}

// Only run when executed directly, not when imported
if (require.main === module) {
  main();
}
