#!/usr/bin/env node
// Cross-shell launcher for src/backfill-cli.ts.
//
// The backfill must run under Electron's Node (better-sqlite3 is electron-rebuilt),
// which needs ELECTRON_RUN_AS_NODE=1 in the environment. Setting that variable is
// shell-specific (cmd.exe, PowerShell and POSIX all differ), so `npm run backfill`
// goes through this script instead. Any extra arguments are forwarded to the CLI:
//   npm run backfill
//   npm run backfill -- --force
//   npm run backfill -- --limit 50
const { spawnSync } = require("child_process");
const path = require("path");

const electron = require("electron"); // resolves to the Electron binary path
const cli = path.join(__dirname, "..", "src", "backfill-cli.ts");

const result = spawnSync(electron, ["--require", "tsx/cjs", cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
