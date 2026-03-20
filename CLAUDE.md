# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MAGI (Melee Analysis through Generative Intelligence) is an Electron + React desktop app that analyzes Super Smash Bros. Melee replays (.slp files via slippi-js) and generates AI coaching feedback via LLM providers.

## Commands

- **Dev mode**: `npm run dev` — starts Vite dev server + Electron concurrently
- **Build**: `npm run build` — compiles main process TS, builds renderer via Vite, packages with electron-builder
- **Platform builds**: `npm run build:linux`, `build:win`, `build:mac`
- **Run pipeline CLI**: `npx tsx src/pipeline.ts <file.slp> [--target player] [--json]`
- **Type-check main process**: `npx tsc -p tsconfig.main.json --noEmit`
- **Run tests**: `npm test` — runs vitest (pipeline, config, db, importer tests)
- **Watch tests**: `npm run test:watch` — vitest in watch mode

## Architecture

### Process Model (Electron)

Three processes communicate via IPC:

- **Main** (`src/main/index.ts`): Electron main process. Handles all IPC handlers (`ipcMain.handle`), orchestrates pipeline/LLM calls, manages file watcher, reads/writes config and DB.
- **Preload** (`src/preload/index.ts`): Bridges main↔renderer via `contextBridge`. Exposes `window.api` with typed IPC invoke wrappers.
- **Renderer** (`src/renderer/`): React SPA built with Vite. Pages in `src/renderer/pages/`, components in `src/renderer/components/`. Uses react-router-dom for routing.

### Data Pipeline

`src/pipeline.ts` is the core analysis engine:
1. Parses .slp files via `SlippiGame` from `@slippi/slippi-js/node`
2. Computes `GameSummary` (player stats, stocks, conversions, movement) + `DerivedInsights` (punish game, neutral, movement, defense ratings)
3. For multi-game sets, `computeAdaptationSignals` tracks cross-game changes
4. `assembleUserPrompt` + `SYSTEM_PROMPT` produce the LLM coaching prompt

### Supporting Modules

- `src/llm.ts`: Multi-provider LLM abstraction (OpenRouter, Gemini, Anthropic, OpenAI, local). All share: system prompt + user prompt → text.
- `src/llmQueue.ts`: Queued LLM calls to prevent concurrent overload
- `src/db.ts`: SQLite via better-sqlite3. Data dir: `~/.magi-melee/`, DB file: `magi.db`. Tables: `player_profile`, `sessions`, `games`, `game_stats`, `coaching_analyses`, `signature_stats`.
- `src/config.ts`: JSON config at `~/.magi-melee/config.json`. Stores target player, API keys, replay folder, theme.
- `src/importer.ts`: Bulk imports replay folders, hashes files for dedup, inserts into DB, optionally triggers LLM analysis.
- `src/replayAnalyzer.ts`: Single-replay analysis with DB caching (hash-based dedup, skips LLM if cached).
- `src/watcher.ts`: chokidar file watcher for live replay folder monitoring.
- `src/detect-sets.ts`: Groups replays into tournament-style sets by player matchup and time proximity.
- `src/parsePool.ts` / `src/parseWorker.ts`: Worker-based parallel .slp parsing.

### Renderer Pages

Dashboard, Sessions, Characters, Trends, Profile, Settings — each in `src/renderer/pages/`.

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

## Environment

- API keys loaded from `key.env` at project root (dev) or app resources (prod) — never commit this file
- Config and DB live in `~/.magi-melee/`
- Test replays in `test-replays/`
