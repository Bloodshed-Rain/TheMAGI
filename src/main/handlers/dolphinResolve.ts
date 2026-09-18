import * as path from "path";
import * as fs from "fs";

/** Clamp countdown / negative frames so Slippi Playback starts at playable frame 0. */
export function clampReplayStartFrame(frame: number): number {
  return Math.max(0, Math.floor(frame));
}

/**
 * Linux Dolphin discovery order (Playback first, never prefer vanilla dolphin-emu).
 * Pure-ish helper so unit tests can lock the preference order.
 */
export function listLinuxDolphinCandidates(home: string): string[] {
  const playbackDir = path.join(home, ".config/Slippi Launcher/playback");
  const netplayDir = path.join(home, ".config/Slippi Launcher/netplay");
  const preferredPlayback = path.join(playbackDir, "Slippi_Playback-x86_64.AppImage");
  const candidates: string[] = [];

  const pushUnique = (p: string) => {
    if (p && !candidates.includes(p)) candidates.push(p);
  };

  pushUnique(preferredPlayback);

  try {
    if (fs.existsSync(playbackDir)) {
      const names = fs.readdirSync(playbackDir).filter((n) => n.endsWith(".AppImage"));
      const ranked = [
        ...names.filter((n) => /playback/i.test(n)),
        ...names.filter((n) => /mainline/i.test(n) && !/playback/i.test(n)),
        ...names.filter((n) => !/playback/i.test(n) && !/mainline/i.test(n)),
      ];
      for (const name of ranked) {
        pushUnique(path.join(playbackDir, name));
      }
    }
  } catch {
    /* ignore unreadable dir */
  }

  pushUnique(path.join(netplayDir, "Slippi_Online-x86_64.AppImage"));
  try {
    if (fs.existsSync(netplayDir)) {
      for (const name of fs.readdirSync(netplayDir)) {
        if (name.endsWith(".AppImage")) pushUnique(path.join(netplayDir, name));
      }
    }
  } catch {
    /* ignore */
  }

  pushUnique("/usr/bin/slippi-dolphin");
  pushUnique("/usr/local/bin/slippi-dolphin");
  pushUnique(path.join(home, ".local/bin/slippi-dolphin"));
  pushUnique(path.join(home, "Slippi-Dolphin/squashfs-root/usr/bin/dolphin-emu"));

  return candidates;
}

export function listDarwinDolphinCandidates(home: string): string[] {
  return [
    "/Applications/Slippi Dolphin.app/Contents/MacOS/Slippi Dolphin",
    path.join(home, "Applications/Slippi Dolphin.app/Contents/MacOS/Slippi Dolphin"),
    path.join(
      home,
      "Library/Application Support/Slippi Launcher/playback/Slippi Dolphin.app/Contents/MacOS/Slippi Dolphin",
    ),
  ];
}

export function listWin32DolphinCandidates(home: string): string[] {
  return [
    path.join(home, "AppData", "Roaming", "Slippi Launcher", "playback", "Slippi Dolphin.exe"),
    "C:\\Program Files\\Slippi Dolphin\\Slippi Dolphin.exe",
  ];
}

/** Append PATH hits for Slippi-named binaries only — never unshift vanilla dolphin-emu. */
export function appendWhichSlippiDolphin(candidates: string[]): string[] {
  if (process.platform === "win32") return candidates;
  try {
    const { execSync } = require("child_process") as typeof import("child_process");
    const found = execSync("which slippi-dolphin 2>/dev/null", { encoding: "utf-8" }).trim();
    if (found && !candidates.includes(found)) {
      return [...candidates, found];
    }
  } catch {
    /* not on PATH */
  }
  return candidates;
}

export function assertDolphinRunnable(dolphinPath: string): void {
  if (!fs.existsSync(dolphinPath)) {
    throw new Error(`Dolphin not found at: ${dolphinPath}. Update the path in Settings.`);
  }

  const isAppImage = /\.AppImage$/i.test(dolphinPath);
  if (isAppImage) {
    try {
      fs.accessSync(dolphinPath, fs.constants.X_OK);
    } catch {
      throw new Error(
        `Slippi Playback AppImage is not executable: ${dolphinPath}. ` +
          `Run: chmod +x "${dolphinPath}" — or if FUSE fails, try --appimage-extract-and-run / install libfuse2.`,
      );
    }
  }
}

export function buildExternalReplayComm(
  replayPath: string,
  startFrame?: number,
): { seekFrame: number | null; commData: Record<string, unknown> } {
  const seekFrame = startFrame != null ? clampReplayStartFrame(startFrame) : null;
  const commandId = Math.random().toString(36).slice(2);
  const commData: Record<string, unknown> =
    seekFrame != null
      ? {
          mode: "queue",
          queue: [{ path: replayPath, startFrame: seekFrame }],
          isRealTimeMode: false,
          commandId,
        }
      : {
          mode: "normal",
          replay: replayPath,
          isRealTimeMode: false,
          commandId,
        };
  return { seekFrame, commData };
}
