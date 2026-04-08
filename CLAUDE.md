# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MAGI (Melee Analysis through Generative Intelligence) is an Electron + React desktop app that analyzes Super Smash Bros. Melee replays (.slp files via slippi-js) and generates AI coaching feedback via LLM providers.

## Commands

- **Dev mode**: `npm run dev` — starts Vite dev server + Electron concurrently
- **Build**: `npm run build` — compiles main process TS, builds renderer via Vite, packages with electron-builder
- **Platform builds**: `npm run build:linux`, `build:win`, `build:mac`
- **Run pipeline CLI**: `npx tsx src/pipeline-cli.ts <file.slp> [--target player] [--json]`
- **Type-check main process**: `npx tsc -p tsconfig.main.json --noEmit`
- **Run tests**: `npm test` — runs vitest (pipeline, config, db, importer tests)
- **Watch tests**: `npm run test:watch` — vitest in watch mode

## Architecture

### Process Model (Electron)

Three processes communicate via IPC:

- **Main** (`src/main/index.ts`): Electron main process. IPC handlers split into `src/main/handlers/` (analysis, stats, llm, config, import, watcher, dolphin, dialog, stockTimeline). Shared state in `src/main/state.ts`.
- **Preload** (`src/preload/index.ts`): Bridges main↔renderer via `contextBridge`. Exposes `window.clippi` with typed IPC invoke wrappers.
- **Renderer** (`src/renderer/`): React SPA built with Vite. Pages in `src/renderer/pages/`, components in `src/renderer/components/`. Uses `react-router-dom` for routing.

### Data Pipeline

`src/pipeline/` is the core analysis engine (barrel-exported via `index.ts`):
- `types.ts`: All interfaces (`GameSummary`, `PlayerSummary`, `DerivedInsights`, signature stats)
- `helpers.ts`: Shared utilities (frame conversion, action state classifiers, stage bounds, move ID mapping)
- `processGame.ts`: Main orchestrator — parses .slp via `SlippiGame`, returns `GameResult`
- `playerSummary.ts`: Builds per-player stats (neutral, conversions, movement, recovery, edgeguards)
- `signatureStats.ts`: Character-specific stat detection (26 characters)
- `derivedInsights.ts`: Habit profiles, key moments, performance by stock
- `adaptation.ts`: Cross-game adaptation signals for multi-game sets
- `highlights.ts`: Detects notable moments (zero-to-deaths, spike kills, high-damage, 4-stocks, JV5/JV4)
- `characterData.ts`: Character metadata
- `prompt.ts`: `SYSTEM_PROMPT`, `SYSTEM_PROMPT_AGGREGATE`, `SYSTEM_PROMPT_DISCOVERY` + `assembleUserPrompt`, `assembleAggregatePrompt`, `assembleDiscoveryPrompt`, `assemblePlayerContext`

### Supporting Modules

- `src/llm.ts`: Multi-provider LLM abstraction (OpenRouter, Gemini, Anthropic, OpenAI, local). All share: system prompt + user prompt → text.
- `src/llmQueue.ts`: Queued LLM calls to prevent concurrent overload
- `src/db.ts`: SQLite via better-sqlite3. Data dir: `~/.magi-melee/`, DB file: `magi.db`. Tables: `player_profile`, `sessions`, `games`, `game_stats`, `coaching_analyses`, `character_signature_stats`, `highlights`, `schema_version`. 5 migrations adding: power_shield_count, edgeguard stats, shield pressure + DI columns, coaching scope fields, highlights table.
- `src/config.ts`: JSON config at `~/.magi-melee/config.json`. Stores target player, API keys, replay folder, theme.
- `src/importer.ts`: Bulk imports replay folders, hashes files for dedup, inserts into DB, optionally triggers LLM analysis.
- `src/replayAnalyzer.ts`: Single-replay analysis with DB caching (hash-based dedup, skips LLM if cached).
- `src/watcher.ts`: chokidar file watcher for live replay folder monitoring.
- `src/detect-sets.ts`: Groups replays into tournament-style sets by player matchup and time proximity.
- `src/parsePool.ts` / `src/parseWorker.ts`: Worker-based parallel .slp parsing.
- `src/player-profile.ts`: Player profile management (archetype detection, radar stats).
- `src/stats.ts`: Stat computation helpers for DB queries and trend data.
- `src/setup.ts`: First-run setup and migration logic.

### Renderer Pages

Dashboard, Sessions, History, Trends, Characters, Profile, Settings — each in `src/renderer/pages/`.

Key components in `src/renderer/components/`:
- `CoachingCards.tsx`: Parsed markdown coaching display with collapsible sections, section icons, timestamp links
- `CoachingModal.tsx`: Full-page coaching modal with LLM streaming, scope info
- `HighlightCards.tsx`: Highlight moment display with type-based color coding
- `RadarChart.tsx`: 6-axis player radar (neutral, conversion, L-cancel, recovery, edgeguard, DI)
- `CommandPalette.tsx`: Ctrl+K quick navigation and import
- `StockTimeline.tsx`: Visual stock progression timeline
- `Onboarding.tsx`: First-time setup flow
- `ErrorBoundary.tsx`, `Tooltip.tsx`, `NavIcons.tsx`, `ThemeIcons.tsx`

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
