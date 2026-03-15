// Dev script: starts Vite dev server, then launches Electron pointing at it.
const { spawn } = require("child_process");
const { createServer } = require("vite");
const path = require("path");
const fs = require("fs");

// Load .env file if it exists
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

async function main() {
  // Start Vite dev server
  const vite = await createServer({
    configFile: path.resolve(__dirname, "../vite.config.ts"),
  });
  await vite.listen();
  const url = vite.resolvedUrls?.local?.[0] ?? "http://localhost:5173";
  console.log(`Vite dev server: ${url}`);

  // Compile main + preload with tsx, then start Electron
  const electron = spawn(
    path.resolve(__dirname, "../node_modules/.bin/electron"),
    ["."],
    {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: url,
      },
      stdio: "inherit",
    },
  );

  electron.on("close", () => {
    vite.close();
    process.exit();
  });

  process.on("SIGINT", () => {
    electron.kill();
    vite.close();
    process.exit();
  });
}

main().catch(console.error);
