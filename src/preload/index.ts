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
  fetchOpenRouterModels: () => ipcRenderer.invoke("openrouter:models"),

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
  getCharacterGameStats: (character: string) => ipcRenderer.invoke("stats:characterGameStats", character),

  // Dolphin playback
  openInDolphin: (replayPath: string) =>
    ipcRenderer.invoke("replay:openInDolphin", replayPath),
  openInDolphinAtFrame: (replayPath: string, frame: number) =>
    ipcRenderer.invoke("replay:openInDolphinAtFrame", replayPath, frame),
  openFileDialog: (title: string, filters: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke("dialog:openFile", title, filters),

  // File watcher
  startWatcher: (replayFolder: string, targetPlayer: string) =>
    ipcRenderer.invoke("watcher:start", replayFolder, targetPlayer),
  stopWatcher: () => ipcRenderer.invoke("watcher:stop"),

  // Queue status
  getQueueStatus: () => ipcRenderer.invoke("queue:status"),

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
  onUpdateReady: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("update:ready", listener);
    return () => ipcRenderer.removeListener("update:ready", listener);
  },
  onAnalysisStream: (callback: (chunk: string) => void) => {
    const listener = (_event: unknown, chunk: string) => callback(chunk);
    ipcRenderer.on("analyze:stream", listener);
    return () => ipcRenderer.removeListener("analyze:stream", listener);
  },
  onAnalysisStreamEnd: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("analyze:stream-end", listener);
    return () => ipcRenderer.removeListener("analyze:stream-end", listener);
  },
};

contextBridge.exposeInMainWorld("clippi", api);

export type ClippiAPI = typeof api;
