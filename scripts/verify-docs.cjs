const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const files = ["README.md", "CHANGELOG.md", "CONTRIBUTING.md"];
for (const name of fs.readdirSync(path.join(root, "docs"))) {
  if (name.endsWith(".md")) files.push(`docs/${name}`);
}
const errors = [];
let checked = 0;
const read = (file) => fs.readFileSync(file, "utf8");
const anchors = (text, html) => {
  if (html) return new Set([...text.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const seen = new Map();
  return new Set([...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => {
    const base = match[1].toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/ /g, "-");
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  }));
};
function check(file, target) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) return;
  const [urlPath, fragment] = target.split("#");
  let resolved;
  try {
    resolved = path.resolve(root, path.dirname(file), decodeURIComponent(urlPath.split("?")[0]));
  } catch {
    errors.push(`${file}: invalid link encoding`);
    return;
  }
  if (!urlPath) resolved = path.join(root, file);
  checked++;
  if (!fs.existsSync(resolved)) {
    errors.push(`${file}: missing ${target}`);
    return;
  }
  if (fragment && /\.(?:md|html)$/.test(resolved)) {
    if (!anchors(read(resolved), resolved.endsWith(".html")).has(decodeURIComponent(fragment))) {
      errors.push(`${file}: missing anchor ${target}`);
    }
  }
}
for (const file of files) {
  for (const match of read(path.join(root, file)).matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    check(file, match[1]);
  }
}
const site = read(path.join(root, "site/index.html"));
for (const match of site.matchAll(/\b(?:src|href)="([^"{}]+)"/g)) check("site/index.html", match[1]);
for (const match of site.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  try { new Function(match[1]); } catch (error) { errors.push(`site/index.html: ${error.message}`); }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Checked ${checked} local links and assets, Markdown/HTML anchors, and website inline JavaScript.`);
}
