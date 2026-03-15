import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as path from "path";
import { loadConfig, saveConfig, type Config } from "../config";
import {
  getDb, closeDb, getOverallRecord, getMatchupRecords,
  getStageRecords, getLatestAnalysis, getRecentGames,
  getOpponentHistory, detectSets,
  insertCoachingAnalysis, clearAllGames,
} from "../db";
import { importReplays, importAndAnalyze } from "../importer";
import { watchReplays } from "../watcher";
import {
  processGame, computeAdaptationSignals, findPlayerIdx,
  assembleUserPrompt, callGemini, SYSTEM_PROMPT,
  type GameResult,
} from "../pipeline";
import { processReplay, setAnalysisGenerator } from "../replayAnalyzer";
import { llmQueue } from "../llmQueue";

let mainWindow: BrowserWindow | null = null;
let fileWatcher: { close: () => void } | null = null;

/**
 * API key resolution order:
 * 1. GEMINI_API_KEY env var (set by the app distribution / .env)
 * 2. User's own key from config (BYOK — always free)
 *
 * For the beta, the app ships with the key baked into the env.
 * Users never need to touch API settings.
 */
function ensureApiKey(): void {
  if (process.env["GEMINI_API_KEY"]) return;

  // Fallback: check if user brought their own key
  const config = loadConfig();
  if (config.geminiApiKey) {
    process.env["GEMINI_API_KEY"] = config.geminiApiKey;
    return;
  }

  throw new Error(
    "Analysis unavailable. Please contact the developer or provide your own Gemini API key in Settings.",
  );
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.resolve(__dirname, "..", "preload", "entry.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload to use require()
    },
    titleBarStyle: "hiddenInset",
    title: "Coach-Clippi",
  });

  // In dev, load from Vite dev server; in prod, load built files
  if (process.env["VITE_DEV_SERVER_URL"]) {
    mainWindow.loadURL(process.env["VITE_DEV_SERVER_URL"]);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── IPC Handlers ─────────────────────────────────────────────────────

function setupIPC(): void {
  // Config
  ipcMain.handle("config:load", () => loadConfig());
  ipcMain.handle("config:save", (_e, config: Partial<Config>) => saveConfig(config));

  // Folder picker
  ipcMain.handle("dialog:openFolder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select Slippi Replay Folder",
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  // Import
  ipcMain.handle("import:folder", async (_e, folderPath: string, targetPlayer: string) => {
    // Resolve .slp files from folder
    const fs = require("fs") as typeof import("fs");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".slp")) files.push(full);
      }
    };
    walk(folderPath);
    files.sort();

    const result = importReplays(files, targetPlayer);
    return {
      imported: result.imported.filter((r) => !r.skipped).length,
      skipped: result.skipped,
      total: files.length,
    };
  });

  ipcMain.handle("import:analyze", async (_e, filePaths: string[], targetPlayer: string) => {
    return importAndAnalyze(filePaths, targetPlayer);
  });

  // Analyze — deduplicated. Returns cached analysis if already exists.
  ipcMain.handle("analyze:run", async (_e, replayPaths: string[], targetPlayer: string) => {
    ensureApiKey();

    // Single replay — use processReplay for dedup + caching
    if (replayPaths.length === 1) {
      const result = await processReplay(replayPaths[0]!, getDb());
      return result.analysisText;
    }

    // Multi-replay (set analysis) — run full pipeline
    const gameResults: GameResult[] = [];
    for (let i = 0; i < replayPaths.length; i++) {
      gameResults.push(processGame(replayPaths[i]!, i + 1));
    }

    if (gameResults.length === 0) {
      throw new Error("No games to analyze.");
    }

    const firstGame = gameResults[0]!.gameSummary;
    const targetTag = targetPlayer ||
      firstGame.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ||
      firstGame.players[0].tag;

    if (gameResults.length >= 2) {
      const p0Tag = firstGame.players[0].tag;
      const p1Tag = firstGame.players[1].tag;
      const p0Signals = computeAdaptationSignals(gameResults, p0Tag);
      const p1Signals = computeAdaptationSignals(gameResults, p1Tag);
      const lastResult = gameResults[gameResults.length - 1]!;
      const lastP0Idx = findPlayerIdx(lastResult.gameSummary, p0Tag);
      const lastP1Idx = findPlayerIdx(lastResult.gameSummary, p1Tag);
      lastResult.derivedInsights[lastP0Idx].adaptationSignals = p0Signals;
      lastResult.derivedInsights[lastP1Idx].adaptationSignals = p1Signals;
    }

    const userPrompt = assembleUserPrompt(gameResults, targetTag);
    const analysis = await llmQueue.enqueue(() => callGemini(SYSTEM_PROMPT, userPrompt));

    insertCoachingAnalysis(null, null, "gemini-2.5-flash", analysis);

    return analysis;
  });

  // Analyze recent games from the DB (by replay paths)
  ipcMain.handle("analyze:recent", async (_e, count: number, targetPlayer: string) => {
    const games = getDb().prepare(`
      SELECT replay_path FROM games
      WHERE played_at IS NOT NULL
      ORDER BY played_at DESC
      LIMIT ?
    `).all(count) as { replay_path: string }[];

    if (games.length === 0) {
      throw new Error("No games in database to analyze.");
    }

    // Reverse to chronological order
    const paths = games.reverse().map((g) => g.replay_path);

    ensureApiKey();

    const gameResults: GameResult[] = [];
    for (let i = 0; i < paths.length; i++) {
      gameResults.push(processGame(paths[i]!, i + 1));
    }

    const firstGame = gameResults[0]!.gameSummary;
    const targetTag = targetPlayer ||
      firstGame.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ||
      firstGame.players[0].tag;

    if (gameResults.length >= 2) {
      const p0Tag = firstGame.players[0].tag;
      const p1Tag = firstGame.players[1].tag;
      const p0Signals = computeAdaptationSignals(gameResults, p0Tag);
      const p1Signals = computeAdaptationSignals(gameResults, p1Tag);
      const lastResult = gameResults[gameResults.length - 1]!;
      const lastP0Idx = findPlayerIdx(lastResult.gameSummary, p0Tag);
      const lastP1Idx = findPlayerIdx(lastResult.gameSummary, p1Tag);
      lastResult.derivedInsights[lastP0Idx].adaptationSignals = p0Signals;
      lastResult.derivedInsights[lastP1Idx].adaptationSignals = p1Signals;
    }

    const userPrompt = assembleUserPrompt(gameResults, targetTag);
    const analysis = await llmQueue.enqueue(() => callGemini(SYSTEM_PROMPT, userPrompt));
    insertCoachingAnalysis(null, null, "gemini-2.5-flash", analysis);

    return analysis;
  });

  // Trend commentary — Coach-Clippi reacts to your trend data
  ipcMain.handle("analyze:trends", async (_e, trendSummary: string) => {
    ensureApiKey();

    const trendPrompt = `You are Coach-Clippi, a Melee coaching assistant with personality. You're reviewing a player's stat trends over their recent games.

Your voice: You're like a sharp, witty practice partner who genuinely wants to see them improve. Think of the energy of a commentator who actually knows the game — mix real analysis with personality. You can be funny, you can be blunt, you can hype them up when something's genuinely impressive. Use Melee terminology naturally.

Keep it concise — 3-5 short paragraphs max. Don't just recite the numbers back. Tell them what the numbers MEAN, what's exciting, what's concerning, and what to focus on next. If something is genuinely bad, don't sugarcoat it — but make it motivating, not demoralizing.

Open with a quick vibe check on their overall trajectory, then hit the highlights and lowlights.`;

    const analysis = await llmQueue.enqueue(() => callGemini(trendPrompt, trendSummary));
    return analysis;
  });

  // Queue status — so UI can show "3 analyses pending..."
  ipcMain.handle("queue:status", () => ({
    pending: llmQueue.pending,
    processing: llmQueue.isProcessing,
  }));

  // Stats / queries
  ipcMain.handle("stats:overall", () => getOverallRecord());
  ipcMain.handle("stats:matchups", () => getMatchupRecords());
  ipcMain.handle("stats:stages", () => getStageRecords());
  ipcMain.handle("stats:recentGames", (_e, limit: number) => getRecentGames(limit));
  ipcMain.handle("stats:latestAnalysis", () => getLatestAnalysis(1));
  ipcMain.handle("stats:opponents", (_e, search?: string) => getOpponentHistory(search));
  ipcMain.handle("stats:sets", () => detectSets());
  ipcMain.handle("data:clearAll", () => {
    clearAllGames();
    return true;
  });

  // File watcher
  ipcMain.handle("watcher:start", (_e, replayFolder: string, targetPlayer: string) => {
    if (fileWatcher) {
      fileWatcher.close();
    }
    fileWatcher = watchReplays({
      replayFolder,
      targetPlayer,
      importExisting: false,
      onImport: (result) => {
        mainWindow?.webContents.send("watcher:imported", result);
      },
      onError: (err) => {
        mainWindow?.webContents.send("watcher:error", err.message);
      },
    });
    return true;
  });

  ipcMain.handle("watcher:stop", () => {
    if (fileWatcher) {
      fileWatcher.close();
      fileWatcher = null;
    }
    return true;
  });
}

// ── App lifecycle ────────────────────────────────────────────────────

app.whenReady().then(() => {
  getDb();

  // Wire up the real analysis pipeline for replayAnalyzer dedup.
  // All LLM calls go through the rate-limited queue to prevent 429s.
  setAnalysisGenerator(async (filePath: string) => {
    ensureApiKey();
    const config = loadConfig();
    const targetPlayer = config.connectCode ?? config.targetPlayer ?? "";
    const result = processGame(filePath, 1);
    const targetTag = targetPlayer ||
      result.gameSummary.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ||
      result.gameSummary.players[0].tag;
    const userPrompt = assembleUserPrompt([result], targetTag);
    // Queue the API call — waits its turn, respects rate limits
    return llmQueue.enqueue(() => callGemini(SYSTEM_PROMPT, userPrompt));
  });

  setupIPC();
  createWindow();

  // Auto-updater — checks for updates silently on launch.
  // Only runs in production (packaged app), not in dev.
  if (!process.env["VITE_DEV_SERVER_URL"]) {
    try {
      const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");
      autoUpdater.checkForUpdatesAndNotify();
      autoUpdater.on("update-downloaded", () => {
        mainWindow?.webContents.send("update:ready");
      });
    } catch (err) {
      console.error("Auto-updater failed to initialize:", err);
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (fileWatcher) {
    fileWatcher.close();
  }
  llmQueue.clear();
  closeDb();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
