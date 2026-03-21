import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as path from "path";
import * as fs from "fs";

// Load key.env from app resources (production) or project root (dev)
function loadEnvFile(): void {
  const candidates = [
    path.join(process.resourcesPath ?? "", "key.env"),   // production
    path.join(__dirname, "../../key.env"),                 // dev
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const value = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) process.env[key] = value;
        }
      }
      break;
    }
  }
}
loadEnvFile();
import { loadConfig, saveConfig, type Config } from "../config";
import {
  getDb, closeDb, getOverallRecord, getMatchupRecords,
  getStageRecords, getLatestAnalysis, getRecentGames,
  getOpponentHistory, detectSets,
  insertCoachingAnalysis, clearAllGames,
  getCharacterList, getCharacterMatchups,
  getCharacterStageStats, getCharacterSignatureAggregates,
  getCharacterGameStats,
} from "../db";
import { importReplays, importAndAnalyze } from "../importer";
import { watchReplays } from "../watcher";
import {
  processGame, computeAdaptationSignals, findPlayerIdx,
  assembleUserPrompt, SYSTEM_PROMPT,
  type GameResult,
} from "../pipeline";
import { callLLM, LLM_DEFAULTS, MODELS, getModelLabel, type LLMConfig } from "../llm";
import { processReplay, setAnalysisGenerator } from "../replayAnalyzer";
import { llmQueue } from "../llmQueue";

let mainWindow: BrowserWindow | null = null;
let fileWatcher: { close: () => void } | null = null;

/** Build LLMConfig from user config + env vars */
function resolveLLMConfig(): LLMConfig {
  const config = loadConfig();
  return {
    modelId: config.llmModelId ?? LLM_DEFAULTS.modelId,
    openrouterApiKey: config.openrouterApiKey ?? null,
    geminiApiKey: config.geminiApiKey ?? null,
    anthropicApiKey: config.anthropicApiKey ?? null,
    openaiApiKey: config.openaiApiKey ?? null,
    localEndpoint: config.localEndpoint ?? null,
  };
}

function createWindow(): void {
  const iconPath = process.env["VITE_DEV_SERVER_URL"]
    ? path.resolve(__dirname, "../../build/icon.png")
    : path.resolve(process.resourcesPath ?? __dirname, "icon.png");

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: iconPath,
    webPreferences: {
      preload: process.env["VITE_DEV_SERVER_URL"]
        ? path.resolve(__dirname, "..", "preload", "entry.js")
        : path.resolve(__dirname, "../../../src/preload/entry.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload to use require()
    },
    titleBarStyle: "hiddenInset",
    title: "MAGI",
  });

  // In dev, load from Vite dev server; in prod, load built files
  if (process.env["VITE_DEV_SERVER_URL"]) {
    mainWindow.loadURL(process.env["VITE_DEV_SERVER_URL"]);
    mainWindow.webContents.openDevTools();
  } else {
    // In prod, __dirname is dist/main/main/ — go up to project root, then into dist/renderer
    mainWindow.loadFile(path.join(__dirname, "../../../dist/renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── IPC Handlers ─────────────────────────────────────────────────────

/** Wrap an IPC handler so errors are always serialized properly to the renderer */
function safeHandle(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(message);
    }
  });
}

function setupIPC(): void {
  // Config
  safeHandle("config:load", () => loadConfig());
  safeHandle("config:save", (_e, config: Partial<Config>) => saveConfig(config));

  // Folder picker
  safeHandle("dialog:openFolder", async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Select Slippi Replay Folder",
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  // Import
  safeHandle("import:folder", async (_e, folderPath: string, targetPlayer: string) => {
    // Resolve .slp files from folder
    const fs = require("fs") as typeof import("fs");
    const files: string[] = [];
    const walk = (dir: string) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith(".slp")) files.push(full);
        }
      } catch (err) {
        console.error(`[import] Cannot read directory ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    walk(folderPath);

    if (files.length === 0) {
      throw new Error(`No .slp replay files found in: ${folderPath}`);
    }

    files.sort();

    const result = importReplays(files, targetPlayer);
    return {
      imported: result.imported.filter((r) => !r.skipped).length,
      skipped: result.skipped,
      total: files.length,
    };
  });

  safeHandle("import:analyze", async (_e, filePaths: string[], targetPlayer: string) => {
    return importAndAnalyze(filePaths, targetPlayer);
  });

  // Analyze — deduplicated. Returns cached analysis if already exists.
  safeHandle("analyze:run", async (_e, replayPaths: string[], targetPlayer: string) => {
    const llmConfig = resolveLLMConfig();

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
    const analysis = await llmQueue.enqueue(() =>
      callLLM({ systemPrompt: SYSTEM_PROMPT, userPrompt, config: llmConfig }),
    );

    insertCoachingAnalysis(null, null, llmConfig.modelId, analysis);

    return analysis;
  });

  // Analyze recent games from the DB (by replay paths)
  safeHandle("analyze:recent", async (_e, count: number, targetPlayer: string) => {
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

    const llmConfig = resolveLLMConfig();

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
    const analysis = await llmQueue.enqueue(() =>
      callLLM({ systemPrompt: SYSTEM_PROMPT, userPrompt, config: llmConfig }),
    );
    insertCoachingAnalysis(null, null, llmConfig.modelId, analysis);

    return analysis;
  });

  // Trend commentary — MAGI reacts to your trend data
  safeHandle("analyze:trends", async (_e, trendSummary: string) => {
    const llmConfig = resolveLLMConfig();

    const trendPrompt = `You are MAGI (Melee Analysis through Generative Intelligence), a Melee coaching assistant with personality. You're reviewing a player's stat trends over their recent games.

Your voice: You're like a sharp, witty practice partner who genuinely wants to see them improve. Think of the energy of a commentator who actually knows the game — mix real analysis with personality. You can be funny, you can be blunt, you can hype them up when something's genuinely impressive. Use Melee terminology naturally.

Keep it concise — 3-5 short paragraphs max. Don't just recite the numbers back. Tell them what the numbers MEAN, what's exciting, what's concerning, and what to focus on next. If something is genuinely bad, don't sugarcoat it — but make it motivating, not demoralizing.

Open with a quick vibe check on their overall trajectory, then hit the highlights and lowlights.`;

    const analysis = await llmQueue.enqueue(() =>
      callLLM({ systemPrompt: trendPrompt, userPrompt: trendSummary, config: llmConfig }),
    );
    return analysis;
  });

  // Fetch OpenRouter models from main process (renderer is blocked by CSP)
  safeHandle("openrouter:models", async () => {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) throw new Error(`OpenRouter API ${res.status}`);
    const json = await res.json() as { data: any[] };
    return json.data;
  });

  // LLM models list — for the Settings UI
  safeHandle("llm:models", () => MODELS);
  safeHandle("llm:currentModel", () => {
    const config = loadConfig();
    const modelId = config.llmModelId ?? LLM_DEFAULTS.modelId;
    return { modelId, label: getModelLabel(modelId) };
  });

  // Queue status — so UI can show "3 analyses pending..."
  safeHandle("queue:status", () => ({
    pending: llmQueue.pending,
    processing: llmQueue.isProcessing,
  }));

  // Stats / queries
  safeHandle("stats:overall", () => getOverallRecord());
  safeHandle("stats:matchups", () => getMatchupRecords());
  safeHandle("stats:stages", () => getStageRecords());
  safeHandle("stats:recentGames", (_e, limit: number) => getRecentGames(limit));
  safeHandle("stats:latestAnalysis", () => getLatestAnalysis(1));
  safeHandle("stats:opponents", (_e, search?: string) => getOpponentHistory(search));
  safeHandle("stats:sets", () => detectSets());
  safeHandle("stats:characterList", () => getCharacterList());
  safeHandle("stats:characterMatchups", (_e, character: string) => getCharacterMatchups(character));
  safeHandle("stats:characterStages", (_e, character: string) => getCharacterStageStats(character));
  safeHandle("stats:characterSignature", (_e, character: string) => getCharacterSignatureAggregates(character));
  safeHandle("stats:characterGameStats", (_e, character: string) => getCharacterGameStats(character));
  safeHandle("data:clearAll", () => {
    clearAllGames();
    return true;
  });

  // File watcher
  safeHandle("watcher:start", (_e, replayFolder: string, targetPlayer: string) => {
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

  safeHandle("watcher:stop", () => {
    if (fileWatcher) {
      fileWatcher.close();
      fileWatcher = null;
    }
    return true;
  });

  // Dolphin replay playback
  safeHandle("replay:openInDolphin", async (_e, replayPath: string) => {
    const config = loadConfig();
    let dolphinPath = config.dolphinPath;

    // Auto-detect common Slippi Dolphin locations if not configured
    if (!dolphinPath) {
      const { execSync } = require("child_process") as typeof import("child_process");
      const home = require("os").homedir();
      const candidates = process.platform === "linux"
        ? [
            // Slippi Launcher standard paths (most common)
            path.join(home, ".config/Slippi Launcher/playback/Slippi_Playback-x86_64.AppImage"),
            path.join(home, ".config/Slippi Launcher/netplay/Slippi_Online-x86_64.AppImage"),
            // Flatpak / system installs
            "/usr/bin/slippi-dolphin",
            "/usr/local/bin/slippi-dolphin",
            path.join(home, "Slippi-Dolphin/squashfs-root/usr/bin/dolphin-emu"),
            path.join(home, ".local/bin/slippi-dolphin"),
          ]
        : process.platform === "darwin"
          ? [
              "/Applications/Slippi Dolphin.app/Contents/MacOS/Slippi Dolphin",
              path.join(home, "Applications/Slippi Dolphin.app/Contents/MacOS/Slippi Dolphin"),
              path.join(home, "Library/Application Support/Slippi Launcher/playback/Slippi Dolphin.app/Contents/MacOS/Slippi Dolphin"),
            ]
          : [
              "C:\\Users\\" + require("os").userInfo().username + "\\AppData\\Roaming\\Slippi Launcher\\playback\\Slippi Dolphin.exe",
              "C:\\Program Files\\Slippi Dolphin\\Slippi Dolphin.exe",
            ];

      // Also try `which` on unix
      if (process.platform !== "win32") {
        try {
          const found = execSync("which slippi-dolphin 2>/dev/null || which dolphin-emu 2>/dev/null", { encoding: "utf-8" }).trim();
          if (found) candidates.unshift(found);
        } catch { /* not found */ }
      }

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          dolphinPath = candidate;
          break;
        }
      }
    }

    if (!dolphinPath) {
      throw new Error(
        "Slippi Dolphin not found. Set the Dolphin path in Settings."
      );
    }

    if (!fs.existsSync(dolphinPath)) {
      throw new Error(
        `Dolphin not found at: ${dolphinPath}. Update the path in Settings.`
      );
    }

    if (!fs.existsSync(replayPath)) {
      throw new Error(`Replay file not found: ${replayPath}`);
    }

    // Slippi Playback Dolphin uses JSON comm mode:
    //   -i <comm.json>   replay command file
    //   -e <melee.iso>   game ISO
    //   -u <user_dir>    user config/data directory
    const { spawn } = require("child_process") as typeof import("child_process");
    const { randomUUID } = require("crypto") as typeof import("crypto");
    const home = require("os").homedir();

    // Build JSON comm file telling Dolphin to play this replay
    const commFile = path.join(require("os").tmpdir(), `magi-comm-${Date.now()}.json`);
    fs.writeFileSync(commFile, JSON.stringify({
      mode: "mirror",
      replay: replayPath,
      isRealTimeMode: false,
      commandId: randomUUID(),
    }));

    // Find Melee ISO — check Slippi Launcher settings first, then config
    let isoPath: string | null = null;
    try {
      const slippiSettingsPath = path.join(home, ".config/Slippi Launcher/Settings");
      if (fs.existsSync(slippiSettingsPath)) {
        const slippiSettings = JSON.parse(fs.readFileSync(slippiSettingsPath, "utf-8"));
        if (slippiSettings?.settings?.isoPath && fs.existsSync(slippiSettings.settings.isoPath)) {
          isoPath = slippiSettings.settings.isoPath;
        }
      }
    } catch { /* ignore parse errors */ }

    // User dir for playback Dolphin
    const userDir = path.join(home, ".config/SlippiPlayback");

    const args = ["-i", commFile];
    if (isoPath) args.push("-e", isoPath);
    if (fs.existsSync(userDir)) args.push("-u", userDir);

    const child = spawn(dolphinPath, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    // Clean up comm file after a delay
    setTimeout(() => { try { fs.unlinkSync(commFile); } catch {} }, 30000);

    return true;
  });

  // Browse for Dolphin executable
  safeHandle("dialog:openFile", async (_e, title: string, filters: { name: string; extensions: string[] }[]) => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      title,
      filters,
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
}

// ── App lifecycle ────────────────────────────────────────────────────

app.whenReady().then(() => {
  getDb();

  // Wire up the real analysis pipeline for replayAnalyzer dedup.
  // All LLM calls go through the rate-limited queue to prevent 429s.
  setAnalysisGenerator(async (filePath: string) => {
    const llmConfig = resolveLLMConfig();
    const config = loadConfig();
    const targetPlayer = config.connectCode ?? config.targetPlayer ?? "";
    const result = processGame(filePath, 1);
    const targetTag = targetPlayer ||
      result.gameSummary.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ||
      result.gameSummary.players[0].tag;
    const userPrompt = assembleUserPrompt([result], targetTag);
    // Queue the API call — waits its turn, respects rate limits
    const analysisText = await llmQueue.enqueue(() =>
      callLLM({ systemPrompt: SYSTEM_PROMPT, userPrompt, config: llmConfig }),
    );
    return {
      analysisText,
      gameResult: {
        gameSummary: result.gameSummary,
        derivedInsights: result.derivedInsights,
        startAt: result.startAt,
      },
      targetPlayer: targetTag,
    };
  });

  setupIPC();
  createWindow();

  // Auto-updater — checks for updates silently on launch.
  // Only runs in production (packaged app), not in dev.
  if (!process.env["VITE_DEV_SERVER_URL"]) {
    try {
      const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");
      autoUpdater.on("error", () => { /* silently ignore update errors */ });
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
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
