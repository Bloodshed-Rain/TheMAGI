import fs from "fs";
import path from "path";

export interface SetupPathCheck {
  path: string | null;
  ready: boolean;
  message: string;
}
export interface SetupStatus {
  platform: string;
  replays: SetupPathCheck;
  playback: SetupPathCheck;
  netplay: SetupPathCheck;
  melee: SetupPathCheck;
  replaySavingEnabled: boolean | null;
}

/** Readiness is deliberately limited to filesystem access, not game integrity. */
export function checkSetupPath(value: unknown, kind: "folder" | "file"): SetupPathCheck {
  if (typeof value !== "string" || !value.trim())
    return { path: null, ready: false, message: "Choose a " + kind + " to check it." };
  if (!path.isAbsolute(value)) return { path: value, ready: false, message: "Choose an absolute path using Browse." };
  try {
    const stat = fs.statSync(value);
    if (kind === "folder" ? !stat.isDirectory() : !stat.isFile())
      return { path: value, ready: false, message: "This is not a " + kind + ". Choose another location." };
    fs.accessSync(value, fs.constants.R_OK);
    return { path: value, ready: true, message: kind === "folder" ? "Folder is readable." : "File is readable." };
  } catch {
    return { path: value, ready: false, message: "Cannot read this location. It may have moved, or need permission." };
  }
}
