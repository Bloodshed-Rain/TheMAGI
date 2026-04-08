import { saveConfig, loadConfig, CONFIG_PATH } from "./config";
import { getModelLabel, LLM_DEFAULTS } from "./llm";

function printConfig() {
  const config = loadConfig();
  const modelId = config.llmModelId ?? LLM_DEFAULTS.modelId;
  console.log(`  Target player:    ${config.targetPlayer ?? "(not set)"}`);
  console.log(`  Connect code:     ${config.connectCode ?? "(not set)"}`);
  console.log(`  Replay folder:    ${config.replayFolder ?? "(not set)"}`);
  console.log(`  AI model:         ${getModelLabel(modelId)}`);
  console.log(`  OpenRouter key:   ${config.openrouterApiKey ? "(set)" : "(not set)"}`);
  console.log(`  Gemini key:       ${config.geminiApiKey ? "(set)" : "(not set)"}`);
  console.log(`  Anthropic key:    ${config.anthropicApiKey ? "(set)" : "(not set)"}`);
  console.log(`  OpenAI:           (provided by MAGI proxy)`);
  console.log(`  Local endpoint:   ${config.localEndpoint ?? "(default: localhost:1234)"}`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`MAGI config (${CONFIG_PATH}):\n`);
    printConfig();
    console.log();
    console.log("Usage:");
    console.log("  npx tsx src/setup.ts --tag YourTag --code YOUR#123 --folder /path/to/replays");
    console.log("  npx tsx src/setup.ts --model deepseek/deepseek-chat --openrouter-key sk-or-...");
    console.log("  npx tsx src/setup.ts --model gemini-2.5-flash --gemini-key AIza...");
    return;
  }

  const updates: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const next = args[i + 1];
    if ((arg === "--tag" || arg === "--target") && next) {
      updates["targetPlayer"] = next;
      i++;
    } else if ((arg === "--code" || arg === "--connect-code") && next) {
      updates["connectCode"] = next;
      i++;
    } else if ((arg === "--folder" || arg === "--replays") && next) {
      updates["replayFolder"] = next;
      i++;
    } else if (arg === "--model" && next) {
      updates["llmModelId"] = next;
      i++;
    } else if (arg === "--openrouter-key" && next) {
      updates["openrouterApiKey"] = next;
      i++;
    } else if ((arg === "--key" || arg === "--gemini-key") && next) {
      updates["geminiApiKey"] = next;
      i++;
    } else if (arg === "--anthropic-key" && next) {
      updates["anthropicApiKey"] = next;
      i++;
    } else if (arg === "--local-endpoint" && next) {
      updates["localEndpoint"] = next;
      i++;
    }
  }

  if (Object.keys(updates).length === 0) {
    console.error("No valid options provided. Use --tag, --code, --folder, --model, or --<provider>-key.");
    process.exit(1);
  }

  saveConfig(updates);
  console.log("Config saved!\n");
  printConfig();
}

if (require.main === module) {
  main();
}
