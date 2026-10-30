// Check source metadata only. Packaged artifacts still need the release review
// described in docs/DEVELOPMENT.md before distribution.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const version = pkg.version;

assert.match(version, /^\d+\.\d+\.\d+$/, "Use a stable semantic version for this source candidate.");
assert.equal(lock.version, version, "package-lock root version differs from package.json");
assert.equal(lock.packages[""].version, version, "package-lock package version differs from package.json");
assert.ok(read("README.md").includes(`Source version **${version}**`), "README source version differs");
assert.ok(read("docs/USER_GUIDE.md").includes(`source version **${version}**`), "User-guide source version differs");
assert.ok(read("site/index.html").includes(`feature tour reflects MAGI ${version}.`), "Website tour version differs");
assert.ok(read("CHANGELOG.md").startsWith(`# Release notes\n\n## ${version} —`), "Current changelog entry differs");
const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : null;
if (tag) {
  assert.equal(tag, `v${version}`, "Release tag differs from package.json");
  assert.ok(!read("CHANGELOG.md").startsWith(`# Release notes\n\n## ${version} — Unreleased`), "Release is still marked unreleased");
  assert.ok(read(`docs/releases/${tag}.md`).startsWith(`# MAGI ${version}\n`), "Release notes are missing or have the wrong version");
}

console.log(`Source version metadata agrees on ${version}. Packaged artifacts have not been checked.`);
