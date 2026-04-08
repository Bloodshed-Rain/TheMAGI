# MAGI — Melee Analysis through Generative Intelligence

AI-powered Melee coaching from your Slippi replays.

Import your `.slp` files, get personalized coaching analysis from an LLM, track your stats over time, and spot trends across sessions. No other tool in the Melee ecosystem does this.

![MAGI Dashboard](screenshots/dashboard.png)

---

## What it does

**Click a game, get coached.** MAGI parses your Slippi replay data, computes detailed stats (neutral win rate, L-cancel rate, conversion efficiency, habit patterns, recovery success, and more), then sends structured context to an LLM that returns specific, actionable coaching feedback — not generic advice, but observations grounded in *your* data.

**Analyze at any scope.** Get coaching for a single game, an entire set, a character matchup, a stage, a specific opponent, or your full career. Every scope assembles the right stats and asks the right questions.

**Deep Discovery.** MAGI mines your entire game history for hidden patterns — running full pairwise correlations across 21 metrics to surface non-obvious relationships, situational win conditions, and tendencies you'd never spot manually. Requires 5+ imported games.

**Track your trajectory.** Every game you import gets stored locally. Over time, MAGI shows you trends: is your neutral game improving? Are your ledge options getting predictable? Are you performing worse in game 3 of a set? Line charts, rolling averages, and AI commentary on your trajectory.

**Know your matchups.** Win/loss records by character, by stage, by opponent. Search your history against any player. Auto-detected sets with scores.

**Scout your rivals.** The Opponent Rivalry Dossier gives you a deep dive into any opponent: head-to-head record, stage and character breakdowns, and AI-generated matchup analysis.

**No setup required.** Download a release, open the app, import replays, get coached. AI coaching is powered by GPT-4o Mini and works immediately — no API key needed.

## Features

### AI Coaching

![MAGI Coaching — matchup analysis](screenshots/coaching-matchup.png)

- **Multi-scope analysis** — coaching for games, sets, characters, stages, opponents, or your full career
- **Deep Discovery** — full pairwise correlation matrix (21 metrics, top 25 by strength) with AI pattern mining for hidden insights and win conditions
- **Streaming AI coaching** — real-time text generation with blinking cursor, no waiting for a full response
- **Player history context** — coaching references your historical trends, improvement areas, and recurring habits
- **Best Moments / Worst Misplays** — coaching highlights your cleanest plays and costliest mistakes with clickable timestamps
- **Dynamic model selection** — Settings dropdown fetches live model lists from all configured providers (Gemini, OpenRouter, Anthropic, OpenAI) with custom model ID support
- **Multi-LLM provider** — GPT-4o Mini (default, no key needed), OpenRouter (100+ models), Gemini, Anthropic, DeepSeek, or local via Ollama/LM Studio
- **Analysis caching** — coaching results stored in the database; clicking the same game twice costs $0
- **Queue management** — LLM calls processed sequentially with queue position feedback, 429 rate-limit handling, and exponential backoff
- **MAGI trend commentary** — AI personality that reacts to your trajectory with blunt, witty feedback

![MAGI Coaching — full career analysis](screenshots/coaching-career.png)

### Stats & Tracking

![Player Profile — record, radar chart, mixup analysis](screenshots/profile.png)

- **Per-game stats** — neutral win rate, L-cancel rate, openings per kill, damage per opening, conversion rate, recovery success, death percent, and more
- **26-character signature stats** — character-specific tech tracking (Fox waveshines, Falco pillars, Marth Ken combos, Sheik tech chases, Falcon knees, Puff rests, Peach turnips, and more)
- **Shield pressure tracking** — shield damage, shield breaks, and shield poke rate
- **DI quality estimation** — matchup-aware combo DI and survival DI scoring using character physics (weight, fall speed, combo susceptibility) and opponent combo game strength
- **Player archetype detection** — six-axis radar (Neutral, Punish, Tech Skill, Defense, Edgeguard, Consistency) with dynamic archetype labels
- **Habit entropy analysis** — detects predictable patterns in recovery, ledge, tech roll, shield drop, and neutral DI options

### Visualization & Navigation

![Trend charts — rolling averages over time](screenshots/trends.png)

- **Stock timeline** — per-stock strip chart showing duration, damage dealt/taken, kill moves, and momentum shifts
- **Trend charts** — 5-game rolling averages for 9 tracked metrics with area charts and change indicators
- **Command palette** — Cmd/Ctrl+K for quick navigation, fuzzy search, opponent lookup, and actions
- **Character pages** — per-character stats, radar charts, signature stats, matchup and stage records with character card art

![Character page — Marth](screenshots/characters.png)
- **31 themes** — 5 base themes (dark, light, CRT, tournament, amber) + 26 character-themed skins

### Opponents & Matchups

![Sessions — game history with results and stats](screenshots/sessions.png)

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

![Settings — 31 themes including character skins](screenshots/settings-themes.png)

- **Zero-friction onboarding** — AI coaching works immediately via server-side proxy, no API key needed
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

AI coaching works immediately — no API key needed. MAGI ships with GPT-4o Mini powered coaching out of the box. To use a different LLM provider, go to **Settings** and add your own API key for OpenRouter, Gemini, Anthropic, or a local model.

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

> **Note:** AI coaching works out of the box via the MAGI proxy (GPT-4o Mini). For dev mode with other providers, create a `key.env` file in the project root:
> ```
> GEMINI_API_KEY=your-key-here
> ```
> `key.env` is gitignored and is **not** bundled into release builds. API keys for the default model are managed server-side.

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
    +--> [LLM Queue] --> streaming API calls (GPT-4o Mini via proxy / Gemini / OpenRouter / Claude / local)
              |
              v
          [Coaching Analysis] --> cached in DB, streamed as markdown
```

Three Electron processes communicate via IPC:
- **Main** (`src/main/`) — IPC handlers, pipeline orchestration, file watcher, DB/config management
- **Preload** (`src/preload/`) — `contextBridge` exposing typed `window.clippi` wrappers
- **Renderer** (`src/renderer/`) — React SPA with Vite, pages and components

Key modules:
- `src/pipeline/` — replay parsing, stat computation, habit detection, signature stats, character physics data, prompt assembly
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
- [x] Dynamic model fetching from all LLM providers
- [x] Best Moments / Worst Misplays timestamp highlights in coaching
- [x] Server-side API proxy with HMAC signing — zero-setup coaching, no keys shipped in builds
- [x] Security hardening — write-only key management, renderer key isolation, npm audit clean
- [ ] Complete character card art (all 26 characters)
- [ ] Dolphin HUD mode (wrap around the emulator window)
- [ ] Practice plan tracking with progress indicators
- [ ] Shareable coaching reports

## Cost

Free. AI coaching is provided at no cost to users — the default GPT-4o Mini model is hosted via a rate-limited proxy. Bring-your-own-key and local LLM models will always be supported.

## License

[MIT](LICENSE)
