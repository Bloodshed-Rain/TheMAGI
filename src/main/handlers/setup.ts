import os from "os";
import path from "path";
import { loadConfig } from "../../config";
import { checkSetupPath, type SetupStatus, type SetupPathCheck } from "../../setupStatus";
import { readSlippiReplaySettings } from "../../slippiReplaySetup";
import { resolveDolphinPath, resolveIsoPath } from "./dolphin";
import type { SafeHandleFn } from "../ipc";

export function registerSetupHandlers(safeHandle: SafeHandleFn): void {
  safeHandle("setup:status", (): SetupStatus => {
    const config = loadConfig();
    const resolve = (getPath: () => string): SetupPathCheck => {
      try {
        return checkSetupPath(getPath(), "file");
      } catch (error) {
        return { path: null, ready: false, message: error instanceof Error ? error.message : String(error) };
      }
    };
    const playback = resolve(() => resolveDolphinPath(config.dolphinPath));
    const melee = config.meleeIsoPath
      ? checkSetupPath(config.meleeIsoPath, "file")
      : resolve(() => resolveIsoPath(config));
    const netplay = checkSetupPath(
      config.playDolphinPath ||
        (process.platform === "win32"
          ? path.join(os.homedir(), "AppData/Roaming/Slippi Launcher/netplay/Slippi Dolphin.exe")
          : null),
      "file",
    );
    const detected = netplay.ready && netplay.path ? readSlippiReplaySettings(netplay.path) : null;
    return {
      platform: process.platform,
      playback,
      netplay,
      melee,
      replays: checkSetupPath(config.replayFolder || detected?.replayFolder, "folder"),
      replaySavingEnabled: detected?.savingEnabled ?? null,
    };
  });
}
