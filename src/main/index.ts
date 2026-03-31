import { app, BrowserWindow } from "electron";
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

import { loadConfig } from "../config";
import { getDb, closeDb, getPlayerHistory } from "../db";
import { processGame, assembleUserPrompt, SYSTEM_PROMPT } from "../pipeline";
import { callLLM } from "../llm";
import { setAnalysisGenerator } from "../replayAnalyzer";
import { llmQueue } from "../llmQueue";
import { setMainWindow, getFileWatcher } from "./state";
import { setupIPC } from "./ipc";
import { resolveLLMConfig } from "./handlers/analysis";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const iconPath = process.env["VITE_DEV_SERVER_URL"]
    ? path.resolve(__dirname, "../../build/icon.png")
    : path.resolve(process.resourcesPath ?? __dirname, "icon.png");

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: process.env["VITE_DEV_SERVER_URL"]
        ? path.resolve(__dirname, "../../dist/main/preload/index.js")
        : path.resolve(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload to use require()
    },
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const } : {}),
    title: "MAGI",
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Block ALL navigation — this is a single-page app, never navigate away.
  // Prevents timestamp: protocol links from crashing/reloading the app.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    // Allow Vite HMR full-reload (exact URL only, not link clicks to sub-paths)
    const devServer = process.env["VITE_DEV_SERVER_URL"];
    if (devServer) {
      const devOrigin = new URL(devServer).origin;
      const navOrigin = new URL(url).origin;
      // Only allow if it's the exact root URL or a Vite HMR internal reload
      if (navOrigin === devOrigin && (url === devServer || url === devServer + "/" || url.includes("/@vite"))) {
        return;
      }
    }
    event.preventDefault();
  });

  // Also block window.open and new-window attempts
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  setMainWindow(mainWindow);

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
    setMainWindow(null);
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
    const configTarget = config.connectCode ?? config.targetPlayer ?? "";
    const result = processGame(filePath, 1);
    // Use configured target player. Only fall back to guessing if nothing is configured.
    let targetTag = configTarget;
    if (!targetTag) {
      // No target configured — try to pick the first real player, but warn
      console.warn("[analysisGenerator] No target player configured — guessing from replay data");
      targetTag =
        result.gameSummary.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ??
        result.gameSummary.players[0].tag;
    }
    // Query player history for contextual coaching
    const playerHistory = getPlayerHistory(targetTag) ?? undefined;
    const userPrompt = assembleUserPrompt([result], targetTag, playerHistory);
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
  const watcher = getFileWatcher();
  if (watcher) {
    watcher.close();
  }
  llmQueue.clear();
  closeDb();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
