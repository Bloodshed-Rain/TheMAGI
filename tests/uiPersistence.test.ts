import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

it("paginates complete training history, includes old sessions, and persists practice baselines", () => {
  const require = createRequire(import.meta.url);
  const result = spawnSync(require("electron"), ["tests/helpers/uiPersistence.cjs"], {
    cwd: path.resolve(__dirname, ".."), env: {...process.env, ELECTRON_RUN_AS_NODE:"1"}, encoding:"utf8", timeout:20000, windowsHide:true,
  });
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(0);
  expect(result.stdout).toContain("Persistence checks passed");
}, 25000);
