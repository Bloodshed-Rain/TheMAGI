import fs from "fs";
import path from "path";

export const APP_USER_MODEL_ID = "com.magi-melee.app";

export function resolveAppIconPath(): string {
  const extension = process.platform === "win32" ? "ico" : "png";
  const rootLogo = extension === "ico" ? "magilogo2.ico" : "magilogo2-preview.png";
  const candidates = [
    path.resolve(process.resourcesPath ?? "", `icon.${extension}`),
    path.resolve(__dirname, `../../build/icon.${extension}`),
    path.resolve(process.cwd(), `build/icon.${extension}`),
    path.resolve(process.cwd(), rootLogo),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[candidates.length - 1]!;
}

/** The subset of Electron's `shell` this module needs; injected so the repair is testable. */
export interface ShortcutShell {
  readShortcutLink(file: string): { target: string; icon?: string; appUserModelId?: string };
  writeShortcutLink(
    file: string,
    operation: "update",
    options: { target: string; icon: string; iconIndex: number },
  ): boolean;
}

const sameWindowsPath = (a: string, b: string): boolean =>
  path.win32.normalize(a).toLowerCase() === path.win32.normalize(b).toLowerCase();

/**
 * Give MAGI's own Start Menu shortcuts the MAGI icon. Windows-only, for unpackaged runs.
 *
 * Electron registers toast notifications through a Start Menu shortcut for the running
 * executable, stamped with our AppUserModelID. Once the shell has indexed such a shortcut
 * it takes the taskbar icon from THAT shortcut and ignores the window's icon. In dev the
 * executable is electron.exe and the shortcut has no icon of its own, so the taskbar
 * showed Electron's default icon. Packaged builds are unaffected: their shortcut targets
 * MAGI.exe, which has the icon embedded.
 *
 * Only shortcuts that target this executable AND carry our AppUserModelID are touched.
 * The shell applies the new icon the next time the app starts. Returns the files changed.
 */
export function repairDevShortcutIcons(
  shell: ShortcutShell,
  programsDir: string,
  execPath: string,
  iconPath: string,
): string[] {
  if (!fs.existsSync(iconPath)) return [];
  let names: string[];
  try {
    names = fs.readdirSync(programsDir);
  } catch {
    return [];
  }
  const repaired: string[] = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".lnk")) continue;
    const file = path.join(programsDir, name);
    try {
      const link = shell.readShortcutLink(file);
      if (link.appUserModelId !== APP_USER_MODEL_ID || !sameWindowsPath(link.target, execPath)) continue;
      if (link.icon && sameWindowsPath(link.icon, iconPath)) continue;
      if (shell.writeShortcutLink(file, "update", { target: link.target, icon: iconPath, iconIndex: 0 })) {
        repaired.push(file);
      }
    } catch {
      // Unreadable or foreign shortcut — never ours to change.
    }
  }
  return repaired;
}
