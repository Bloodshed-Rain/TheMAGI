import {
  SlippiGame,
  characters as characterUtils,
  stages as stageUtils,
  type PlayerType,
} from "@slippi/slippi-js/node";
import * as fs from "fs";
import * as path from "path";

// ── Types ────────────────────────────────────────────────────────────

export interface GameMeta {
  filePath: string;
  startAt: Date | null;
  durationSeconds: number;
  stage: string;
  players: [PlayerMeta, PlayerMeta];
  winner: string | null;
}

interface PlayerMeta {
  tag: string;
  connectCode: string;
  character: string;
  port: number;
}

export interface DetectedSet {
  players: [string, string]; // tags
  games: GameMeta[];
}

// ── Lightweight metadata scan ────────────────────────────────────────

function getTag(player: PlayerType): string {
  return (
    player.displayName ||
    player.nametag ||
    player.connectCode ||
    `P${player.port}`
  );
}

function scanGame(filePath: string): GameMeta | null {
  try {
    const game = new SlippiGame(filePath);
    const settings = game.getSettings();
    const metadata = game.getMetadata();
    const stats = game.getStats();
    const winners = game.getWinners();

    if (!settings || !stats) return null;

    const players = settings.players.filter((p) => p.type !== 3);
    if (players.length !== 2) return null;

    const p0 = players[0]!;
    const p1 = players[1]!;

    const durationSeconds = (stats.lastFrame + 123) / 60;

    // Use metadata timestamp, fall back to parsing filename (Game_YYYYMMDDTHHmmss.slp)
    let startAt: Date | null = null;
    if (metadata?.startAt) {
      startAt = new Date(metadata.startAt);
    } else {
      const match = path.basename(filePath).match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
      if (match) {
        startAt = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`);
      }
    }

    const winnerIdx =
      winners.length > 0 ? winners[0]!.playerIndex : null;
    const winner =
      winnerIdx === p0.playerIndex
        ? getTag(p0)
        : winnerIdx === p1.playerIndex
          ? getTag(p1)
          : null;

    return {
      filePath,
      startAt,
      durationSeconds,
      stage: stageUtils.getStageName(settings.stageId ?? 0),
      players: [
        {
          tag: getTag(p0),
          connectCode: p0.connectCode || "",
          character: characterUtils.getCharacterShortName(p0.characterId ?? 0),
          port: p0.port,
        },
        {
          tag: getTag(p1),
          connectCode: p1.connectCode || "",
          character: characterUtils.getCharacterShortName(p1.characterId ?? 0),
          port: p1.port,
        },
      ],
      winner,
    };
  } catch {
    return null;
  }
}

// ── Set detection ────────────────────────────────────────────────────

/** Canonical key for a pair of players (order-independent) */
function pairKey(g: GameMeta): string {
  const tags = [g.players[0].tag, g.players[1].tag].sort();
  return tags.join(" vs ");
}

const MAX_GAP_MS = 30 * 60 * 1000; // 30 minutes between games in a set
const MIN_GAME_DURATION = 30; // seconds — skip handwarmers / false starts

export function detectSets(directory: string): DetectedSet[] {
  const files = fs
    .readdirSync(directory)
    .filter((f) => f.endsWith(".slp"))
    .sort()
    .map((f) => path.join(directory, f));

  // Scan all games
  const games: GameMeta[] = [];
  for (const f of files) {
    const meta = scanGame(f);
    if (meta && meta.durationSeconds >= MIN_GAME_DURATION) {
      games.push(meta);
    }
  }

  // Sort by start time (fall back to filename for missing timestamps)
  games.sort((a, b) => {
    if (a.startAt && b.startAt) return a.startAt.getTime() - b.startAt.getTime();
    if (a.startAt) return -1;
    if (b.startAt) return 1;
    return a.filePath.localeCompare(b.filePath);
  });

  // Group into sets: same player pair + games within MAX_GAP_MS of each other
  const sets: DetectedSet[] = [];
  let currentSet: GameMeta[] = [];
  let currentPair = "";

  for (const game of games) {
    const pair = pairKey(game);

    if (pair !== currentPair) {
      // Different opponents — flush current set
      if (currentSet.length > 0) {
        flushSet(currentSet, sets);
      }
      currentSet = [game];
      currentPair = pair;
      continue;
    }

    // Same pair — check time gap
    const prev = currentSet[currentSet.length - 1]!;
    if (prev.startAt && game.startAt) {
      const gap = game.startAt.getTime() - prev.startAt.getTime();
      if (gap > MAX_GAP_MS) {
        // Too long between games — new set
        flushSet(currentSet, sets);
        currentSet = [game];
        continue;
      }
    }

    currentSet.push(game);
  }

  // Flush last set
  if (currentSet.length > 0) {
    flushSet(currentSet, sets);
  }

  return sets;
}

function flushSet(games: GameMeta[], sets: DetectedSet[]): void {
  const g = games[0]!;
  const tags: [string, string] = [g.players[0].tag, g.players[1].tag];
  sets.push({ players: tags, games: [...games] });
}

// ── CLI ──────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function main() {
  const dir = process.argv[2] || "test-replays";

  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const sets = detectSets(dir);

  console.log(`Found ${sets.length} sets from ${dir}\n`);

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i]!;
    const wins = [0, 0];
    for (const g of set.games) {
      if (g.winner === set.players[0]) wins[0]!++;
      else if (g.winner === set.players[1]) wins[1]!++;
    }

    console.log(
      `Set ${i + 1}: ${set.players[0]} vs ${set.players[1]} (${set.games.length} game${set.games.length > 1 ? "s" : ""}, ${wins[0]}-${wins[1]})`,
    );

    for (let j = 0; j < set.games.length; j++) {
      const g = set.games[j]!;
      const p0 = g.players[0];
      const p1 = g.players[1];
      const w = g.winner ? `W: ${g.winner}` : "incomplete";
      console.log(
        `  G${j + 1}: ${p0.tag} (${p0.character}) vs ${p1.tag} (${p1.character}) | ${g.stage} | ${formatDuration(g.durationSeconds)} | ${w}`,
      );
    }
    console.log();
  }
}

if (require.main === module) {
  main();
}
