const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const asar = require("@electron/asar");
const version = require("../package.json").version;
const directory = path.resolve(process.argv[2] || "release");
const packages = [];
function walk(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isFile() && entry.name === "app.asar") packages.push(file);
    else if (entry.isDirectory() && !entry.name.endsWith(".asar.unpacked")) walk(file);
  }
}
walk(directory);
assert.ok(packages.length, "No packaged app.asar found");
for (const file of packages) {
  const manifest = JSON.parse(asar.extractFile(file, "package.json").toString());
  assert.equal(manifest.version, version, `Packaged version differs: ${file}`);
  const entries = asar.listPackage(file).map((name) => name.replace(/\\/g, "/"));
  assert.ok(!entries.some((name) => /\/(?:overlayWindow|overlayLayout)\.js$|\/CornermanOverlay[^/]*\.(?:js|css)$/.test(name)), "Legacy popup code found in package");
  assert.ok(!entries.some((name) => /\/(?:key\.env|build\.env|chatgpt-auth\.enc)$/.test(name)), "Local credentials found in package");
  assert.ok(entries.includes("/dist/main/main/handlers/play.js"), "Play Mode handler missing");
  assert.ok(entries.includes("/dist/main/main/handlers/chatgpt.js"), "ChatGPT handler missing");
}
const assets = fs.readdirSync(directory).filter((name) => /\.(?:exe|dmg|AppImage|deb)$/.test(name));
assert.ok(assets.length, "No distributable packages found");
for (const name of assets) assert.ok(name.startsWith(`MAGI-${version}.`) || name.startsWith(`MAGI-${version}-`) || name.startsWith(`MAGI-Setup-${version}.`), `Unexpected artifact version: ${name}`);
for (const name of fs.readdirSync(directory).filter((name) => /^latest.*\.yml$/.test(name))) {
  const metadata = fs.readFileSync(path.join(directory, name), "utf8");
  assert.ok(metadata.includes(`version: ${version}`), `Update metadata differs: ${name}`);
}
console.log(`Verified ${packages.length} packaged app(s) and ${assets.length} distributable(s) at ${version}; no legacy popup code or credential files bundled.`);
