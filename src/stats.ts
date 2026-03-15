import {
  getOverallRecord,
  getTotalGames,
  getMatchupRecords,
  getStageRecords,
  getStatTrend,
  getOpponentHistory,
  getLatestAnalysis,
  detectSets,
  closeDb,
} from "./db";

// ── CLI stats display ────────────────────────────────────────────────

function printOverview(): void {
  const record = getOverallRecord();
  const total = record.totalGames;

  if (total === 0) {
    console.log("No games imported yet. Run:");
    console.log("  npx tsx src/import-cli.ts <folder or file.slp>");
    console.log("  npx tsx src/watcher.ts <replay-folder>");
    return;
  }

  const winRate = total > 0 ? ((record.wins / total) * 100).toFixed(1) : "0.0";

  console.log("=== Coach-Clippi Stats ===\n");
  console.log(`Total games: ${total}`);
  console.log(`Record: ${record.wins}W - ${record.losses}L (${winRate}%)\n`);
}

function printMatchups(): void {
  const matchups = getMatchupRecords();
  if (matchups.length === 0) return;

  console.log("--- Matchup Records ---");
  for (const m of matchups) {
    const wr = (m.winRate * 100).toFixed(1);
    console.log(`  vs ${m.opponentCharacter}: ${m.wins}W-${m.losses}L (${wr}%) [${m.totalGames} games]`);
  }
  console.log();
}

function printStages(): void {
  const stages = getStageRecords();
  if (stages.length === 0) return;

  console.log("--- Stage Records ---");
  for (const s of stages) {
    const wr = (s.winRate * 100).toFixed(1);
    console.log(`  ${s.stage}: ${s.wins}W-${s.losses}L (${wr}%) [${s.totalGames} games]`);
  }
  console.log();
}

function printTrend(stat: string, label: string, limit: number = 20): void {
  const points = getStatTrend(stat, { limit });
  if (points.length < 2) return;

  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  const delta = last - first;
  const arrow = delta > 0.01 ? "↑" : delta < -0.01 ? "↓" : "→";
  const pct = (v: number) => (v * 100).toFixed(1) + "%";

  console.log(`  ${label}: ${pct(last)} ${arrow} (was ${pct(first)}, ${points.length} games)`);
}

function printTrends(): void {
  const total = getTotalGames();
  if (total < 2) return;

  console.log("--- Trends (last 20 games) ---");
  printTrend("neutral_win_rate", "Neutral win rate");
  printTrend("conversion_rate", "Conversion rate");
  printTrend("l_cancel_rate", "L-cancel rate");
  printTrend("recovery_success_rate", "Recovery rate");
  printTrend("ledge_entropy", "Ledge mixup");
  printTrend("knockdown_entropy", "Getup mixup");
  console.log();
}

function printOpponents(search?: string): void {
  const opponents = getOpponentHistory(search);
  if (opponents.length === 0) {
    if (search) {
      console.log(`No games found against "${search}".`);
    }
    return;
  }

  console.log(search ? `--- Games vs "${search}" ---` : "--- Opponent History ---");
  for (const o of opponents) {
    const wr = (o.winRate * 100).toFixed(1);
    const code = o.opponentConnectCode ? ` (${o.opponentConnectCode})` : "";
    const chars = o.characters;
    console.log(`  ${o.opponentTag}${code}: ${o.wins}W-${o.losses}L (${wr}%) [${o.totalGames} games] — ${chars}`);
  }
  console.log();
}

function printSets(): void {
  const sets = detectSets();
  if (sets.length === 0) return;

  // Show last 10 sets
  const recent = sets.slice(-10);
  console.log("--- Recent Sets ---");
  for (const s of recent) {
    const total = s.wins + s.losses;
    const date = s.startedAt.split("T")[0];
    const setResult = s.wins > s.losses ? "W" : s.losses > s.wins ? "L" : "T";
    console.log(`  ${date} vs ${s.opponentTag} (${s.opponentCharacter}): ${s.wins}-${s.losses} [${setResult}] (${total} games)`);
  }
  console.log();
}

function printLastAnalysis(): void {
  const analyses = getLatestAnalysis(1);
  if (analyses.length === 0) {
    console.log("No coaching analyses stored yet. Run with --analyze to generate one.");
    return;
  }
  const a = analyses[0]!;
  console.log(`--- Latest Coaching Analysis (${a.createdAt}, ${a.modelUsed}) ---\n`);
  console.log(a.analysisText);
}

// ── Arg parsing ──────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  command: "overview" | "opponents" | "sets" | "analysis";
  search?: string | undefined;
} {
  const args = argv.slice(2);

  if (args.length === 0) return { command: "overview" };

  const cmd = args[0]!;
  if (cmd === "opponents" || cmd === "vs") {
    return { command: "opponents", search: args[1] };
  }
  if (cmd === "sets") {
    return { command: "sets" };
  }
  if (cmd === "analysis" || cmd === "coaching") {
    return { command: "analysis" };
  }

  // Default: treat arg as opponent search
  return { command: "opponents", search: cmd };
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  const { command, search } = parseArgs(process.argv);

  try {
    switch (command) {
      case "overview":
        printOverview();
        printMatchups();
        printStages();
        printTrends();
        printSets();
        break;
      case "opponents":
        printOpponents(search);
        break;
      case "sets":
        printSets();
        break;
      case "analysis":
        printLastAnalysis();
        break;
    }
  } finally {
    closeDb();
  }
}

if (require.main === module) {
  main();
}
