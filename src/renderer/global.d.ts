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
      analyzeReplays: (replayPaths: string[], targetPlayer: string) => Promise<string>;
      analyzeRecent: (count: number, targetPlayer: string) => Promise<string>;
      analyzeTrends: (trendSummary: string) => Promise<string>;
      getLLMModels: () => Promise<any[]>;
      getCurrentModel: () => Promise<{ modelId: string; label: string }>;
      fetchOpenRouterModels: () => Promise<any[]>;
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
      openInDolphin: (replayPath: string) => Promise<boolean>;
      openFileDialog: (title: string, filters: { name: string; extensions: string[] }[]) => Promise<string | null>;
      startWatcher: (replayFolder: string, targetPlayer: string) => Promise<boolean>;
      stopWatcher: () => Promise<boolean>;
      onImported: (callback: (result: any) => void) => () => void;
      onWatcherError: (callback: (message: string) => void) => () => void;
      onAnalysisStream: (callback: (chunk: string) => void) => () => void;
      onAnalysisStreamEnd: (callback: () => void) => () => void;
    };
  }
}

export {};
