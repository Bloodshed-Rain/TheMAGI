import { detectSets, type DetectedSet, type GameMeta } from "./detect-sets";
import { processGame, findPlayerIdx, type GameResult } from "./pipeline";
import * as fs from "fs";

// ── Types ────────────────────────────────────────────────────────────

interface CharacterStats {
  character: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  incomplete: number;
}

interface MatchupRecord {
  opponent: string;
  sets: number;
  setWins: number;
  setLosses: number;
  games: number;
  gameWins: number;
  gameLosses: number;
}

interface PerformanceTrend {
  date: string; // YYYY-MM-DD
  gameFile: string;
  opponent: string;
  character: string;
  opponentCharacter: string;
  won: boolean | null;
  neutralWinRate: number;
  openingsPerKill: number;
  avgDamagePerOpening: number;
  lCancelRate: number;
  conversionRate: number;
  avgDeathPercent: number;
  recoverySuccessRate: number;
}

interface HabitAggregate {
  option: string;
  totalFrequency: number;
}

interface PlayerProfile {
  tag: string;
  totalGames: number;
  totalSets: number;
  overallRecord: { wins: number; losses: number; incomplete: number };
  setRecord: { wins: number; losses: number; splits: number };
  characters: CharacterStats[];
  matchups: MatchupRecord[];
  trends: PerformanceTrend[];
  aggregateStats: {
    avgNeutralWinRate: number;
    avgOpeningsPerKill: number;
    avgDamagePerOpening: number;
    avgLCancelRate: number;
    avgConversionRate: number;
    avgDeathPercent: number;
    avgRecoverySuccessRate: number;
  };
  habits: {
    knockdown: HabitAggregate[];
    ledge: HabitAggregate[];
    shield: HabitAggregate[];
  };
  topMoves: { move: string; totalCount: number; avgHitRate: number }[];
}

// ── Profile builder ──────────────────────────────────────────────────

function ratio(a: number, b: number): number {
  return b === 0 ? 0 : Math.round((a / b) * 10000) / 10000;
}

export function buildPlayerProfile(
  directory: string,
  playerTag: string,
): PlayerProfile {
  const sets = detectSets(directory);

  // Filter to sets involving this player
  const playerSets = sets.filter(
    (s) =>
      s.players[0] === playerTag ||
      s.players[1] === playerTag ||
      s.games.some(
        (g) =>
          g.players[0].tag === playerTag || g.players[1].tag === playerTag,
      ),
  );

  const trends: PerformanceTrend[] = [];
  const charMap = new Map<string, CharacterStats>();
  const matchupMap = new Map<string, MatchupRecord>();
  const knockdownMap = new Map<string, number>();
  const ledgeMap = new Map<string, number>();
  const shieldMap = new Map<string, number>();
  const moveMap = new Map<string, { count: number; hitRateSum: number; games: number }>();

  let totalWins = 0;
  let totalLosses = 0;
  let totalIncomplete = 0;
  let totalGames = 0;

  let setWins = 0;
  let setLosses = 0;
  let setSplits = 0;

  // Stat accumulators
  let sumNeutralWinRate = 0;
  let sumOpeningsPerKill = 0;
  let sumDamagePerOpening = 0;
  let sumLCancelRate = 0;
  let sumConversionRate = 0;
  let sumDeathPercent = 0;
  let sumRecoveryRate = 0;
  let statGames = 0; // games with valid stats

  for (const set of playerSets) {
    // Determine opponent tag
    const opponentTag =
      set.players[0] === playerTag ? set.players[1] : set.players[0];

    // Track set record
    let setPlayerWins = 0;
    let setPlayerLosses = 0;

    for (let i = 0; i < set.games.length; i++) {
      const gameMeta = set.games[i]!;

      // Find player index in this game
      const pIdx =
        gameMeta.players[0].tag === playerTag ? 0 : 1;
      const oIdx = pIdx === 0 ? 1 : 0;

      const myChar = gameMeta.players[pIdx].character;
      const oppChar = gameMeta.players[oIdx].character;

      // Win/loss
      const won =
        gameMeta.winner === playerTag
          ? true
          : gameMeta.winner === null
            ? null
            : false;

      if (won === true) {
        totalWins++;
        setPlayerWins++;
      } else if (won === false) {
        totalLosses++;
        setPlayerLosses++;
      } else {
        totalIncomplete++;
      }
      totalGames++;

      // Character stats
      const existing = charMap.get(myChar) ?? {
        character: myChar,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        incomplete: 0,
      };
      existing.gamesPlayed++;
      if (won === true) existing.wins++;
      else if (won === false) existing.losses++;
      else existing.incomplete++;
      charMap.set(myChar, existing);

      // Process full stats
      let result: ReturnType<typeof processGame>;
      try {
        result = processGame(gameMeta.filePath, i + 1);
      } catch {
        continue;
      }

      const playerIdx = findPlayerIdx(result.gameSummary, playerTag);
      const playerSummary = result.gameSummary.players[playerIdx];
      const insights = result.derivedInsights[playerIdx];

      // Performance trend
      const date = gameMeta.startAt
        ? gameMeta.startAt.toISOString().slice(0, 10)
        : "unknown";

      trends.push({
        date,
        gameFile: gameMeta.filePath,
        opponent: opponentTag,
        character: myChar,
        opponentCharacter: oppChar,
        won,
        neutralWinRate: playerSummary.neutralWinRate,
        openingsPerKill: playerSummary.openingsPerKill,
        avgDamagePerOpening: playerSummary.averageDamagePerOpening,
        lCancelRate: playerSummary.lCancelRate,
        conversionRate: playerSummary.conversionRate,
        avgDeathPercent: playerSummary.avgDeathPercent,
        recoverySuccessRate: playerSummary.recoverySuccessRate,
      });

      // Accumulate averages
      sumNeutralWinRate += playerSummary.neutralWinRate;
      sumOpeningsPerKill += playerSummary.openingsPerKill;
      sumDamagePerOpening += playerSummary.averageDamagePerOpening;
      sumLCancelRate += playerSummary.lCancelRate;
      sumConversionRate += playerSummary.conversionRate;
      sumDeathPercent += playerSummary.avgDeathPercent;
      sumRecoveryRate += playerSummary.recoverySuccessRate;
      statGames++;

      // Habits
      for (const opt of insights.afterKnockdown.options) {
        knockdownMap.set(opt.action, (knockdownMap.get(opt.action) ?? 0) + opt.frequency);
      }
      for (const opt of insights.afterLedgeGrab.options) {
        ledgeMap.set(opt.action, (ledgeMap.get(opt.action) ?? 0) + opt.frequency);
      }
      for (const opt of insights.afterShieldPressure.options) {
        shieldMap.set(opt.action, (shieldMap.get(opt.action) ?? 0) + opt.frequency);
      }

      // Moves
      for (const m of playerSummary.moveUsage) {
        const e = moveMap.get(m.move) ?? { count: 0, hitRateSum: 0, games: 0 };
        e.count += m.count;
        e.hitRateSum += m.hitRate;
        e.games++;
        moveMap.set(m.move, e);
      }
    }

    // Matchup record
    const mr = matchupMap.get(opponentTag) ?? {
      opponent: opponentTag,
      sets: 0,
      setWins: 0,
      setLosses: 0,
      games: 0,
      gameWins: 0,
      gameLosses: 0,
    };
    mr.sets++;
    mr.games += set.games.length;
    mr.gameWins += setPlayerWins;
    mr.gameLosses += setPlayerLosses;

    // Set win/loss
    if (setPlayerWins > setPlayerLosses) {
      mr.setWins++;
      setWins++;
    } else if (setPlayerLosses > setPlayerWins) {
      mr.setLosses++;
      setLosses++;
    } else {
      setSplits++;
    }
    matchupMap.set(opponentTag, mr);
  }

  // Build sorted outputs
  const characters = [...charMap.values()].sort(
    (a, b) => b.gamesPlayed - a.gamesPlayed,
  );

  const matchups = [...matchupMap.values()].sort(
    (a, b) => b.games - a.games,
  );

  const toHabitList = (m: Map<string, number>): HabitAggregate[] =>
    [...m.entries()]
      .map(([option, totalFrequency]) => ({ option, totalFrequency }))
      .sort((a, b) => b.totalFrequency - a.totalFrequency);

  const topMoves = [...moveMap.entries()]
    .map(([move, d]) => ({
      move,
      totalCount: d.count,
      avgHitRate: ratio(d.hitRateSum, d.games),
    }))
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, 15);

  return {
    tag: playerTag,
    totalGames,
    totalSets: playerSets.length,
    overallRecord: { wins: totalWins, losses: totalLosses, incomplete: totalIncomplete },
    setRecord: { wins: setWins, losses: setLosses, splits: setSplits },
    characters,
    matchups,
    trends,
    aggregateStats: {
      avgNeutralWinRate: ratio(sumNeutralWinRate, statGames),
      avgOpeningsPerKill: statGames > 0 ? Math.round((sumOpeningsPerKill / statGames) * 100) / 100 : 0,
      avgDamagePerOpening: statGames > 0 ? Math.round((sumDamagePerOpening / statGames) * 100) / 100 : 0,
      avgLCancelRate: ratio(sumLCancelRate, statGames),
      avgConversionRate: ratio(sumConversionRate, statGames),
      avgDeathPercent: statGames > 0 ? Math.round(sumDeathPercent / statGames) : 0,
      avgRecoverySuccessRate: ratio(sumRecoveryRate, statGames),
    },
    habits: {
      knockdown: toHabitList(knockdownMap),
      ledge: toHabitList(ledgeMap),
      shield: toHabitList(shieldMap),
    },
    topMoves,
  };
}

// ── Pretty print ─────────────────────────────────────────────────────

function printProfile(profile: PlayerProfile): void {
  const p = profile;
  console.log(`\n=== Player Profile: ${p.tag} ===\n`);
  console.log(`Games: ${p.totalGames} (${p.overallRecord.wins}W-${p.overallRecord.losses}L${p.overallRecord.incomplete > 0 ? `-${p.overallRecord.incomplete}Inc` : ""})`);
  console.log(`Sets:  ${p.totalSets} (${p.setRecord.wins}W-${p.setRecord.losses}L${p.setRecord.splits > 0 ? `-${p.setRecord.splits}Split` : ""})`);

  console.log(`\n--- Characters ---`);
  for (const c of p.characters) {
    console.log(`  ${c.character.padEnd(8)} ${c.gamesPlayed} games (${c.wins}W-${c.losses}L)`);
  }

  console.log(`\n--- Aggregate Stats ---`);
  const s = p.aggregateStats;
  console.log(`  Neutral win rate:      ${(s.avgNeutralWinRate * 100).toFixed(1)}%`);
  console.log(`  Openings per kill:     ${s.avgOpeningsPerKill}`);
  console.log(`  Avg dmg/opening:       ${s.avgDamagePerOpening}`);
  console.log(`  L-cancel rate:         ${(s.avgLCancelRate * 100).toFixed(1)}%`);
  console.log(`  Conversion rate:       ${(s.avgConversionRate * 100).toFixed(1)}%`);
  console.log(`  Avg death %:           ${s.avgDeathPercent}%`);
  console.log(`  Recovery success:      ${(s.avgRecoverySuccessRate * 100).toFixed(1)}%`);

  console.log(`\n--- Top Moves ---`);
  for (const m of p.topMoves.slice(0, 10)) {
    console.log(`  ${m.move.padEnd(14)} ${String(m.totalCount).padStart(4)}x   hit rate: ${(m.avgHitRate * 100).toFixed(1)}%`);
  }

  console.log(`\n--- Habits (all games) ---`);
  const printHabits = (label: string, habits: HabitAggregate[]) => {
    const total = habits.reduce((s, h) => s + h.totalFrequency, 0);
    console.log(`  ${label}:`);
    for (const h of habits) {
      const pct = total > 0 ? ((h.totalFrequency / total) * 100).toFixed(0) : "0";
      console.log(`    ${h.option.padEnd(18)} ${String(h.totalFrequency).padStart(3)}x (${pct}%)`);
    }
  };
  printHabits("After knockdown", p.habits.knockdown);
  printHabits("From ledge", p.habits.ledge);
  printHabits("Out of shield", p.habits.shield);

  console.log(`\n--- Matchups ---`);
  for (const m of p.matchups) {
    console.log(`  ${m.opponent.padEnd(20)} Sets: ${m.setWins}-${m.setLosses}  Games: ${m.gameWins}-${m.gameLosses}`);
  }

  // Performance trend summary: first week vs last week
  if (p.trends.length >= 4) {
    const sorted = [...p.trends].filter(t => t.date !== "unknown").sort((a, b) => a.date.localeCompare(b.date));
    const half = Math.floor(sorted.length / 2);
    const early = sorted.slice(0, half);
    const late = sorted.slice(half);

    const avg = (arr: PerformanceTrend[], fn: (t: PerformanceTrend) => number) =>
      arr.length > 0 ? arr.reduce((s, t) => s + fn(t), 0) / arr.length : 0;

    console.log(`\n--- Trend: First Half vs Second Half ---`);
    console.log(`  (${early.length} games vs ${late.length} games)`);

    const metrics: [string, (t: PerformanceTrend) => number, boolean][] = [
      ["Neutral win rate", (t) => t.neutralWinRate, true],
      ["L-cancel rate", (t) => t.lCancelRate, true],
      ["Openings/kill", (t) => t.openingsPerKill, false],
      ["Dmg/opening", (t) => t.avgDamagePerOpening, true],
      ["Conversion rate", (t) => t.conversionRate, true],
      ["Death %", (t) => t.avgDeathPercent, true],
    ];

    for (const [name, fn, higherBetter] of metrics) {
      const e = avg(early, fn);
      const l = avg(late, fn);
      const delta = l - e;
      const arrow =
        Math.abs(delta) < 0.01
          ? "→"
          : (higherBetter ? delta > 0 : delta < 0)
            ? "↑"
            : "↓";
      console.log(`  ${name.padEnd(20)} ${e.toFixed(2)} → ${l.toFixed(2)}  ${arrow}`);
    }
  }
}

// ── CLI ──────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  let dir = "test-replays";
  let playerTag: string | null = null;
  let jsonMode = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--dir" && i + 1 < args.length) {
      dir = args[++i]!;
    } else if (arg === "--json") {
      jsonMode = true;
    } else if (!arg.startsWith("--")) {
      playerTag = arg;
    }
  }

  if (!playerTag) {
    console.error("Usage: npx tsx src/player-profile.ts <player-tag> [--dir <replay-folder>] [--json]");
    process.exit(1);
  }

  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  console.error(`Building profile for "${playerTag}" from ${dir}...`);
  const profile = buildPlayerProfile(dir, playerTag);

  if (jsonMode) {
    console.log(JSON.stringify(profile, null, 2));
  } else {
    printProfile(profile);
  }
}

if (require.main === module) {
  main();
}
