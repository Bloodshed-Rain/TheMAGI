import * as path from "path";
import * as fs from "fs";
import type { ChildProcess } from "child_process";
import { loadConfig } from "../../config.js";
import { type SafeHandleFn, validatePath } from "../ipc.js";
import {
  appendWhichSlippiDolphin,
  assertDolphinRunnable,
  buildExternalReplayComm,
  listDarwinDolphinCandidates,
  listLinuxDolphinCandidates,
  listWin32DolphinCandidates,
} from "./dolphinResolve.js";

export {
  appendWhichSlippiDolphin,
  assertDolphinRunnable,
  buildExternalReplayComm,
  clampReplayStartFrame,
  listDarwinDolphinCandidates,
  listLinuxDolphinCandidates,
  listWin32DolphinCandidates,
} from "./dolphinResolve.js";

/** One external Playback Dolphin at a time — seek relaunches replace the previous. */
let activeExternal: { pid: number; child: ChildProcess } | null = null;

/** Linux AppImage cold start can exceed 30s; keep the comm file until exit or this cap. */
const COMM_FILE_MAX_MS = 120_000;

export function killActiveExternalDolphin(): void {
  const session = activeExternal;
  if (!session) return;
  activeExternal = null;

  const { pid, child } = session;
  try {
    if (process.platform === "win32") {
      if (!child.killed) child.kill();
      try {
        // Detached AppImages / Dolphin may outlive the spawn handle on Windows
        process.kill(pid);
      } catch {
        /* already gone */
      }
    } else {
      // Spawned with detached:true → new process group; negative PID signals the group
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
      setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            /* already gone */
          }
        }
      }, 800);
    }
  } catch (err) {
    console.error("[MAGI] Failed to stop previous Dolphin:", err);
  }
}

function resolveDolphinPath(configured: string | null | undefined): string {
  if (configured) {
    assertDolphinRunnable(configured);
    return configured;
  }

  const home = require("os").homedir() as string;
  let candidates =
    process.platform === "linux"
      ? listLinuxDolphinCandidates(home)
      : process.platform === "darwin"
        ? listDarwinDolphinCandidates(home)
        : listWin32DolphinCandidates(home);

  if (process.platform !== "win32") {
    candidates = appendWhichSlippiDolphin(candidates);
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      assertDolphinRunnable(candidate);
      return candidate;
    }
  }

  throw new Error(
    "Slippi Dolphin not found. Install Slippi Launcher (Playback) or set the Dolphin path in MAGI Settings.",
  );
}

function resolveIsoPath(config: { meleeIsoPath?: string | null }): string {
  const home = require("os").homedir() as string;

  if (config.meleeIsoPath && fs.existsSync(config.meleeIsoPath)) {
    return config.meleeIsoPath;
  }

  try {
    const slippiSettingsCandidates =
      process.platform === "darwin"
        ? [path.join(home, "Library/Application Support/Slippi Launcher/Settings")]
        : process.platform === "win32"
          ? [path.join(home, "AppData/Roaming/Slippi Launcher/Settings")]
          : [path.join(home, ".config/Slippi Launcher/Settings")];

    for (const slippiSettingsPath of slippiSettingsCandidates) {
      if (fs.existsSync(slippiSettingsPath)) {
        const slippiSettings = JSON.parse(fs.readFileSync(slippiSettingsPath, "utf-8"));
        if (slippiSettings?.settings?.isoPath && fs.existsSync(slippiSettings.settings.isoPath)) {
          return slippiSettings.settings.isoPath as string;
        }
      }
    }
  } catch {
    /* ignore parse errors */
  }

  throw new Error("Melee ISO not found. Set your Melee ISO path in MAGI Settings (Slippi Dolphin section).");
}

function looksLikeFuseOrAppImageError(stderr: string, message: string): boolean {
  const text = `${stderr}\n${message}`.toLowerCase();
  return (
    text.includes("fuse") ||
    text.includes("appimage") ||
    text.includes("squashfs") ||
    text.includes("libfuse") ||
    text.includes("no such file") ||
    text.includes("permission denied")
  );
}

function spawnDetached(
  dolphinPath: string,
  args: string[],
): ChildProcess {
  const { spawn } = require("child_process") as typeof import("child_process");
  return spawn(dolphinPath, args, {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
}

function launchDolphin(replayPath: string, startFrame?: number): true {
  const safeReplayPath = validatePath(replayPath);
  const config = loadConfig();
  const dolphinPath = resolveDolphinPath(config.dolphinPath);
  const isoPath = resolveIsoPath(config);

  if (!fs.existsSync(safeReplayPath)) {
    throw new Error(`Replay file not found: ${safeReplayPath}`);
  }

  // One Dolphin at a time: kill previous external before seek/open relaunch
  killActiveExternalDolphin();

  const { seekFrame, commData } = buildExternalReplayComm(safeReplayPath, startFrame);
  console.log("[MAGI] Seek frame:", seekFrame);

  const commFile = path.join(require("os").tmpdir(), `magi-comm-${Date.now()}.json`);
  fs.writeFileSync(commFile, JSON.stringify(commData));

  const playbackArgs = ["-b", "-e", isoPath, "-i", commFile];
  const isAppImage = /\.AppImage$/i.test(dolphinPath);

  console.log("[MAGI] Launching Dolphin:", dolphinPath);
  console.log("[MAGI] Args:", playbackArgs.join(" "));
  console.log("[MAGI] Comm file:", JSON.stringify(commData, null, 2));

  let child: ChildProcess;
  try {
    child = spawnDetached(dolphinPath, playbackArgs);
  } catch (err) {
    try {
      fs.unlinkSync(commFile);
    } catch {
      /* ignore */
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to launch Slippi Dolphin (${dolphinPath}): ${msg}. ` +
        (isAppImage
          ? "Try chmod +x on the AppImage, or --appimage-extract-and-run / install libfuse2."
          : "Check the Dolphin path in Settings."),
    );
  }

  if (child.pid == null) {
    try {
      fs.unlinkSync(commFile);
    } catch {
      /* ignore */
    }
    throw new Error(`Failed to launch Slippi Dolphin (${dolphinPath}): no PID.`);
  }

  let stderrData = "";
  let cleanedComm = false;
  const unlinkComm = () => {
    if (cleanedComm) return;
    cleanedComm = true;
    try {
      fs.unlinkSync(commFile);
    } catch {
      /* best-effort */
    }
  };

  const clearIfActive = (pid: number) => {
    if (activeExternal?.pid === pid) activeExternal = null;
  };

  child.stderr?.on("data", (chunk: Buffer) => {
    stderrData += chunk.toString();
  });

  child.on("error", (err) => {
    console.error("[MAGI] Dolphin spawn error:", err.message);
    unlinkComm();
    clearIfActive(child.pid!);
  });

  child.on("exit", (code) => {
    unlinkComm();
    clearIfActive(child.pid!);
    if (code !== 0 && stderrData) {
      console.error("[MAGI] Dolphin exited with code", code, "stderr:", stderrData);
    }
  });

  // Cap: Linux AppImage cold start can be slow; prefer exit-based unlink above
  setTimeout(unlinkComm, COMM_FILE_MAX_MS);

  activeExternal = { pid: child.pid, child };
  child.unref();

  // If AppImage dies immediately on FUSE errors, retry once with extract-and-run
  if (isAppImage) {
    const launchPid = child.pid;
    setTimeout(() => {
      if (activeExternal?.pid !== launchPid) return;
      // Still "active" but process may have exited — check via kill(pid, 0)
      try {
        process.kill(launchPid, 0);
        return; // still alive
      } catch {
        /* exited */
      }

      if (!looksLikeFuseOrAppImageError(stderrData, "")) {
        // Unknown early exit — still worth one extract-and-run retry on Linux
        if (process.platform !== "linux") return;
      }

      console.log("[MAGI] AppImage exited early; retrying with --appimage-extract-and-run");
      killActiveExternalDolphin();

      const retryComm = path.join(require("os").tmpdir(), `magi-comm-${Date.now()}.json`);
      fs.writeFileSync(retryComm, JSON.stringify(commData));
      const retryArgs = ["--appimage-extract-and-run", ...playbackArgs.slice(0, -1), retryComm];

      let retry: ChildProcess;
      try {
        retry = spawnDetached(dolphinPath, retryArgs);
      } catch (err) {
        try {
          fs.unlinkSync(retryComm);
        } catch {
          /* ignore */
        }
        console.error("[MAGI] AppImage extract-and-run retry failed:", err);
        return;
      }

      if (retry.pid == null) {
        try {
          fs.unlinkSync(retryComm);
        } catch {
          /* ignore */
        }
        return;
      }

      let retryCleaned = false;
      const unlinkRetry = () => {
        if (retryCleaned) return;
        retryCleaned = true;
        try {
          fs.unlinkSync(retryComm);
        } catch {
          /* ignore */
        }
      };

      retry.on("exit", () => {
        unlinkRetry();
        if (activeExternal?.pid === retry.pid) activeExternal = null;
      });
      retry.on("error", () => {
        unlinkRetry();
        if (activeExternal?.pid === retry.pid) activeExternal = null;
      });
      setTimeout(unlinkRetry, COMM_FILE_MAX_MS);

      activeExternal = { pid: retry.pid, child: retry };
      retry.unref();
    }, 1500);
  }

  return true;
}

export function registerDolphinHandlers(safeHandle: SafeHandleFn): void {
  safeHandle("replay:openInDolphin", async (_e, replayPath: string) => {
    return launchDolphin(replayPath);
  });

  safeHandle("replay:openInDolphinAtFrame", async (_e, replayPath: string, frame: number) => {
    return launchDolphin(replayPath, frame);
  });
}

/** Tear down on app quit so we don't leak a Playback Dolphin. */
export function shutdownExternalDolphin(): void {
  killActiveExternalDolphin();
}
