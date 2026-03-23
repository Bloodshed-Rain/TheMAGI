import { processGame, findPlayerIdx } from "../../pipeline/index.js";
import { loadConfig } from "../../config.js";
import { validatePath, type SafeHandleFn } from "../ipc.js";

export function registerStockTimelineHandlers(safeHandle: SafeHandleFn): void {
  safeHandle("stats:stockTimeline", (_e, replayPath: string) => {
    const safePath = validatePath(replayPath);
    const config = loadConfig();
    const target = config.connectCode || config.targetPlayer || "";

    const result = processGame(safePath, 1);
    const { gameSummary } = result;

    const playerIdx = findPlayerIdx(gameSummary, target);
    const opponentIdx = (playerIdx === 0 ? 1 : 0) as 0 | 1;

    const player = gameSummary.players[playerIdx];
    const opponent = gameSummary.players[opponentIdx];

    return {
      player: {
        tag: player.tag,
        character: player.character,
        stocks: player.stocks,
      },
      opponent: {
        tag: opponent.tag,
        character: opponent.character,
        stocks: opponent.stocks,
      },
      gameDuration: gameSummary.duration,
    };
  });
}
