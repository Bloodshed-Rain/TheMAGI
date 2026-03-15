import { saveConfig, loadConfig, CONFIG_PATH } from "./config";

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const config = loadConfig();
    console.log(`Coach-Clippi config (${CONFIG_PATH}):\n`);
    console.log(`  Target player:  ${config.targetPlayer ?? "(not set)"}`);
    console.log(`  Connect code:   ${config.connectCode ?? "(not set)"}`);
    console.log(`  Replay folder:  ${config.replayFolder ?? "(not set)"}`);
    console.log(`  Gemini API key: ${config.geminiApiKey ? "(set)" : "(not set)"}`);
    console.log();
    console.log("Usage:");
    console.log("  npx tsx src/setup.ts --tag YourTag --code YOUR#123 --folder /path/to/replays --key AIza...");
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
    } else if ((arg === "--key" || arg === "--api-key") && next) {
      updates["geminiApiKey"] = next;
      i++;
    }
  }

  if (Object.keys(updates).length === 0) {
    console.error("No valid options provided. Use --tag, --code, --folder, or --key.");
    process.exit(1);
  }

  const config = saveConfig(updates);
  console.log("Config saved!\n");
  console.log(`  Target player:  ${config.targetPlayer ?? "(not set)"}`);
  console.log(`  Connect code:   ${config.connectCode ?? "(not set)"}`);
  console.log(`  Replay folder:  ${config.replayFolder ?? "(not set)"}`);
  console.log(`  Gemini API key: ${config.geminiApiKey ? "(set)" : "(not set)"}`);
}

if (require.main === module) {
  main();
}
