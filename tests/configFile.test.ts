import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { writeConfigFile } from "../src/configFile";

let directory: string;
let destination: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "magi-config-atomic-"));
  destination = path.join(directory, "config.json");
  fs.writeFileSync(destination, JSON.stringify({ notes: "previous draft" }));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});
describe("atomic configuration persistence", () => {
  it("replaces a complete configuration and leaves no temporary file", () => {
    writeConfigFile(destination, { notes: "new draft", layout: { left: 250 } });
    expect(JSON.parse(fs.readFileSync(destination, "utf8"))).toEqual({ notes: "new draft", layout: { left: 250 } });
    expect(fs.readdirSync(directory)).toEqual(["config.json"]);
  });
  it("keeps the old settings intact if replacement fails", () => {
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("File busy");
    });
    expect(() => writeConfigFile(destination, { notes: "new" })).toThrow("File busy");
    expect(JSON.parse(fs.readFileSync(destination, "utf8"))).toEqual({ notes: "previous draft" });
    expect(fs.readdirSync(directory)).toEqual(["config.json"]);
  });
  it("removes an interrupted partial write while preserving the previous configuration", () => {
    const write = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce((file) => {
      write(file, "{partial");
      throw new Error("Disk full");
    });
    expect(() => writeConfigFile(destination, { notes: "new" })).toThrow("Disk full");
    expect(JSON.parse(fs.readFileSync(destination, "utf8"))).toEqual({ notes: "previous draft" });
    expect(fs.readdirSync(directory)).toEqual(["config.json"]);
  });
});
