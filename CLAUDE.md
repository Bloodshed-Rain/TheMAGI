# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MAGI (Melee Analysis through Generative Intelligence) is an Electron + React desktop app that analyzes Super Smash Bros. Melee replays (.slp files via slippi-js) and generates AI coaching feedback via LLM providers.

## Commands

- **Install**: `npm ci` then `npx electron-rebuild` (rebuilds `better-sqlite3` and `koffi` against the Electron ABI — required before `npm run dev` will boot)
- **Dev mode**: `npm run dev` — runs `scripts/dev.js`: compiles main/preload via `tsc -p tsconfig.main.json`, starts the Vite renderer server, then spawns Electron with `VITE_DEV_SERVER_URL` set. Also auto-loads `key.env` into `process.env`.
- **Build**: `npm run build` — compiles main process TS, builds renderer via Vite, packages with electron-builder
- **Platform builds**: `npm run build:linux`, `build:win`, `build:mac`
- **Run pipeline CLI**: `npx tsx src/pipeline-cli.ts <file.slp> [--target player] [--json]`
- **Run import CLI**: `npx tsx src/import-cli.ts <folder> [--target player]` (bulk-imports a folder into the local DB)
- **Backfill per-instance events**: `ELECTRON_RUN_AS_NODE=1 npx electron --require tsx/cjs src/backfill-cli.ts [--force] [--limit N]` — re-parses already-imported replays to fill the v10-v14 event tables. Must run through Electron's node when better-sqlite3 is electron-rebuilt (plain `npx tsx` hits a NODE_MODULE_VERSION error); the CLI prints this hint on failure. Idempotent per game (delete + reinsert in one transaction); re-hashes files so moved/replaced replays are skipped, never misattributed.
- **Type-check main process**: `npx tsc -p tsconfig.main.json --noEmit`
- **Run tests**: `npm test` — runs Vitest once over `tests/**/*.test.ts`
- **Single test file**: `npx vitest run tests/pipeline.test.ts` (or pass a name pattern: `npx vitest run -t "neutral win rate"`)
- **Watch tests**: `npm run test:watch`
- **Lint / format**: `npm run lint` (ESLint), `npm run lint:fix`, `npm run format` (Prettier write), `npm run format:check`

## Architecture

### Process Model (Electron)

Three processes communicate via IPC:

- **Entry** (`src/main/entry.js`): Tiny CommonJS shim that Electron actually launches (per `package.json` `"main"`). In dev (`VITE_DEV_SERVER_URL` set) it requires `tsx/cjs` and loads `index.ts` for live TS; in production it loads the precompiled `dist/main/main/index.js`. **Do not move or rename this file** — it's the dev/prod fork point.
- **Main** (`src/main/index.ts`): Electron main process. IPC channels are registered through `src/main/ipc.ts`, with handlers split across `src/main/handlers/` (analysis, stats, llm, config, import, watcher, dolphin, dialog, stockTimeline, embeddedReplay). Shared state in `src/main/state.ts`.
- **Native** (`src/main/native/win32Embed.ts`): Windows-only FFI via `koffi` to user32/dwmapi for embedding Dolphin's window into a BrowserView region (used by `embeddedReplay` handler). Guard all calls with `process.platform === "win32"` — there is no macOS/Linux equivalent.
- **Preload** (`src/preload/index.ts`): Bridges main↔renderer via `contextBridge`. Exposes `window.clippi` with typed IPC invoke wrappers. The renderer accesses **only** what's exposed here — adding a new IPC channel requires touching the handler, `ipc.ts`, the preload bridge, and `src/renderer/global.d.ts` together.
- **Renderer** (`src/renderer/`): React 19 SPA built with Vite. Pages in `src/renderer/pages/`, components in `src/renderer/components/`. Uses `react-router-dom` v7 for routing, Zustand stores in `src/renderer/stores/` (`useGlobalStore`, `useReplayPlayerStore`) for cross-page state, and `@tanstack/react-query` for IPC-backed async data.

### Data Pipeline

`src/pipeline/` is the core analysis engine (barrel-exported via `index.ts`):
- `types.ts`: All interfaces (`GameSummary`, `PlayerSummary`, `DerivedInsights`, signature stats)
- `helpers.ts`: Shared utilities (frame conversion, action state classifiers, stage bounds + `STAGE_LEDGE_X`, move ID mapping)
- `frameEvents.ts`: Per-instance event extraction (shared detector pass) — conversion/stock records, situational habit choices (knockdown/ledge/OOS with percent/corner/pressure conditions + punished flags), attack instances with measured endlag, neutral segments. Single source of truth for situation detection; `derivedInsights` habit profiles aggregate from here. Events are persisted per-game into the `conversions`/`stock_deaths`/`habit_instances` tables (schema v10).
- `measuredDI.ts`: Stick-input DI measurement (no proxy) — per-death verdicts (NO_DI/WRONG_DI/OK_DI/GOOD_DI/SD) scored against the observed launch perpendicular, resource-fault flags (died offstage with double jump unspent), and victim-side throw-DI records (sector normalized by thrower facing). Merged into `frameEvents` stock records + `throwDI`; persisted via schema v11 (`stock_deaths` DI columns + `throw_di` table); surfaced in death keyMoments and a "Measured DI" prompt section.
- `recoveryEvents.ts`: Recovery spans + edgeguard commitment (schema v12 `recovery_spans`) — per-span route (high/mid/low), DJ-burn timing, up-B delay, landing outcome, crossed with the edgeguarder's deepest commitment (onstage/ledge/shallow/deep), invincible ledge-holds, and contested/hit flags. Both players' spans recorded (opponent spans = your edgeguard opportunities). Depth×kill numbers are descriptive, not causal — always surface sample counts. Cliff states never open a span (ledge hangs are the habit ledger's domain). Legacy recovery/edgeguard counters in `playerSummary.ts` remain until a refactor; new consumers read spans.
- `shieldEvents.ts`: Shield frame-gap audit (schema v13 `shield_blocks`) — per blocked hit: measured frame gap (attacker's endlag end from the attack-instance tagger vs defender's shieldstun exit), grab-range gate, OOS choice, and a grade (punish-taken/punish-missed/unsafe-challenge/correct-hold/neutral; mid-string blocks = "pressured"). A defender's rows double as the attacker's pressure-quality data. When an attack instance's endlag never resolved (attacker rolled into another commitment — Falco pillar shine, Peach float), attacker-actionable falls back to the next commitment start via `resolveCommitmentEnd`. Guaranteed-punish grading requires gap ≥ 8 AND in-range AND attacker grounded (keeps laser/retreat blocks from false "missed guaranteed" claims).
- `whiffEvents.ts`: Whiff-punish ledger (schema v14 `whiff_events`) — the opportunity denominator: every unconnected attack instance outside conversion windows and onstage, with min distance / observer actionability / punishable-frames gates deciding `opportunity`, plus `punished` and reaction delay. Opponent whiffs = your capture rate; own whiffs = exposure. Combo-filler whiffs (inside conversion windows) and offstage recovery specials are excluded by design.
- `frameData.ts`: Static frame data (jumpsquat, grab startup) + wrappers for slippi-js's `framedata.getAerialFrameData` (real landing lag/autocancel windows, keyed by INTERNAL character id) and `animations.getDeathDirection` — both verified to exist; use them instead of hand-authoring tables.
- `processGame.ts`: Main orchestrator — parses .slp via `SlippiGame`, returns `GameResult`
- `playerSummary.ts`: Builds per-player stats (neutral, conversions, movement, recovery, edgeguards)
- `signatureStats.ts`: Character-specific stat detection (26 characters)
- `derivedInsights.ts`: Habit profiles, key moments, performance by stock
- `adaptation.ts`: Cross-game adaptation signals for multi-game sets
- `highlights.ts`: Detects notable moments (zero-to-deaths, spike kills, high-damage, 4-stocks, JV5/JV4)
- `characterData.ts`: Character metadata
- `prompt.ts`: `SYSTEM_PROMPT`, `SYSTEM_PROMPT_AGGREGATE`, `SYSTEM_PROMPT_DISCOVERY` + `assembleUserPrompt`, `assembleAggregatePrompt`, `assembleDiscoveryPrompt`, `assemblePlayerContext`

### Supporting Modules

- `src/llm.ts`: Multi-provider LLM abstraction (OpenRouter, Gemini, Anthropic, OpenAI, local). All share: system prompt + user prompt → text. Streaming variants emit incremental chunks back to the renderer over IPC.
- `src/llmProviders.ts`: Provider metadata (display names, default models, model-list endpoints). When adding a provider, both files must be updated together; the renderer's Settings page reads from this.
- `src/llmQueue.ts`: Queued LLM calls to prevent concurrent overload, with 429 backoff.
- `src/db.ts`: SQLite via better-sqlite3. Data dir: `~/.magi-melee/`, DB file: `magi.db`. Tables: `player_profile`, `sessions`, `games`, `game_stats`, `coaching_analyses`, `character_signature_stats`, `highlights`, `schema_version`. Migrations are forward-only and gated by `schema_version`; add a new migration rather than mutating existing ones.
- `src/config.ts`: JSON config at `~/.magi-melee/config.json`. Stores target player, API keys, replay folder, theme.
- `src/importer.ts` / `src/import-cli.ts`: Bulk imports replay folders, hashes files for SHA-256 dedup, inserts into DB, optionally triggers LLM analysis. CLI is a thin wrapper around the same engine the IPC import handler uses.
- `src/replayAnalyzer.ts`: Single-replay analysis with DB caching (hash-based dedup, skips LLM if cached).
- `src/watcher.ts`: chokidar file watcher for live replay folder monitoring.
- `src/detect-sets.ts`: Groups replays into tournament-style sets by player matchup and time proximity (15-minute window).
- `src/parsePool.ts` / `src/parseWorker.ts`: Worker-based parallel .slp parsing. Workers run in Node `worker_threads`; bumping pool size affects import throughput vs. memory.
- `src/player-profile.ts`: Standalone CLI (`npx tsx src/player-profile.ts <tag>`) — archetype detection and radar stats. Not imported by the app.
- `src/stats.ts`: Standalone CLI (`npx tsx src/stats.ts <overview|sets|analysis>`) that prints DB stats. Not imported by the app.
- `src/setup.ts`: Standalone first-run setup CLI (`npx tsx src/setup.ts --tag ... --folder ...`). `watcher.ts` and `pipeline-cli.ts` point users here in their error messages.
- `src/mcp-server.ts`: Model Context Protocol server exposing replay/coaching data to external MCP clients via `@modelcontextprotocol/sdk`. Not started by the Electron app by default — runnable standalone for integrations.

### Renderer Pages

`Dashboard`, `Sessions`, `Library` (history + filters, with `pages/library/` subviews), `Trends`, `Characters`, `Oracle` (persistent chat with recent-games context), `Practice` (LLM-generated drill plans), `Rivals` (opponent dossiers), `GameTheater` (replay viewer), `Cornerman` (live coaching history; live delivery also runs in Play Mode panels), `Settings`, `SetupWizard`, `PlayMode` — each in `src/renderer/pages/`.

Key components in `src/renderer/components/`:
- `LiquidShell.tsx`: App chrome / navigation for analysis pages, with a featured Play Mode entry; theme state is applied in App.tsx
- `CoachingCards.tsx`: Parsed markdown coaching display with collapsible sections, section icons, timestamp links
- `CoachingModal.tsx`: Full-page coaching modal with LLM streaming, scope info
- `ReplayPlayer.tsx` (+ `useReplayPlayerStore`, `styles/replay-player.css`): Embedded Dolphin playback surface (uses `embeddedReplay` IPC + `win32Embed` on Windows)
- `RadarChart.tsx`: 6-axis player radar (neutral, conversion, L-cancel, recovery, edgeguard, DI)
- `CommandPalette.tsx`: Ctrl+K quick navigation and import
- `StockTimeline.tsx`: Visual stock progression timeline
- `TweaksPanel.tsx`: Live developer/user tweak panel
- `ErrorBoundary.tsx`, `NavIcons.tsx`, plus shared primitives in `components/ui/`

## TypeScript Configuration

- **CommonJS project** (`"type": "commonjs"` in package.json)
- `"module": "nodenext"`, `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`
- Main/preload compiled via `tsconfig.main.json` (extends base, outputs to `dist/main/`)
- Renderer excluded from main tsconfig; built by Vite with `@vitejs/plugin-react`
- Use `@slippi/slippi-js/node` entry point (not the default export)

## Critical: slippi-js Conversion Semantics

- `conversion.playerIndex` = the **victim** (player who received damage), NOT the attacker
- `conversion.moves[].playerIndex` = the attacker
- To get "conversions I landed": filter where `c.playerIndex === opponentIndex`
- `overall.openingsPerKill`: `count` = openings, `total` = kills
- `overall.damagePerOpening`: `count` = total damage, `total` = openings

## Adding a new IPC channel

A single IPC channel touches four files; missing any one of them produces silent failures:

1. Implement the handler in `src/main/handlers/<area>.ts`
2. Register it on `ipcMain` in `src/main/ipc.ts`
3. Expose it on `window.clippi` in `src/preload/index.ts`
4. Type it on the `Window` interface in `src/renderer/global.d.ts`

The renderer can only see what `preload/index.ts` exposes — adding the handler alone won't reach the UI.

## Tests

Vitest with global APIs enabled, looking at `tests/**/*.test.ts`. Existing suites cover: pipeline math (`pipeline.test.ts`), config IO (`config.test.ts`), DB schema/queries (`db.test.ts`), importer dedup (`importer.test.ts`), library filters (`libraryFilter.test.ts`), sparkline rendering (`sparkline.test.ts`), themes (`themes.test.ts`), and the global Zustand store (`useGlobalStore.test.ts`). Add tests when changing parsing, importer, DB, config, pipeline, or store behavior.

## Environment

- API keys loaded from `key.env` at project root (dev — `scripts/dev.js` injects them into `process.env`) or app resources (prod) — never commit this file. The renderer never sees raw keys; it calls main-process IPC which holds them.
- Config and DB live in `~/.magi-melee/`
- Test replays in `test-replays/`
- ESLint + Prettier are configured at the repo root; Prettier defaults are 2-space indent, semicolons, double quotes, trailing commas, `printWidth: 120`.

### First-run setup

`SetupWizard.tsx` at `#/setup` saves only its own profile/path fields and onboarding progress. `setupOnboarding.ts` decides whether a fresh installation needs the guide; existing profiles are preserved. `setupStatus.ts` checks filesystem access in the main process through `handlers/setup.ts`. Keep filesystem imports out of the renderer. Setup is optional and can be reopened from Settings. File checks do not establish game-image compatibility or AI availability.

Appearance options are Liquid, Telemetry, Tournament, and Light. Removed CRT/Amber IDs fall back to Liquid.

## Mandatory Melee technical accuracy rule

This rule applies to the assistant's reasoning, explanations, recommendations, research, code, UI, statistics, detectors, highlights, replay clips, and AI coaching: NEVER sacrifice Melee technical accuracy for simpler wording or a convenient implementation. It covers ALL Melee mechanics, characters, moves, inputs, timing, hitboxes, combos, recovery, DI/SDI, movement, matchups, and terminology, not only named combos.

- Verify uncertain mechanics against primary evidence (game/frame data, replay inputs, maintained Slippi source, or documented tests). Research deeply when necessary. State uncertainty instead of guessing.
- Preserve exact move order, timing, input, character, and kill requirements. Do not infer a mechanic from a looser hit sequence or substitute one technical term for another.
- A detector may display a named technique as confirmed only when its evidence establishes every required condition. Otherwise describe exactly the observed sequence, or explicitly mark it unverified. An approximation is not a confirmed technique.
- Make definitions consistent across parsing, stored historical data, live alerts, search, counts, clips, labels, and coaching prompts. Add positive and negative regression tests before claiming a detector is corrected.
- Project Ken Combo rule, explicitly required by the user: the finishing sequence must be FAIR → FAIR → DAIR, and that final DAIR must take the stock. A nonlethal sequence, a single FAIR → DAIR, a different finishing move, or a different move inserted in the finishing sequence does NOT count. There is one Ken Combo stat; do not create a separate "Ken Combo Kills" category.
- Plain-language explanations may clarify technical terms; they must never change the technical meaning. Discuss uncertain or disputed definitions explicitly instead of silently broadening them.

### Play Mode presentation

Fullscreen shows configured information in the unused side space around the largest 4:3 game. `playGameOnlyLayout.ts` computes those bars independently of panel visibility. `playLayout.gameOnlyPanelMode` defaults to visible; auto-hide and narrow-screen fallback reuse edge reveal. Game paths and the Cornerman enable switch live in Settings → Play Mode settings. The main renderer's `useCornermanCoach` owns card delivery, live alerts, and voice across routes. There is no separate Cornerman window or overlay IPC.
