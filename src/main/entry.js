// Main process entry point
// In dev: use tsx for live TypeScript
// In production: use pre-compiled JS from dist/main

const path = require("path");

if (process.env.VITE_DEV_SERVER_URL) {
  // Dev mode — use tsx runtime transpilation
  require("tsx/cjs");
  require("./index.ts");
} else {
  // Production — use compiled JS
  require(path.join(__dirname, "../../dist/main/main/index.js"));
}
