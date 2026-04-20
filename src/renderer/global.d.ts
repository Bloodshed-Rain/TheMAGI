declare module "*.jpg" {
  const src: string;
  export default src;
}
declare module "*.png" {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    clippi: {
      loadConfig: () => Promise<any>;
      saveConfig: (config: any) => Promise<any>;
      openFolder: () => Promise<string | null>;
      importFolder: (folderPath: string, targetPlayer: string) => Promise<any>;
      importAndAnalyze: (filePaths: string[], targetPlayer: string) => Promise<any>;
      analyzeReplays: (replayPaths: string[], targetPlayer: string, streamId?: string) => Promise<string>;
      analyzeRecent: (count: number, targetPlayer: string, streamId?: string) => Promise<string>;
      analyzeTrends: (trendSummary: string) => Promise<string>;
      analyzeScoped: (scope: string, id: string | number, targetPlayer?: string, streamId?: string) => Promise<string>;
      analyzeDiscovery: (streamId?: string) => Promise<string>;
      analyzeSession: (date: string) => Promise<string>;
      getLLMModels: () => Promise<any[]>;
      getCurrentModel: () => Promise<{ modelId: string; label: string }>;
      fetchOpenRouterModels: () => Promise<any[]>;
      fetchAllModels: () => Promise<any[]>;
      getQueueStatus: () => Promise<{ pending: number; processing: boolean }>;
      getOverallRecord: () => Promise<any>;
      getMatchupRecords: () => Promise<any[]>;
      getStageRecords: () => Promise<any[]>;
      getRecentGames: (limit: number) => Promise<any[]>;
      getLatestAnalysis: () => Promise<any[]>;
      getOpponents: (search?: string) => Promise<any[]>;
      clearAllGames: () => Promise<boolean>;
      getSets: () => Promise<any[]>;
      getCharacterList: () => Promise<any[]>;
      getCharacterMatchups: (character: string) => Promise<any[]>;
      getCharacterStageStats: (character: string) => Promise<any[]>;
      getCharacterSignatureStats: (character: string) => Promise<any>;
      getCharacterGameStats: (character: string) => Promise<any[]>;
      getOpponentDetail: (opponentKey: string) => Promise<any>;
      getDashboardHighlights: () => Promise<any>;
      getGameHighlights: (gameId: number) => Promise<any[]>;
      getRecentHighlights: (limit: number) => Promise<any[]>;
      getAnalysisHistory: (limit: number, offset: number, scopeFilter?: string) => Promise<any[]>;
      getGameDetail: (gameId: number) => Promise<any>;
      getSessionsByDay: (daysBack?: number) => Promise<Array<{
        date: string;
        games: number;
        wins: number;
        losses: number;
        opponents: string[];
        gameIds: number[];
      }>>;
      getTrendSeries: (
        metric:
          | "neutralWinRate"
          | "lCancelRate"
          | "conversionRate"
          | "avgDamagePerOpening"
          | "openingsPerKill"
          | "avgDeathPercent",
        range: "7d" | "30d" | "all",
        filterChar: string | null,
      ) => Promise<number[]>;
      openInDolphin: (replayPath: string) => Promise<boolean>;
      openInDolphinAtFrame: (replayPath: string, frame: number) => Promise<boolean>;
      getStockTimeline: (replayPath: string) => Promise<any>;
      openFileDialog: (title: string, filters: { name: string; extensions: string[] }[]) => Promise<string | null>;
      startWatcher: (replayFolder: string, targetPlayer: string) => Promise<boolean>;
      stopWatcher: () => Promise<boolean>;
      onImported: (callback: (result: any) => void) => () => void;
      onWatcherError: (callback: (message: string) => void) => () => void;
      onAnalysisStream: (callback: (chunk: string, streamId?: string) => void) => () => void;
      onAnalysisStreamEnd: (callback: (streamId?: string) => void) => () => void;
    };
  }
}

export {};
