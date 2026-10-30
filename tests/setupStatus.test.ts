import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { checkSetupPath } from "../src/setupStatus";
import { shouldOfferSetup } from "../src/setupOnboarding";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
describe("setup readiness", () => {
  it("offers onboarding only to fresh installations", () => {
    expect(shouldOfferSetup({})).toBe(true);
    for (const config of [
      { setupCompletedAt: "2026-01-01" },
      { setupDeferred: true },
      { connectCode: "FOX#123" },
      { targetPlayer: "Fox" },
      { replayFolder: "/replays" },
    ])
      expect(shouldOfferSetup(config)).toBe(false);
  });
  it("distinguishes readable folders, files, missing paths and wrong kinds", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "magi-setup-"));
    directories.push(dir);
    const file = path.join(dir, "game.iso");
    fs.writeFileSync(file, "fixture");
    expect(checkSetupPath(dir, "folder").ready).toBe(true);
    expect(checkSetupPath(file, "file").ready).toBe(true);
    expect(checkSetupPath(file, "folder").ready).toBe(false);
    expect(checkSetupPath(dir, "file").ready).toBe(false);
    expect(checkSetupPath(path.join(dir, "missing"), "file").ready).toBe(false);
  });
  it("handles unset, invalid and relative selections without throwing", () => {
    for (const input of [null, undefined, "", "   ", 123, "relative/file"])
      expect(checkSetupPath(input, "file").ready).toBe(false);
  });
});
