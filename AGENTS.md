# Repository Guidelines

## Project Structure & Module Organization
`src/main/` contains Electron main-process code and IPC handlers, `src/preload/` exposes the bridge API, and `src/renderer/` holds the Vite + React UI (`pages/`, `components/`, `styles/`, `assets/`). Core replay parsing, stats, and import logic live in top-level `src/` modules plus `src/pipeline/`. Tests live in `tests/*.test.ts`. Static marketing assets are under `site/`, screenshots under `screenshots/`, and character art in `CharacterCards/`.

## Build, Test, and Development Commands
Use Node.js `^20.19.0` or `>=22.12.0` (CI uses Node.js 22) and install with `npm ci`.

- `npm run dev` starts the Vite renderer, compiles main/preload TS, and launches Electron.
- `npm run build` creates a packaged app in `release/`; use `build:win`, `build:mac`, or `build:linux` for platform-specific builds.
- `npm test` runs the Vitest suite once; `npm run test:watch` keeps tests running during development.
- `npm run lint` checks `src/` with ESLint; `npm run lint:fix` applies safe fixes.
- `npm run format` and `npm run format:check` run Prettier on `src/**/*.{ts,tsx}`.

Create `key.env` from `.env.example` when working with AI features or packaging.

## Coding Style & Naming Conventions
TypeScript is `strict` and React uses function components. Follow Prettier defaults in this repo: 2-space indentation, semicolons, double quotes, trailing commas, and `printWidth: 120`. Use `PascalCase` for React components and page files (`Dashboard.tsx`), `camelCase` for utilities (`playerSummary.ts`), and keep test files in `name.test.ts` form. Prefer small modules near their owning layer instead of cross-cutting helpers.

## Testing Guidelines
Vitest looks for `tests/**/*.test.ts` with global APIs enabled. Add or update tests when changing parsing, importer, DB, config, or pipeline behavior. There is no enforced coverage threshold, so contributors should cover new branches and regression-prone paths explicitly. Run `npm test` before opening a PR.

## Commit & Pull Request Guidelines
Recent history uses short imperative subjects such as `Fix Dolphin playback...` and `Update landing page...`. Keep commit messages concise, capitalized, and focused on one change. PRs should include a clear summary, testing notes, linked issues when relevant, and screenshots/GIFs for UI changes in `src/renderer/` or `site/`.

## Security & Configuration Tips
Do not commit `key.env`, API keys, or local replay data. Keep secrets in local env files, and use `.env.example` as the template for new configuration fields.

## Mandatory Melee technical accuracy rule

This rule applies to the assistant's reasoning, explanations, recommendations, research, code, UI, statistics, detectors, highlights, replay clips, and AI coaching: NEVER sacrifice Melee technical accuracy for simpler wording or a convenient implementation. It covers ALL Melee mechanics, characters, moves, inputs, timing, hitboxes, combos, recovery, DI/SDI, movement, matchups, and terminology, not only named combos.

- Verify uncertain mechanics against primary evidence (game/frame data, replay inputs, maintained Slippi source, or documented tests). Research deeply when necessary. State uncertainty instead of guessing.
- Preserve exact move order, timing, input, character, and kill requirements. Do not infer a mechanic from a looser hit sequence or substitute one technical term for another.
- A detector may display a named technique as confirmed only when its evidence establishes every required condition. Otherwise describe exactly the observed sequence, or explicitly mark it unverified. An approximation is not a confirmed technique.
- Make definitions consistent across parsing, stored historical data, live alerts, search, counts, clips, labels, and coaching prompts. Add positive and negative regression tests before claiming a detector is corrected.
- Project Ken Combo rule, explicitly required by the user: the finishing sequence must be FAIR → FAIR → DAIR, and that final DAIR must take the stock. A nonlethal sequence, a single FAIR → DAIR, a different finishing move, or a different move inserted in the finishing sequence does NOT count. There is one Ken Combo stat; do not create a separate "Ken Combo Kills" category.
- Plain-language explanations may clarify technical terms; they must never change the technical meaning. Discuss uncertain or disputed definitions explicitly instead of silently broadening them.

## Release version discipline

Before producing a distributable for meaningful user-facing changes, select the appropriate new semantic version and update both `package.json` and the root/package entries in `package-lock.json`. Update `CHANGELOG.md`, then verify the packaged app version, displayed Settings version, executable metadata, and installer/portable filenames all agree. Do not label substantially changed release builds with the previous release's version. Building a local artifact does not authorize publishing it or creating a release tag.
