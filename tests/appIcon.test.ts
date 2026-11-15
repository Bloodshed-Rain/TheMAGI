import fs from "fs";
import os from "os";
import path from "path";
import { APP_USER_MODEL_ID, repairDevShortcutIcons, type ShortcutShell } from "../src/main/appIcon";

const EXEC = "C:\\Users\\dev\\MAGI\\node_modules\\electron\\dist\\electron.exe";

type Link = ReturnType<ShortcutShell["readShortcutLink"]>;

describe("repairDevShortcutIcons", () => {
  let dir: string;
  let icon: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "magi-appicon-"));
    icon = path.join(dir, "icon.ico");
    fs.writeFileSync(icon, "");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  /** Creates one empty file per shortcut name and a fake shell that serves `links` by file name. */
  function setup(links: Record<string, Link | Error>) {
    const programs = path.join(dir, "Programs");
    fs.mkdirSync(programs);
    for (const name of Object.keys(links)) fs.writeFileSync(path.join(programs, name), "");
    const writes: { file: string; options: { target: string; icon: string; iconIndex: number } }[] = [];
    const shell: ShortcutShell = {
      readShortcutLink(file) {
        const link = links[path.basename(file)];
        if (!link || link instanceof Error) throw link ?? new Error("not a shortcut");
        return link;
      },
      writeShortcutLink(file, _operation, options) {
        writes.push({ file, options });
        return true;
      },
    };
    return { programs, shell, writes };
  }

  it("gives the icon to a shortcut that binds our app id to the running executable", () => {
    const { programs, shell, writes } = setup({
      "Electron.lnk": { target: EXEC, icon: "", appUserModelId: APP_USER_MODEL_ID },
    });
    const repaired = repairDevShortcutIcons(shell, programs, EXEC, icon);
    expect(repaired).toEqual([path.join(programs, "Electron.lnk")]);
    expect(writes).toEqual([
      { file: path.join(programs, "Electron.lnk"), options: { target: EXEC, icon, iconIndex: 0 } },
    ]);
  });

  it("matches the executable path regardless of case and slash direction", () => {
    const { programs, shell, writes } = setup({
      "Electron.lnk": { target: EXEC.toUpperCase().replace(/\\/g, "/"), appUserModelId: APP_USER_MODEL_ID },
    });
    expect(repairDevShortcutIcons(shell, programs, EXEC, icon)).toHaveLength(1);
    expect(writes).toHaveLength(1);
  });

  it("leaves shortcuts that are not this dev executable's own", () => {
    const { programs, shell, writes } = setup({
      // The installed app shares the app id but targets its own exe (icon embedded there).
      "MAGI.lnk": { target: "C:\\Program Files\\MAGI\\MAGI.exe", icon: "", appUserModelId: APP_USER_MODEL_ID },
      // Same executable, but registered under a different app id.
      "Other.lnk": { target: EXEC, icon: "", appUserModelId: "com.example.other" },
      // A plain pin of electron.exe with no app id.
      "Pinned.lnk": { target: EXEC, icon: "" },
      "Broken.lnk": new Error("unreadable"),
      "notes.txt": { target: EXEC, icon: "", appUserModelId: APP_USER_MODEL_ID },
    });
    expect(repairDevShortcutIcons(shell, programs, EXEC, icon)).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("does not rewrite a shortcut that already has the icon", () => {
    const { programs, shell, writes } = setup({
      "Electron.lnk": { target: EXEC, icon: icon.toUpperCase(), appUserModelId: APP_USER_MODEL_ID },
    });
    expect(repairDevShortcutIcons(shell, programs, EXEC, icon)).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("does nothing when the icon file or the Start Menu folder is missing", () => {
    const { programs, shell, writes } = setup({
      "Electron.lnk": { target: EXEC, icon: "", appUserModelId: APP_USER_MODEL_ID },
    });
    expect(repairDevShortcutIcons(shell, programs, EXEC, path.join(dir, "missing.ico"))).toEqual([]);
    expect(repairDevShortcutIcons(shell, path.join(dir, "no-such-folder"), EXEC, icon)).toEqual([]);
    expect(writes).toEqual([]);
  });
});
