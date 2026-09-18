import * as path from "path";
import * as fs from "fs";
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

function launchDolphin(replayPath: string, startFrame?: number): true {
  const safeReplayPath = validatePath(replayPath);
  const config = loadConfig();
  const dolphinPath = resolveDolphinPath(config.dolphinPath);
  const isoPath = resolveIsoPath(config);

  if (!fs.existsSync(safeReplayPath)) {
    throw new Error(`Replay file not found: ${safeReplayPath}`);
  }

  const { spawn } = require("child_process") as typeof import("child_process");
  const { seekFrame, commData } = buildExternalReplayComm(safeReplayPath, startFrame);
  console.log("[MAGI] Seek frame:", seekFrame);

  const commFile = path.join(require("os").tmpdir(), `magi-comm-${Date.now()}.json`);
  fs.writeFileSync(commFile, JSON.stringify(commData));

  const args = ["-b", "-e", isoPath, "-i", commFile];

  console.log("[MAGI] Launching Dolphin:", dolphinPath);
  console.log("[MAGI] Args:", args.join(" "));
  console.log("[MAGI] Comm file:", JSON.stringify(commData, null, 2));

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(dolphinPath, args, {
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to launch Slippi Dolphin (${dolphinPath}): ${msg}. ` +
        (/\.AppImage$/i.test(dolphinPath)
          ? "Try chmod +x on the AppImage, or --appimage-extract-and-run / install libfuse2."
          : "Check the Dolphin path in Settings."),
    );
  }

  child.on("error", (err) => {
    console.error("[MAGI] Dolphin spawn error:", err.message);
  });

  let stderrData = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrData += chunk.toString();
  });
  child.on("exit", (code) => {
    if (code !== 0 && stderrData) {
      console.error("[MAGI] Dolphin exited with code", code, "stderr:", stderrData);
    }
  });

  child.unref();

  setTimeout(() => {
    try {
      fs.unlinkSync(commFile);
    } catch {
      // Best-effort cleanup
    }
  }, 30000);

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
