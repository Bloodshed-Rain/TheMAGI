import { useQuery } from "@tanstack/react-query";

const GC_10MIN = 1000 * 60 * 10;

export const useConfig = () => {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => window.clippi.loadConfig(),
    gcTime: GC_10MIN,
  });
};

export const useRecentGames = (limit: number) => {
  return useQuery({
    queryKey: ["recentGames", limit],
    queryFn: () => window.clippi.getRecentGames(limit),
    gcTime: GC_10MIN,
  });
};

export const useLibraryGames = (filters: {
  search: string;
  char: string;
  stage: string;
  result: string;
  limit: number;
  offset: number;
}) => {
  return useQuery({
    queryKey: ["libraryGames", filters],
    queryFn: () => window.clippi.getLibraryGames(filters),
    placeholderData: (previousData) => previousData,
    gcTime: GC_10MIN,
  });
};

export const useOverallRecord = () => {
  return useQuery({
    queryKey: ["overallRecord"],
    queryFn: () => window.clippi.getOverallRecord(),
    gcTime: GC_10MIN,
  });
};

export const useMatchupRecords = () => {
  return useQuery({
    queryKey: ["matchupRecords"],
    queryFn: () => window.clippi.getMatchupRecords(),
    gcTime: GC_10MIN,
  });
};

export const useStageRecords = () => {
  return useQuery({
    queryKey: ["stageRecords"],
    queryFn: () => window.clippi.getStageRecords(),
    gcTime: GC_10MIN,
  });
};

export const useOpponents = (search?: string) => {
  return useQuery({
    queryKey: ["opponents", search],
    queryFn: () => window.clippi.getOpponents(search),
    placeholderData: (previousData) => previousData,
    gcTime: GC_10MIN,
  });
};

export const useSets = () => {
  return useQuery({
    queryKey: ["sets"],
    queryFn: () => window.clippi.getSets(),
    gcTime: GC_10MIN,
  });
};

export const useOpponentDetail = (opponentKey: string | null) => {
  return useQuery({
    queryKey: ["opponentDetail", opponentKey],
    queryFn: () => (opponentKey ? window.clippi.getOpponentDetail(opponentKey) : null),
    enabled: !!opponentKey,
    gcTime: GC_10MIN,
  });
};

export const useCharacterList = () => {
  return useQuery({
    queryKey: ["characterList"],
    queryFn: () => window.clippi.getCharacterList(),
    gcTime: GC_10MIN,
  });
};

export const useCharacterMatchups = (character: string | null) => {
  return useQuery({
    queryKey: ["characterMatchups", character],
    queryFn: () => (character ? window.clippi.getCharacterMatchups(character) : null),
    enabled: !!character,
    gcTime: GC_10MIN,
  });
};

export const useCharacterStageStats = (character: string | null) => {
  return useQuery({
    queryKey: ["characterStageStats", character],
    queryFn: () => (character ? window.clippi.getCharacterStageStats(character) : null),
    enabled: !!character,
    gcTime: GC_10MIN,
  });
};

export const useCharacterSignatureStats = (character: string | null) => {
  return useQuery({
    queryKey: ["characterSignatureStats", character],
    queryFn: () => (character ? window.clippi.getCharacterSignatureStats(character) : null),
    enabled: !!character,
    gcTime: GC_10MIN,
  });
};

export const useCharacterGameStats = (character: string | null) => {
  return useQuery({
    queryKey: ["characterGameStats", character],
    queryFn: () => (character ? window.clippi.getCharacterGameStats(character) : null),
    enabled: !!character,
    gcTime: GC_10MIN,
  });
};

export const useCharacterEventProfile = (character: string | null) => {
  return useQuery({
    queryKey: ["characterEventProfile", character],
    queryFn: () => (character ? window.clippi.getCharacterEventProfile(character) : null),
    enabled: !!character,
    gcTime: GC_10MIN,
  });
};

export const useCharacterBlurb = (character: string | null) => {
  return useQuery({
    queryKey: ["characterBlurb", character],
    queryFn: () => (character ? window.clippi.analyzeCharacterBlurb(character) : null),
    enabled: !!character,
    staleTime: Infinity,
    gcTime: GC_10MIN,
  });
};

export const useGetLatestAnalysis = () => {
  return useQuery({
    queryKey: ["latestAnalysis"],
    queryFn: () => window.clippi.getLatestAnalysis(),
    gcTime: GC_10MIN,
  });
};

export const useDashboardHighlights = () => {
  return useQuery({
    queryKey: ["dashboardHighlights"],
    queryFn: () => window.clippi.getDashboardHighlights(),
    gcTime: GC_10MIN,
  });
};

export const useGameHighlights = (gameId: number | null) => {
  return useQuery({
    queryKey: ["gameHighlights", gameId],
    queryFn: () => window.clippi.getGameHighlights(gameId!),
    enabled: gameId != null,
    gcTime: GC_10MIN,
  });
};

export const useStockTimeline = (replayPath: string | null) => {
  return useQuery({
    queryKey: ["stockTimeline", replayPath],
    queryFn: () => window.clippi.getStockTimeline(replayPath!),
    enabled: Boolean(replayPath),
    gcTime: GC_10MIN,
  });
};

export const useRecentHighlights = (limit: number = 20) => {
  return useQuery({
    queryKey: ["recentHighlights", limit],
    queryFn: () => window.clippi.getRecentHighlights(limit),
    gcTime: GC_10MIN,
  });
};

export const useGameDetail = (gameId: number | null) => {
  return useQuery({
    queryKey: ["gameDetail", gameId],
    queryFn: () => window.clippi.getGameDetail(gameId!),
    enabled: gameId != null,
    gcTime: GC_10MIN,
  });
};

export const useAnalysisHistory = (limit: number, offset: number, scopeFilter?: string) => {
  return useQuery({
    queryKey: ["analysisHistory", limit, offset, scopeFilter],
    queryFn: () => window.clippi.getAnalysisHistory(limit, offset, scopeFilter),
    gcTime: GC_10MIN,
  });
};

export const useSessionsByDay = (daysBack: number = 90) => {
  return useQuery({
    queryKey: ["sessionsByDay", daysBack],
    queryFn: () => window.clippi.getSessionsByDay(daysBack),
    gcTime: GC_10MIN,
  });
};

export type TrendMetric =
  | "neutralWinRate"
  | "lCancelRate"
  | "conversionRate"
  | "avgDamagePerOpening"
  | "openingsPerKill"
  | "avgDeathPercent";

export const useTrendSeries = (metric: TrendMetric, range: "7d" | "30d" | "all", filterChar: string | null) => {
  return useQuery({
    queryKey: ["trendSeries", metric, range, filterChar],
    queryFn: () => window.clippi.getTrendSeries(metric, range, filterChar),
    gcTime: GC_10MIN,
  });
};

export const useTrendSeriesBundle = (range: "7d" | "30d" | "all", filterChar: string | null) => {
  return useQuery({
    queryKey: ["trendSeriesBundle", range, filterChar],
    queryFn: () => window.clippi.getTrendSeriesBundle(range, filterChar),
    gcTime: GC_10MIN,
  });
};

export const usePerformanceHub = () => {
  return useQuery({
    queryKey: ["performanceHub"],
    queryFn: () => window.clippi.getPerformanceHub(),
    gcTime: GC_10MIN,
  });
};

export const useTrainingLog = (limit: number = 30, offset: number = 0) => {
  return useQuery({
    queryKey: ["trainingLog", limit, offset],
    queryFn: () => window.clippi.getTrainingLog(limit, offset),
    gcTime: GC_10MIN,
  });
};

export const useGameReviewNotes = (gameId: number | null) => {
  return useQuery({
    queryKey: ["gameReviewNotes", gameId],
    queryFn: () => window.clippi.getGameReviewNotes(gameId!),
    enabled: gameId != null,
    gcTime: GC_10MIN,
  });
};
