# MAGI — Melee Analysis through Generative Intelligence

AI-powered Melee coaching from your Slippi replays.

Import your `.slp` files, get personalized coaching analysis from an LLM, track your stats over time, and spot trends across sessions. No other tool in the Melee ecosystem does this.

---

## What it does

**Click a game, get coached.** MAGI parses your Slippi replay data, computes detailed stats (neutral win rate, L-cancel rate, conversion efficiency, habit patterns, recovery success, and more), then sends structured context to an LLM that returns specific, actionable coaching feedback — not generic advice, but observations grounded in *your* data.

**Analyze at any scope.** Get coaching for a single game, an entire set, a character matchup, a stage, a specific opponent, or your full career. Every scope assembles the right stats and asks the right questions.

**Deep Discovery.** MAGI mines your entire game history for hidden patterns — stat correlations, situational win conditions, and non-obvious tendencies you'd never spot manually. Requires 5+ imported games.

**Track your trajectory.** Every game you import gets stored locally. Over time, MAGI shows you trends: is your neutral game improving? Are your ledge options getting predictable? Are you performing worse in game 3 of a set? Line charts, rolling averages, and AI commentary on your trajectory.

**Know your matchups.** Win/loss records by character, by stage, by opponent. Search your history against any player. Auto-detected sets with scores.

**Scout your rivals.** The Opponent Rivalry Dossier gives you a deep dive into any opponent: head-to-head record, stage and character breakdowns, and AI-generated matchup analysis.

**No setup required.** Download a release, open the app, import replays, get coached. AI coaching is powered by Gemini 2.5 Flash and works immediately — no API key needed.

## Features

### AI Coaching
- **Multi-scope analysis** — coaching for games, sets, characters, stages, opponents, or your full career
- **Deep Discovery** — AI pattern mining across your entire history for hidden insights and win conditions
- **Streaming AI coaching** — real-time text generation with blinking cursor, no waiting for a full response
- **Player history context** — coaching references your historical trends, improvement areas, and recurring habits
- **Multi-LLM provider** — Gemini (default/free), OpenRouter (100+ models), Anthropic, OpenAI, DeepSeek, or local via Ollama/LM Studio
- **Analysis caching** — coaching results stored in the database; clicking the same game twice costs $0
- **Queue management** — LLM calls processed sequentially with queue position feedback, 429 rate-limit handling, and exponential backoff
- **MAGI trend commentary** — AI personality that reacts to your trajectory with blunt, witty feedback

### Stats & Tracking
- **Per-game stats** — neutral win rate, L-cancel rate, openings per kill, damage per opening, conversion rate, recovery success, death percent, and more
- **26-character signature stats** — character-specific tech tracking (Fox waveshines, Falco pillars, Marth Ken combos, Sheik tech chases, Falcon knees, Puff rests, Peach turnips, and more)
- **Shield pressure tracking** — shield damage, shield breaks, and shield poke rate
- **DI quality estimation** — survival DI and combo DI scoring
- **Player archetype detection** — six-axis radar (Neutral, Punish, Tech Skill, Defense, Edgeguard, Consistency) with dynamic archetype labels
- **Habit entropy analysis** — detects predictable patterns in recovery, ledge, tech roll, shield drop, and neutral DI options

### Visualization & Navigation
- **Stock timeline** — per-stock strip chart showing duration, damage dealt/taken, kill moves, and momentum shifts
- **Trend charts** — 5-game rolling averages for 9 tracked metrics with area charts and change indicators
- **Command palette** — Cmd/Ctrl+K for quick navigation, fuzzy search, opponent lookup, and actions
- **Character pages** — per-character stats, radar charts, signature stats, matchup and stage records with character card art
- **31 themes** — 5 base themes (dark, light, CRT, tournament, amber) + 26 character-themed skins

### Opponents & Matchups
- **Opponent Rivalry Dossier** — deep dive into any opponent with record, stage/character breakdowns, and AI matchup analysis
- **Matchup & stage records** — win rate bars for every character and stage you've played
- **Set detection** — auto-groups games against the same opponent within 15 minutes
- **Opponent history** — searchable by tag or connect code

### Replay Management
- **Dolphin replay playback** — watch replays with clickable `[M:SS]` timestamps that jump to specific frames
- **Parallel import pipeline** — worker-based parsing, batched DB transactions, async hashing
- **Import progress bar** — real-time progress indicator with file counts, errors, and detailed error logs
- **File watcher** — point at your Slippi replay folder, auto-imports new games as you play
- **SHA-256 deduplication** — never imports the same file twice

### Onboarding & UX
- **Zero-friction onboarding** — AI coaching works immediately in releases, no API key needed
- **Onboarding wizard** — 5-step guided setup (welcome, identity, replay folder, import, theme selection)
- **Local-first** — your data stays on your machine, no account needed, no server
- **Cross-platform** — Windows, macOS, and Linux

### Under the Hood
- **Database migration system** — seamless schema upgrades across versions
- **Preload consolidation** — single source of truth for the IPC bridge between main and renderer
- **Over-the-air updates** — electron-updater for packaged builds

## Getting Started

### Install

Download the latest release for your platform from the [Releases](https://github.com/Bloodshed-Rain/TheMAGI/releases) page:

- **Windows** — `.exe` installer or portable `.exe`
- **macOS** — `.dmg`
- **Linux** — `.AppImage` or `.deb`

### First-time setup

1. Open the app — the onboarding wizard walks you through setup
2. Enter your display name / tag
3. Browse to your Slippi replay folder
4. Import your replays and start getting coached

AI coaching works immediately — no API key needed. To use a different LLM provider, go to **Settings** and configure your preferred model and API key.

## Development

Building from source requires [Node.js](https://nodejs.org/) 18+.

```bash
git clone https://github.com/Bloodshed-Rain/TheMAGI.git
cd TheMAGI
npm install
npx electron-rebuild
```

```bash
npm run dev          # Dev mode (Vite + Electron)
npm run build        # Full build + package
npm test             # Run tests (vitest)
npm run test:watch   # Watch mode
npm run lint         # ESLint
npm run format       # Prettier
```

Platform-specific builds: `npm run build:linux`, `build:win`, `build:mac`

> **Note:** A `key.env` file in the project root is required for both `npm run dev` (AI coaching) and `npm run build` (electron-builder will fail without it). Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) and create the file:
> ```
> GEMINI_API_KEY=your-key-here
> ```
> You can also enter the key on the Settings page instead, but `key.env` must still exist for packaging (it can be empty if you only use the Settings page).

### CLI usage (optional)

```bash
# Analyze a single replay
npx tsx src/pipeline-cli.ts path/to/game.slp --target YourTag

# Watch for new replays
npx tsx src/watcher.ts /path/to/replays --target YourTag
```

## Architecture

```
.slp files
    |
    v
[slippi-js parser] --> GameSummary + DerivedInsights
    |
    +--> [SQLite] --> persistent stats, trends, opponent history
    |
    +--> [LLM Queue] --> streaming API calls (Gemini/OpenRouter/Claude/OpenAI/DeepSeek/local)
              |
              v
          [Coaching Analysis] --> cached in DB, streamed as markdown
```

Three Electron processes communicate via IPC:
- **Main** (`src/main/`) — IPC handlers, pipeline orchestration, file watcher, DB/config management
- **Preload** (`src/preload/`) — `contextBridge` exposing typed `window.clippi` wrappers
- **Renderer** (`src/renderer/`) — React SPA with Vite, pages and components

Key modules:
- `src/pipeline/` — replay parsing, stat computation, habit detection, signature stats, prompt assembly
- `src/llm.ts` — multi-provider LLM abstraction with streaming, retry, and rate-limit handling
- `src/db.ts` — SQLite schema, migrations, queries, trend/matchup/opponent data
- `src/importer.ts` — parallel batch import with SHA-256 dedup and progress reporting

## Roadmap

- [x] Multi-provider LLM support (OpenRouter, Claude, GPT-4o, Gemini, DeepSeek, local)
- [x] Local model support (Ollama / LM Studio)
- [x] Character-specific signature stats (26 characters)
- [x] Streaming AI coaching
- [x] Multi-scope analysis (game, set, character, stage, opponent, career)
- [x] Deep Discovery pattern mining
- [x] Opponent Rivalry Dossier
- [x] Onboarding wizard
- [x] Command palette
- [x] Dolphin replay playback with clickable timestamps
- [x] 31 themes (5 base + 26 character skins)
- [x] Parallel import pipeline with queue management
- [ ] Complete character card art (all 26 characters)
- [ ] Dolphin HUD mode (wrap around the emulator window)
- [ ] Practice plan tracking with progress indicators
- [ ] Shareable coaching reports

## Cost

Not charging anything at this point. If enough people use it to warrant it, I'll implement something to cover API costs. Local LLM models and BYOK will always be supported.

## License

[MIT](LICENSE)
