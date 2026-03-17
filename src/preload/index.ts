import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Config
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (config: unknown) => ipcRenderer.invoke("config:save", config),

  // Dialogs
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),

  // Import
  importFolder: (folderPath: string, targetPlayer: string) =>
    ipcRenderer.invoke("import:folder", folderPath, targetPlayer),
  importAndAnalyze: (filePaths: string[], targetPlayer: string) =>
    ipcRenderer.invoke("import:analyze", filePaths, targetPlayer),

  // Analysis
  analyzeReplays: (replayPaths: string[], targetPlayer: string) =>
    ipcRenderer.invoke("analyze:run", replayPaths, targetPlayer),
  analyzeRecent: (count: number, targetPlayer: string) =>
    ipcRenderer.invoke("analyze:recent", count, targetPlayer),
  analyzeTrends: (trendSummary: string) =>
    ipcRenderer.invoke("analyze:trends", trendSummary),

  // LLM
  getLLMModels: () => ipcRenderer.invoke("llm:models"),
  getCurrentModel: () => ipcRenderer.invoke("llm:currentModel"),

  // Stats
  getOverallRecord: () => ipcRenderer.invoke("stats:overall"),
  getMatchupRecords: () => ipcRenderer.invoke("stats:matchups"),
  getStageRecords: () => ipcRenderer.invoke("stats:stages"),
  getRecentGames: (limit: number) => ipcRenderer.invoke("stats:recentGames", limit),
  getLatestAnalysis: () => ipcRenderer.invoke("stats:latestAnalysis"),
  getOpponents: (search?: string) => ipcRenderer.invoke("stats:opponents", search),
  getSets: () => ipcRenderer.invoke("stats:sets"),
  clearAllGames: () => ipcRenderer.invoke("data:clearAll"),
  getCharacterList: () => ipcRenderer.invoke("stats:characterList"),
  getCharacterMatchups: (character: string) => ipcRenderer.invoke("stats:characterMatchups", character),
  getCharacterStageStats: (character: string) => ipcRenderer.invoke("stats:characterStages", character),
  getCharacterSignatureStats: (character: string) => ipcRenderer.invoke("stats:characterSignature", character),

  // File watcher
  startWatcher: (replayFolder: string, targetPlayer: string) =>
    ipcRenderer.invoke("watcher:start", replayFolder, targetPlayer),
  stopWatcher: () => ipcRenderer.invoke("watcher:stop"),

  // Events from main process
  onImported: (callback: (result: unknown) => void) => {
    const listener = (_event: unknown, result: unknown) => callback(result);
    ipcRenderer.on("watcher:imported", listener);
    return () => ipcRenderer.removeListener("watcher:imported", listener);
  },
  onWatcherError: (callback: (message: string) => void) => {
    const listener = (_event: unknown, message: string) => callback(message);
    ipcRenderer.on("watcher:error", listener);
    return () => ipcRenderer.removeListener("watcher:error", listener);
  },
};

contextBridge.exposeInMainWorld("clippi", api);

export type ClippiAPI = typeof api;
