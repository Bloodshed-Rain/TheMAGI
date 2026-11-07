import { SlippiGame, stages as stageUtils, Frames } from "@slippi/slippi-js/node";

import type { GameSummary, DerivedInsights, GameHighlight, GameFrameEvents } from "./types.js";
import { getPlayerTag, framesToSeconds, endMethodString } from "./helpers.js";
import { buildPlayerSummary } from "./playerSummary.js";
import { buildDerivedInsights } from "./derivedInsights.js";
import { detectHighlights } from "./highlights.js";
import { extractFrameEvents } from "./frameEvents.js";

// ── Main ──────────────────────────────────────────────────────────────

export function processGame(
  filePath: string,
  gameNumber: number,
): {
  gameSummary: GameSummary;
  derivedInsights: [DerivedInsights, DerivedInsights];
  highlights: [GameHighlight[], GameHighlight[]];
  frameEvents: GameFrameEvents;
  startAt: string | null;
} {
  let game: SlippiGame;
  try {
    game = new SlippiGame(filePath);
  } catch (err) {
    throw new Error(`Cannot open replay file: ${filePath} — ${err instanceof Error ? err.message : String(err)}`);
  }

  let settings: ReturnType<SlippiGame["getSettings"]>;
  let stats: ReturnType<SlippiGame["getStats"]>;
  let metadata: ReturnType<SlippiGame["getMetadata"]>;
  let gameEnd: ReturnType<SlippiGame["getGameEnd"]>;
  let frames: ReturnType<SlippiGame["getFrames"]>;
  try {
    settings = game.getSettings();
    stats = game.getStats();
    metadata = game.getMetadata();
    gameEnd = game.getGameEnd();
    frames = game.getFrames();
  } catch (err) {
    throw new Error(
      `Failed to read replay data from: ${filePath} — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const startAt = metadata?.startAt ?? null;

  if (!settings || !stats || !frames) {
    throw new Error(
      `Incomplete replay data (missing ${[!settings && "settings", !stats && "stats", !frames && "frames"].filter(Boolean).join(", ")}): ${filePath}`,
    );
  }

  const players = settings.players.filter(
    (p) => p.type !== 3, // Filter out empty slots (type 3 = none)
  );
  if (players.length !== 2) {
    throw new Error(`Expected 2 players, got ${players.length} in ${filePath}`);
  }

  const p0 = players[0]!;
  const p1 = players[1]!;
  const p0Index = p0.playerIndex;
  const p1Index = p1.playerIndex;

  const stageId = settings.stageId ?? 0;
  const stageName = stageUtils.getStageName(stageId);
  const lastFrame = stats.lastFrame;

  // Determine winner
  const winners = game.getWinners();
  const winnerIndex = winners.length > 0 ? winners[0]!.playerIndex : -1;
  const winnerTag = winnerIndex === p0Index ? getPlayerTag(p0) : winnerIndex === p1Index ? getPlayerTag(p1) : "Unknown";

  // Final stocks and percents from last frame
  const lastFrameData = frames[lastFrame];
  const p0Post = lastFrameData?.players[p0Index]?.post;
  const p1Post = lastFrameData?.players[p1Index]?.post;

  const finalStocks: [number, number] = [p0Post?.stocksRemaining ?? 0, p1Post?.stocksRemaining ?? 0];
  const finalPercents: [number, number] = [Math.round(p0Post?.percent ?? 0), Math.round(p1Post?.percent ?? 0)];

  // Find overall stats for each player
  const p0Overall = stats.overall.find((o) => o.playerIndex === p0Index);
  const p1Overall = stats.overall.find((o) => o.playerIndex === p1Index);

  if (!p0Overall || !p1Overall) {
    throw new Error("Missing overall stats");
  }

  const p0Actions = stats.actionCounts.find((a) => a.playerIndex === p0Index);
  const p1Actions = stats.actionCounts.find((a) => a.playerIndex === p1Index);

  if (!p0Actions || !p1Actions) {
    throw new Error("Missing action counts");
  }

  const p0Stocks = stats.stocks.filter((s) => s.playerIndex === p0Index);
  const p1Stocks = stats.stocks.filter((s) => s.playerIndex === p1Index);

  const p0Summary = buildPlayerSummary(
    p0Index,
    p0,
    p0Overall,
    p0Actions,
    stats.conversions,
    p0Stocks,
    stats.conversions,
    frames,
    lastFrame,
    stageId,
    p1Index,
    p1.characterId,
  );

  const p1Summary = buildPlayerSummary(
    p1Index,
    p1,
    p1Overall,
    p1Actions,
    stats.conversions,
    p1Stocks,
    stats.conversions,
    frames,
    lastFrame,
    stageId,
    p0Index,
    p0.characterId,
  );

  const gameSummary: GameSummary = {
    gameNumber,
    stage: stageName,
    duration: framesToSeconds(lastFrame - Frames.FIRST_PLAYABLE),
    result: {
      winner: winnerTag,
      endMethod: endMethodString(gameEnd),
      finalStocks,
      finalPercents,
    },
    players: [p0Summary, p1Summary],
  };

  const frameEvents = extractFrameEvents(stats.conversions, stats.stocks, frames, lastFrame, stageId, p0Index, p1Index);

  const p0Insights = buildDerivedInsights(p0Index, p1Index, stats, frames, lastFrame, stageId, frameEvents, 0);
  const p1Insights = buildDerivedInsights(p1Index, p0Index, stats, frames, lastFrame, stageId, frameEvents, 1);

  const p0Highlights = detectHighlights(
    gameSummary,
    stats.conversions,
    frames,
    stageId,
    0,
    p0Index,
    p1Index,
    lastFrame,
  );
  const p1Highlights = detectHighlights(
    gameSummary,
    stats.conversions,
    frames,
    stageId,
    1,
    p1Index,
    p0Index,
    lastFrame,
  );

  return {
    gameSummary,
    derivedInsights: [p0Insights, p1Insights],
    highlights: [p0Highlights, p1Highlights],
    frameEvents,
    startAt,
  };
}
