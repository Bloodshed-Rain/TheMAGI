import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { screen, globalShortcut } from "electron";
import { loadConfig, saveConfig } from "../../config";
import type { PlayBounds, PlayCoachingSetup } from "../../playMode";
import { getActiveModelId, getApiKey } from "../../llm";
import { PROVIDER_BY_ID } from "../../llmProviders";
import { readSlippiReplaySettings, selectPlayReplayFolder } from "../../slippiReplaySetup";
import { getChatGPTClient } from "../chatgpt";
import { PlaySessionController } from "../playSession";
import { PlayPresentation, GAME_ONLY_SHORTCUT } from "../playPresentation";
import { getMainWindow } from "../state";
import { validatePath, type SafeHandleFn } from "../ipc";

const native = () => require("../native/win32Embed.js") as typeof import("../native/win32Embed");
const attached = new WeakSet<object>();
let observingWindow: Electron.BrowserWindow | null = null;
let launchedDolphinPath: string | null = null;
let edgeTracking: ReturnType<typeof setInterval> | null = null;
function publishPlay(channel: string, value: unknown): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  try {
    win.webContents.send(channel, value);
  } catch (error) {
    console.warn(`[play] Could not publish ${channel}:`, error);
  }
}
function trackGameOnlyEdges(active: boolean): void {
  if (edgeTracking) clearInterval(edgeTracking);
  edgeTracking = null;
  if (!active) return;
  edgeTracking = setInterval(() => {
    try {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      if (
        win.isMinimized() ||
        !win.isVisible() ||
        !native().isHostedGameForeground(native().bufferToHwnd(win.getNativeWindowHandle()))
      ) {
        publishPlay("play:cursor", null);
        return;
      }
      const point = screen.getCursorScreenPoint();
      const rect = win.getContentBounds();
      publishPlay("play:cursor", {
        x: point.x - rect.x,
        y: point.y - rect.y,
        width: rect.width,
        height: rect.height,
      });
    } catch (error) {
      // An FFI or display failure must not become an uncaught interval error.
      trackGameOnlyEdges(false);
      publishPlay("play:cursor", null);
      console.warn("[play] Edge tracking stopped:", error);
    }
  }, 50);
  edgeTracking.unref();
}
const presentation = new PlayPresentation({
  isFullScreen: () => getMainWindow()?.isFullScreen() ?? false,
  setFullScreen: (active) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.setFullScreen(active);
  },
  registerExit: (exit) => globalShortcut.register(GAME_ONLY_SHORTCUT, exit),
  unregisterExit: () => globalShortcut.unregister(GAME_ONLY_SHORTCUT),
  publish: (active) => {
    trackGameOnlyEdges(active);
    publishPlay("play:gameOnly", active);
  },
});

function coachingSetup(): PlayCoachingSetup {
  const config = loadConfig();
  const dolphinPath =
    launchedDolphinPath ||
    config.playDolphinPath ||
    path.join(os.homedir(), "AppData/Roaming/Slippi Launcher/netplay/Slippi Dolphin.exe");
  let replayFolder: string | null = null;
  let issue: string | null = null;
  try {
    replayFolder = selectPlayReplayFolder(config.replayFolder, readSlippiReplaySettings(dolphinPath), (folder) => {
      try {
        return fs.statSync(folder).isDirectory();
      } catch {
        return false;
      }
    });
  } catch (error) {
    issue = error instanceof Error ? error.message : String(error);
  }
  const targetPlayer = config.connectCode || config.targetPlayer;
  if (!targetPlayer) issue = "Set your Slippi connect code in Settings → Profile to identify your player.";
  const provider = config.activeProvider;
  const modelId = getActiveModelId(config);
  const info = provider ? PROVIDER_BY_ID[provider] : null;
  const key = provider
    ? getApiKey(provider, {
        modelId,
        activeProvider: provider,
        apiKeys: config.apiKeys,
        localEndpoint: config.localEndpoint,
        azureEndpoint: config.azureEndpoint,
      })
    : null;
  let chatgptReady = false;
  let connectionIssue: string | null = null;
  if (provider === "chatgpt") {
    try {
      chatgptReady = getChatGPTClient().status().sharing;
    } catch (error) {
      connectionIssue = error instanceof Error ? error.message : String(error);
    }
  }
  const aiReady = Boolean(info && modelId && (provider === "chatgpt" ? chatgptReady : !info.needsKey || key));
  return {
    replayFolder,
    targetPlayer,
    issue,
    aiReady,
    aiMessage:
      connectionIssue ||
      (aiReady
        ? `${info!.label} selected. Provider availability is checked when generating advice.`
        : "AI coaching is not configured. Live stats and replay importing work without AI; choose a provider and model in Settings → AI."),
  };
}

function resolvePaths(): { dolphinPath: string; isoPath: string } {
  const config = loadConfig();
  // Live play must use Netplay Dolphin, never silently reuse Playback Dolphin.
  const dolphinPath =
    config.playDolphinPath || path.join(os.homedir(), "AppData/Roaming/Slippi Launcher/netplay/Slippi Dolphin.exe");
  if (!fs.existsSync(validatePath(dolphinPath)))
    throw new Error("Select Slippi Netplay Dolphin in Settings → Play Mode settings.");
  let isoPath = config.meleeIsoPath;
  if (!isoPath) {
    try {
      const settings = JSON.parse(
        fs.readFileSync(path.join(os.homedir(), "AppData/Roaming/Slippi Launcher/Settings"), "utf8"),
      );
      isoPath = settings?.settings?.isoPath;
    } catch {
      /* Setup below explains what is missing. */
    }
  }
  if (!isoPath || !fs.existsSync(validatePath(isoPath)))
    throw new Error("Select your Melee ISO in Settings → Play Mode settings.");
  return { dolphinPath, isoPath };
}

const controller = new PlaySessionController({
  spawn: () => {
    if (process.platform !== "win32") throw new Error("Hosted Play Mode currently requires Windows.");
    const win = getMainWindow();
    if (!win) throw new Error("Main window unavailable");
    if (observingWindow !== win) {
      observingWindow = win;
      const sync = () => controller.reposition();
      win.on("move", sync);
      win.on("resize", sync);
      win.on("minimize", sync);
      win.on("restore", sync);
      win.on("show", sync);
      win.on("focus", sync);
      win.on("maximize", sync);
      win.on("unmaximize", sync);
      win.on("enter-full-screen", sync);
      win.on("leave-full-screen", sync);
      win.on("leave-full-screen", () => presentation.leave(false));
      win.webContents.on("render-process-gone", () => {
        presentation.leave();
        controller.hide();
      });
      screen.on("display-metrics-changed", sync);
      win.once("closed", () => {
        presentation.leave(false);
        screen.removeListener("display-metrics-changed", sync);
        observingWindow = null;
      });
    }
    const { dolphinPath, isoPath } = resolvePaths();
    launchedDolphinPath = dolphinPath;
    return spawn(dolphinPath, ["-b", "-e", isoPath], { stdio: "ignore", windowsHide: false });
  },
  findWindow: (pid, signal) => native().findDolphinGameWindows(pid, 30000, signal),
  place: (surface, bounds) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized() || !win.isVisible()) {
      native().setHostedGameVisible(surface.mainHwnd, false);
      return;
    }
    const content = win.getContentBounds();
    const point = screen.dipToScreenPoint({ x: content.x + bounds.x, y: content.y + bounds.y });
    const scale = screen.getDisplayMatching(content).scaleFactor;
    const width = Math.round(bounds.width * scale);
    const height = Math.round(bounds.height * scale);
    if (!attached.has(surface)) {
      native().floatOver(
        native().bufferToHwnd(win.getNativeWindowHandle()),
        surface.mainHwnd,
        point.x,
        point.y,
        width,
        height,
        false,
      );
      if (surface.renderIsChild) native().coverShellWithRender(surface.mainHwnd, surface.renderHwnd);
      for (const shell of surface.shellHwnds || []) native().setHostedGameVisible(shell, false);
      attached.add(surface);
    } else {
      native().setFloatBounds(surface.mainHwnd, point.x, point.y, width, height);
      if (surface.renderIsChild) native().refitRender(surface.mainHwnd, surface.renderHwnd);
    }
    native().setHostedGameVisible(surface.mainHwnd, true);
    if (win.isFocused()) native().raiseHostedGame(surface.mainHwnd);
  },
  hide: (surface) => native().setHostedGameVisible(surface.mainHwnd, false),
  close: (surface) => native().requestClose(surface.mainHwnd),
  publish: (status) => {
    if (status.phase === "stopped" || status.phase === "error") {
      launchedDolphinPath = null;
      presentation.leave();
    }
    publishPlay("play:status", status);
  },
});

export function registerPlayHandlers(safeHandle: SafeHandleFn): void {
  safeHandle("play:gameOnly", (_e, active?: boolean) => {
    if (active === undefined) return presentation.isActive();
    if (typeof active !== "boolean") throw new Error("Invalid fullscreen state");
    if (!active) return presentation.leave();
    if (controller.getStatus().phase !== "running") throw new Error("Launch Melee before entering fullscreen.");
    return presentation.enter();
  });
  safeHandle("play:coachingSetup", () => coachingSetup());
  safeHandle("play:prepareCoaching", () => {
    if (loadConfig().cornermanEnabled === false)
      throw new Error("Enable Cornerman in Settings → Play Mode settings to start a live session.");
    const setup = coachingSetup();
    if (setup.issue) throw new Error(setup.issue);
    saveConfig({ replayFolder: setup.replayFolder, cornermanLiveStatsEnabled: true });
    return setup;
  });
  safeHandle("play:status", () => controller.getStatus());
  safeHandle("play:start", (_e, bounds: PlayBounds) => controller.open(bounds));
  safeHandle("play:show", (_e, bounds: PlayBounds) => {
    controller.show(bounds);
    return controller.getStatus();
  });
  safeHandle("play:hide", () => {
    presentation.leave();
    controller.hide();
    return controller.getStatus();
  });
  safeHandle("play:stop", () => controller.stop());
}
export function shutdownPlaySession(): void {
  presentation.leave();
  controller.stop(true);
}
