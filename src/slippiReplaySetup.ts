import fs from "fs";
import path from "path";

export interface SlippiReplaySettings {
  replayFolder: string | null;
  savingEnabled: boolean | null;
}
/** Read only replay-output and spectator-stream settings from Dolphin's INI;
 * never read Slippi's authentication file or change the emulator's configuration. */
export function parseSlippiReplaySettings(source: string, dolphinDirectory: string): SlippiReplaySettings {
  let section = "";
  let folder: string | null = null;
  let saving: boolean | null = null;
  for (const line of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^[#;]/.test(trimmed)) continue;
    const heading = /^\[([^\]]+)\]$/.exec(trimmed);
    if (heading) {
      section = heading[1]!.toLowerCase();
      continue;
    }
    if (section !== "core") continue;
    const entry = /^([^=]+)=(.*)$/.exec(trimmed);
    if (!entry) continue;
    const key = entry[1]!.trim().toLowerCase();
    const value = entry[2]!.trim().replace(/^"(.*)"$/, "$1");
    if (key === "slippireplaydir" && value) folder = path.resolve(dolphinDirectory, value);
    if (key === "slippisavereplays") {
      if (/^(true|1)$/i.test(value)) saving = true;
      if (/^(false|0)$/i.test(value)) saving = false;
    }
  }
  return { replayFolder: folder, savingEnabled: saving };
}
export interface SlippiSpectatorSettings {
  /** Whether Dolphin serves its live game stream; null when the INI does not say. */
  enabled: boolean | null;
  /** The local port it serves on; null when the INI does not say or the value is not a port. */
  port: number | null;
}
/** Read `SlippiEnableSpectator` / `SlippiSpectatorLocalPort` from Dolphin's INI [Core] section. */
export function parseSlippiSpectatorSettings(source: string): SlippiSpectatorSettings {
  let section = "";
  let enabled: boolean | null = null;
  let port: number | null = null;
  for (const line of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^[#;]/.test(trimmed)) continue;
    const heading = /^\[([^\]]+)\]$/.exec(trimmed);
    if (heading) {
      section = heading[1]!.toLowerCase();
      continue;
    }
    if (section !== "core") continue;
    const entry = /^([^=]+)=(.*)$/.exec(trimmed);
    if (!entry) continue;
    const key = entry[1]!.trim().toLowerCase();
    const value = entry[2]!.trim();
    if (key === "slippienablespectator") {
      if (/^(true|1)$/i.test(value)) enabled = true;
      if (/^(false|0)$/i.test(value)) enabled = false;
    }
    if (key === "slippispectatorlocalport" && /^\d{1,5}$/.test(value)) {
      const parsed = Number(value);
      if (parsed >= 1 && parsed <= 65535) port = parsed;
    }
  }
  return { enabled, port };
}
export function readSlippiSpectatorSettings(dolphinPath: string): SlippiSpectatorSettings {
  try {
    return parseSlippiSpectatorSettings(
      fs.readFileSync(path.join(path.dirname(dolphinPath), "User/Config/Dolphin.ini"), "utf8"),
    );
  } catch {
    return { enabled: null, port: null };
  }
}
export function readSlippiReplaySettings(dolphinPath: string): SlippiReplaySettings {
  const directory = path.dirname(dolphinPath);
  try {
    return parseSlippiReplaySettings(
      fs.readFileSync(path.join(directory, "User/Config/Dolphin.ini"), "utf8"),
      directory,
    );
  } catch {
    return { replayFolder: null, savingEnabled: null };
  }
}
export function selectPlayReplayFolder(
  configured: string | null,
  detected: SlippiReplaySettings,
  isDirectory: (folder: string) => boolean,
): string {
  if (detected.savingEnabled === false)
    throw new Error(
      "Slippi replay saving is disabled. Enable Save replays in Dolphin to use live stats and Cornerman.",
    );
  // The hosted emulator's output is authoritative for this live session. A
  // stale library-import folder must not silently swallow every live game.
  const folder = detected.replayFolder || configured;
  if (!folder || !isDirectory(folder))
    throw new Error(
      "No readable live replay folder was found. Choose Slippi’s replay output folder in Play Mode setup.",
    );
  return folder;
}
