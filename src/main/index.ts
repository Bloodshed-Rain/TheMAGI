import { app, BrowserWindow } from "electron";
import * as path from "path";
import * as fs from "fs";
import { APP_USER_MODEL_ID, resolveAppIconPath } from "./appIcon";

// Load key.env (dev only) so OPENAI_API_KEY / GEMINI_API_KEY / etc. flow into
// process.env. Released builds never bundle keys — users supply their own in Settings.
function loadEnvFile(): void {
  const envPath = path.join(__dirname, "../../key.env");
  if (!fs.existsSync(envPath)) return;
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
}
loadEnvFile();

import { loadConfig } from "../config";
import { getDb, closeDb, getPlayerHistory } from "../db";
import { processGame, assembleUserPrompt, SYSTEM_PROMPT } from "../pipeline";
import { callLLM } from "../llm";
import { setAnalysisGenerator } from "../replayAnalyzer";
import { llmQueue } from "../llmQueue";
import { parsePool } from "../parsePool";
import { setMainWindow, getFileWatcher } from "./state";
import { setupIPC } from "./ipc";
import { destroyOverlayWindow } from "./overlayWindow";
import { resolveLLMConfig } from "./handlers/analysis";
import { shutdownEmbeddedReplay } from "./handlers/embeddedReplay";
import { shutdownExternalDolphin } from "./handlers/dolphin";

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

// Minimum time the splash stays up so a fast boot still reads as intentional
// rather than a flicker. Capped by the actual main-window readiness.
const SPLASH_MIN_MS = 3500;
let splashShownAt = 0;

function createSplashWindow(): void {
  const splashPath = process.env["VITE_DEV_SERVER_URL"]
    ? path.resolve(__dirname, "../../build/splash.html")
    : path.resolve(process.resourcesPath ?? __dirname, "splash.html");

  splashWindow = new BrowserWindow({
    width: 640,
    height: 440,
    frame: false,
    resizable: false,
    movable: false,
    center: true,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    // Paint dark immediately — before the HTML parses — so there's no white flash.
    backgroundColor: "#0a0d14",
    title: "MAGI",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splashShownAt = Date.now();
  splashWindow.loadFile(splashPath).catch((err) => {
    console.error("Splash failed to load:", err);
  });
  splashWindow.on("closed", () => {
    splashWindow = null;
  });

  // Safety net: never let the splash get stuck on top if ready-to-show never fires.
  setTimeout(() => closeSplash(), 12000);
}

// Fade the splash over the (already shown) main window, then destroy it.
function closeSplash(): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const win = splashWindow;
  win.webContents.executeJavaScript("document.body.classList.add('fade-out')").catch(() => {});
  setTimeout(() => {
    if (!win.isDestroyed()) win.destroy();
  }, 300); // matches the 280ms CSS opacity transition in splash.html
}

function createWindow(): void {
  const iconPath = resolveAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#0f172a", // matches --bg; avoids a white flash before the renderer paints
    icon: iconPath,
    autoHideMenuBar: true,
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

  // Fully remove the default Electron menu (File/Edit/View/…) on Win/Linux.
  // macOS keeps its app menu — it's OS-level and shouldn't be stripped.
  if (process.platform !== "darwin") {
    mainWindow.setMenu(null);
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.once("ready-to-show", () => {
    // Hold the splash for at least SPLASH_MIN_MS, then show main and fade the splash
    // over it (alwaysOnTop keeps the fade above the now-visible main window).
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashShownAt));
    setTimeout(() => {
      mainWindow?.show();
      closeSplash();
    }, wait);
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
    // Allow the initial file:// load of our own renderer HTML in production
    if (url.startsWith("file://") && url.includes("/dist/renderer/index.html")) {
      return;
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
    destroyOverlayWindow();
  });
}

// ── App lifecycle ────────────────────────────────────────────────────

// Windows derives the taskbar icon from the AppUserModelID, not the window's
// icon. Without this the shell falls back to electron.exe's default icon.
if (process.platform === "win32") app.setAppUserModelId(APP_USER_MODEL_ID);

app.whenReady().then(() => {
  // Show the boot splash immediately so the logo covers DB/IPC init and the
  // renderer's cold start (the window below stays hidden until ready-to-show).
  createSplashWindow();

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
        highlights: result.highlights,
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
      autoUpdater.on("error", () => {
        /* silently ignore update errors */
      });
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
  shutdownEmbeddedReplay();
  shutdownExternalDolphin();
  llmQueue.clear();
  parsePool.terminate();
  closeDb();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
