import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { GameCubeController } from "../src/renderer/components/controller/GameCubeController";

async function main() {
  const out = path.resolve("docs/controller-overlay");
  await mkdir(out, { recursive: true });
  for (const [name, color] of [
    ["themagi-gamecube", "#e8e9ec"],
    ["themagi-gamecube-dark-ink", "#26282d"],
  ]) {
    const svg = renderToStaticMarkup(createElement(GameCubeController, { color }));
    await writeFile(path.join(out, `${name}.svg`), `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);
  }
  const bundle = await build({
    entryPoints: ["src/renderer/controller-preview.tsx"],
    bundle: true,
    minify: true,
    write: false,
    outfile: "preview.js",
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    legalComments: "inline",
  });
  const js = bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  const css = bundle.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
  await writeFile(
    path.join(out, "preview.html"),
    `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TheMAGI · Controller studio</title><style>${css}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  );
  console.log(`Exported two transparent SVGs and a self-contained preview to ${out}`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
