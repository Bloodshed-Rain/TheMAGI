// Preload entry point
// In dev: this file IS the preload (plain JS, no tsx needed)
// In production: same file works since it's already plain JS

const { contextBridge, ipcRenderer } = require("electron");

const api = {
  // Config
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),

  // Dialogs
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),

  // Import
  importFolder: (folderPath, targetPlayer) =>
    ipcRenderer.invoke("import:folder", folderPath, targetPlayer),
  importAndAnalyze: (filePaths, targetPlayer) =>
    ipcRenderer.invoke("import:analyze", filePaths, targetPlayer),

  // Analysis
  analyzeReplays: (replayPaths, targetPlayer) =>
    ipcRenderer.invoke("analyze:run", replayPaths, targetPlayer),
  analyzeRecent: (count, targetPlayer) =>
    ipcRenderer.invoke("analyze:recent", count, targetPlayer),
  analyzeTrends: (trendSummary) =>
    ipcRenderer.invoke("analyze:trends", trendSummary),

  // Stats
  getOverallRecord: () => ipcRenderer.invoke("stats:overall"),
  getMatchupRecords: () => ipcRenderer.invoke("stats:matchups"),
  getStageRecords: () => ipcRenderer.invoke("stats:stages"),
  getRecentGames: (limit) => ipcRenderer.invoke("stats:recentGames", limit),
  getLatestAnalysis: () => ipcRenderer.invoke("stats:latestAnalysis"),
  getOpponents: (search) => ipcRenderer.invoke("stats:opponents", search),
  getSets: () => ipcRenderer.invoke("stats:sets"),

  // Characters
  getCharacterList: () => ipcRenderer.invoke("stats:characterList"),
  getCharacterMatchups: (character) => ipcRenderer.invoke("stats:characterMatchups", character),
  getCharacterStageStats: (character) => ipcRenderer.invoke("stats:characterStages", character),
  getCharacterSignatureStats: (character) => ipcRenderer.invoke("stats:characterSignature", character),
  getCharacterGameStats: (character) => ipcRenderer.invoke("stats:characterGameStats", character),

  // LLM
  getLLMModels: () => ipcRenderer.invoke("llm:models"),
  getCurrentModel: () => ipcRenderer.invoke("llm:currentModel"),
  fetchOpenRouterModels: () => ipcRenderer.invoke("openrouter:models"),

  // Data management
  clearAllGames: () => ipcRenderer.invoke("data:clearAll"),

  // Dolphin playback
  openInDolphin: (replayPath) =>
    ipcRenderer.invoke("replay:openInDolphin", replayPath),
  openInDolphinAtFrame: (replayPath, frame) =>
    ipcRenderer.invoke("replay:openInDolphinAtFrame", replayPath, frame),
  openFileDialog: (title, filters) =>
    ipcRenderer.invoke("dialog:openFile", title, filters),

  // File watcher
  startWatcher: (replayFolder, targetPlayer) =>
    ipcRenderer.invoke("watcher:start", replayFolder, targetPlayer),
  stopWatcher: () => ipcRenderer.invoke("watcher:stop"),

  // Events from main process
  onImported: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on("watcher:imported", listener);
    return () => ipcRenderer.removeListener("watcher:imported", listener);
  },
  onWatcherError: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("watcher:error", listener);
    return () => ipcRenderer.removeListener("watcher:error", listener);
  },
  onAnalysisStream: (callback) => {
    const listener = (_event, chunk) => callback(chunk);
    ipcRenderer.on("analyze:stream", listener);
    return () => ipcRenderer.removeListener("analyze:stream", listener);
  },
  onAnalysisStreamEnd: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("analyze:stream-end", listener);
    return () => ipcRenderer.removeListener("analyze:stream-end", listener);
  },
};

contextBridge.exposeInMainWorld("clippi", api);
