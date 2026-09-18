import {
  getOverallRecord,
  getMatchupRecords,
  getStageRecords,
  getLatestAnalysis,
  getRecentGames,
  getLibraryGames,
  getOpponentHistory,
  detectSets,
  clearAllGames,
  getCharacterList,
  getCharacterMatchups,
  getCharacterStageStats,
  getCharacterSignatureAggregates,
  getCharacterGameStats,
  getCharacterEventProfile,
  getOpponentDetail,
  getDashboardHighlights,
  getAnalysisHistory,
  getGameHighlights,
  getRecentHighlights,
  getGameDetail,
  getSessionsByDay,
  getTrendSeries,
  getTrendSeriesBundle,
  getPerformanceHub,
  listTrainingLogEntries,
  createTrainingLogEntry,
  listGameReviewNotes,
  addGameReviewNote,
  type TrendMetric,
} from "../../db.js";
import type { SafeHandleFn } from "../ipc.js";

export function registerStatsHandlers(safeHandle: SafeHandleFn): void {
  safeHandle("stats:overall", () => getOverallRecord());
  safeHandle("stats:matchups", () => getMatchupRecords());
  safeHandle("stats:stages", () => getStageRecords());
  safeHandle("stats:recentGames", (_e, limit: number) => getRecentGames(limit));
  safeHandle("stats:libraryGames", (_e, filters: Parameters<typeof getLibraryGames>[0]) => getLibraryGames(filters));
  safeHandle("stats:latestAnalysis", () => getLatestAnalysis(1));
  safeHandle("stats:opponents", (_e, search?: string) => getOpponentHistory(search));
  safeHandle("stats:sets", () => detectSets());
  safeHandle("stats:characterList", () => getCharacterList());
  safeHandle("stats:characterMatchups", (_e, character: string) => getCharacterMatchups(character));
  safeHandle("stats:characterStages", (_e, character: string) => getCharacterStageStats(character));
  safeHandle("stats:characterSignature", (_e, character: string) => getCharacterSignatureAggregates(character));
  safeHandle("stats:characterGameStats", (_e, character: string) => getCharacterGameStats(character));
  safeHandle("stats:characterEventProfile", (_e, character: string) => getCharacterEventProfile(character));
  safeHandle("stats:opponentDetail", (_e, opponentKey: string) => getOpponentDetail(opponentKey));
  safeHandle("stats:dashboardHighlights", () => getDashboardHighlights());
  safeHandle("stats:analysisHistory", (_e, limit: number, offset: number, scopeFilter?: string) =>
    getAnalysisHistory(limit, offset, scopeFilter),
  );
  safeHandle("stats:gameHighlights", (_e, gameId: number) => getGameHighlights(gameId));
  safeHandle("stats:recentHighlights", (_e, limit: number) => getRecentHighlights(limit));
  safeHandle("stats:gameDetail", (_e, gameId: number) => getGameDetail(gameId));
  safeHandle("stats:sessionsByDay", (_e, daysBack?: number) => getSessionsByDay(daysBack));
  safeHandle("stats:trendSeries", (_e, metric: TrendMetric, range: "7d" | "30d" | "all", filterChar: string | null) =>
    getTrendSeries(metric, range, filterChar),
  );
  safeHandle("stats:trendSeriesBundle", (_e, range: "7d" | "30d" | "all", filterChar: string | null) =>
    getTrendSeriesBundle(range, filterChar),
  );
  safeHandle("stats:performanceHub", () => getPerformanceHub());
  safeHandle("stats:trainingLog", (_e, limit?: number, offset?: number) => listTrainingLogEntries(limit, offset));
  safeHandle("stats:trainingLog:create", (_e, entry: Parameters<typeof createTrainingLogEntry>[0]) =>
    createTrainingLogEntry(entry),
  );
  safeHandle("stats:gameReviewNotes", (_e, gameId: number) => listGameReviewNotes(gameId));
  safeHandle("stats:gameReviewNotes:add", (_e, gameId: number, note: Parameters<typeof addGameReviewNote>[1]) =>
    addGameReviewNote(gameId, note),
  );
  safeHandle("data:clearAll", () => {
    clearAllGames();
    return true;
  });
}
