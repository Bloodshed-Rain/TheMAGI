import {
  getOverallRecord, getMatchupRecords, getStageRecords,
  getLatestAnalysis, getRecentGames, getOpponentHistory,
  detectSets, clearAllGames,
  getCharacterList, getCharacterMatchups,
  getCharacterStageStats, getCharacterSignatureAggregates,
  getCharacterGameStats,
  getOpponentDetail,
  getDashboardHighlights,
  getAnalysisHistory,
  getGameHighlights,
  getRecentHighlights,
  getGameDetail,
} from "../../db.js";
import type { SafeHandleFn } from "../ipc.js";

export function registerStatsHandlers(safeHandle: SafeHandleFn): void {
  safeHandle("stats:overall", () => getOverallRecord());
  safeHandle("stats:matchups", () => getMatchupRecords());
  safeHandle("stats:stages", () => getStageRecords());
  safeHandle("stats:recentGames", (_e, limit: number) => getRecentGames(limit));
  safeHandle("stats:latestAnalysis", () => getLatestAnalysis(1));
  safeHandle("stats:opponents", (_e, search?: string) => getOpponentHistory(search));
  safeHandle("stats:sets", () => detectSets());
  safeHandle("stats:characterList", () => getCharacterList());
  safeHandle("stats:characterMatchups", (_e, character: string) => getCharacterMatchups(character));
  safeHandle("stats:characterStages", (_e, character: string) => getCharacterStageStats(character));
  safeHandle("stats:characterSignature", (_e, character: string) => getCharacterSignatureAggregates(character));
  safeHandle("stats:characterGameStats", (_e, character: string) => getCharacterGameStats(character));
  safeHandle("stats:opponentDetail", (_e, opponentKey: string) => getOpponentDetail(opponentKey));
  safeHandle("stats:dashboardHighlights", () => getDashboardHighlights());
  safeHandle("stats:analysisHistory", (_e, limit: number, offset: number, scopeFilter?: string) =>
    getAnalysisHistory(limit, offset, scopeFilter));
  safeHandle("stats:gameHighlights", (_e, gameId: number) => getGameHighlights(gameId));
  safeHandle("stats:recentHighlights", (_e, limit: number) => getRecentHighlights(limit));
  safeHandle("stats:gameDetail", (_e, gameId: number) => getGameDetail(gameId));
  safeHandle("data:clearAll", () => {
    clearAllGames();
    return true;
  });
}
