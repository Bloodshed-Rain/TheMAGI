// One-shot optimizer for character wireframe PNGs.
// Reads from site/*_wireframe.png, writes optimized files into
// src/renderer/assets/characters/<short-key>.png.
// Run manually: `node scripts/optimize-wireframes.mjs`
import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, "..", "site");
const OUT_DIR = join(__dirname, "..", "src", "renderer", "assets", "characters");

// short-key (filename without .png) -> source filename in site/
const MAP = {
  fox: "fox_wireframe.png",
  falco: "falco_wireframe.png",
  marth: "marth_dair_wireframe.png",
  sheik: "sheik_wireframe.png",
  falcon: "captain_falcon_wireframe.png",
  puff: "jigglypuff_wireframe.png",
  peach: "peach_wireframe.png",
  ics: "ice_climbers_wireframe.png",
  samus: "samus_wireframe.png",
  pikachu: "pikachu_wireframe.png",
  luigi: "luigi_wireframe.png",
  mario: "mario_wireframe.png",
  doc: "dr_mario_wireframe.png",
  yoshi: "yoshi_wireframe.png",
  ganon: "ganondorf_wireframe.png",
  link: "link_wireframe.png",
  ylink: "young_link_wireframe.png",
  zelda: "zelda_wireframe.png",
  roy: "roy_wireframe.png",
  mewtwo: "mewtwo_wireframe.png",
  gnw: "game_and_watch_wireframe.png",
  ness: "ness_wireframe.png",
  bowser: "bowser_wireframe.png",
  kirby: "kirby_wireframe.png",
  dk: "donkey_kong_wireframe.png",
  pichu: "pichu_wireframe.png",
};

await mkdir(OUT_DIR, { recursive: true });

let total = 0;
const results = [];
for (const [outName, srcName] of Object.entries(MAP)) {
  const srcPath = join(SRC_DIR, srcName);
  const outPath = join(OUT_DIR, `${outName}.png`);
  await sharp(srcPath)
    .trim()                                          // crop transparent borders
    .resize({ width: 800, withoutEnlargement: true })// shrink to max 800px wide
    .png({ compressionLevel: 9, palette: true, quality: 80, effort: 10 })
    .toFile(outPath);
  const { size } = await stat(outPath);
  total += size;
  results.push({ outName, kb: size / 1024 });
}

results.sort((a, b) => b.kb - a.kb);
for (const r of results) console.log(`${r.outName.padEnd(8)}  ${r.kb.toFixed(1)} KB`);
console.log("------------------------------");
console.log(`Total: ${(total / 1024 / 1024).toFixed(2)} MB across ${results.length} files`);
