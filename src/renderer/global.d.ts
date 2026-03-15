declare global {
  interface Window {
    clippi: {
      loadConfig: () => Promise<any>;
      saveConfig: (config: any) => Promise<any>;
      openFolder: () => Promise<string | null>;
      importFolder: (folderPath: string, targetPlayer: string) => Promise<any>;
      importAndAnalyze: (filePaths: string[], targetPlayer: string) => Promise<any>;
      analyzeReplays: (replayPaths: string[], targetPlayer: string) => Promise<string>;
      analyzeRecent: (count: number, targetPlayer: string) => Promise<string>;
      analyzeTrends: (trendSummary: string) => Promise<string>;
      getOverallRecord: () => Promise<any>;
      getMatchupRecords: () => Promise<any[]>;
      getStageRecords: () => Promise<any[]>;
      getRecentGames: (limit: number) => Promise<any[]>;
      getLatestAnalysis: () => Promise<any[]>;
      getOpponents: (search?: string) => Promise<any[]>;
      clearAllGames: () => Promise<boolean>;
      getSets: () => Promise<any[]>;
      startWatcher: (replayFolder: string, targetPlayer: string) => Promise<boolean>;
      stopWatcher: () => Promise<boolean>;
      onImported: (callback: (result: any) => void) => () => void;
      onWatcherError: (callback: (message: string) => void) => () => void;
    };
  }
}

export {};
