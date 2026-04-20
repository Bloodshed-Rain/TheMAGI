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
