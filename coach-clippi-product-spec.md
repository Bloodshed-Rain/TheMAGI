# Coach-Clippi: Product Spec

## Vision

Coach-Clippi is a cross-platform desktop app that turns Slippi replay data into
personalized AI coaching — and tracks your improvement over time. It's the tool
that sits next to your Slippi setup, watches your games, tells you what to fix,
and shows you whether you're actually fixing it.

No other tool does this. Existing Melee stats tools show you numbers. Human
coaches cost $20-60/hr and can't watch every set. Coach-Clippi gives you a
coach that's always on, remembers everything, and costs pennies per analysis.

---

## Core Features

### 1. Replay Analysis (what we have now)

Drop in .slp files → get structured coaching feedback.

This is the existing pipeline: slippi-js parses the replay, we compute a
GameSummary + DerivedInsights, feed it to an LLM, get back coaching analysis.

**Already built:** `src/pipeline.ts` handles parsing, stat computation, habit
detection, adaptation signals, and prompt assembly.

**Still needed for the app:**
- LLM integration (API calls to Gemini Flash / Claude / OpenAI / local models)
- Multi-provider support (bring your own key)
- Response rendering in the UI

---

### 2. Session Tracking & Player Profile

This is the differentiator. Every replay analyzed gets stored in a local
database, building a longitudinal profile of the player.

**Player Profile:**
```
- Connect code / tag
- Main character(s) (auto-detected from replay frequency)
- Current skill indicators (L-cancel rate, conversion rate, neutral win rate)
- Total games tracked
- Active since date
```

**Per-Session Record (a "session" = one sitting of games):**
```
- Date / time
- Games played (with links to full analysis)
- Opponents faced (characters, tags)
- Win/loss record
- Key stats snapshot (neutral win rate, openings/kill, etc.)
- AI coaching summary for the session
```

**Storage:** SQLite via `better-sqlite3` (or Drizzle ORM on top). Local-first,
no server needed, portable, fast. The database lives in the app's data
directory alongside the user's replays.

---

### 3. Stat Trends & Progress Tracking

The real magic. Aggregate stats across sessions to show trends over time.

**Tracked metrics (per matchup and overall):**
- Neutral win rate
- Openings per kill
- Conversion rate
- Average damage per opening
- L-cancel rate
- Recovery success rate
- Ledge option entropy
- Knockdown option entropy
- Shield pressure response entropy
- Average death percent

**Trend views:**
- Line charts over time (weekly / monthly / all-time)
- Per-matchup breakdown (your Fox vs Marth stats vs your Fox vs Falco stats)
- Per-stage breakdown
- Before/after comparisons ("your neutral win rate since you started working on
  dash dance spacing")

**AI-Powered Trend Analysis:**
When enough data accumulates, the LLM can reference your historical trends:
- "Your ledge option entropy has dropped from 0.82 to 0.61 over the last two
  weeks — you're becoming more predictable, not less"
- "Your conversion rate against Falco has improved 12% since you started
  practicing pillar combos"
- "You consistently perform worse on game 3+ of a set — consider whether
  mental fatigue or tilt is a factor"

---

### 4. Replay Folder Watching (Auto-Import)

Point Coach-Clippi at your Slippi replay folder. It watches for new .slp files,
auto-imports them, and optionally runs analysis immediately.

- Configurable: auto-analyze on import, or batch-analyze later
- Groups replays into sessions by time proximity (games within ~15 minutes of
  each other = same session)
- Detects sets (same opponent, sequential games) automatically

This is the "seamless" UX — you just play, and Coach-Clippi does its thing
in the background.

---

### 5. Practice Plan Tracking

The coaching analysis produces 3 practice drills per set. The app tracks these:

- Active practice goals (what you're currently working on)
- Progress indicators (are the relevant stats improving?)
- History of past practice plans
- AI can reference past plans: "Last week I told you to work on your OOS game.
  Your shield grab rate is up 15% but your OOS shine is still at 2% — keep at
  it"

---

## App Architecture

### Framework: Electron + React

- **Frontend:** React + TypeScript. Mature ecosystem, familiar from OpenClipPro.
- **Backend:** Electron main process (Node.js) handles file watching, SQLite,
  slippi-js parsing, and LLM API calls. The existing pipeline.ts code runs
  directly in the main process — no sidecar needed.
- **IPC:** Electron's contextBridge + ipcRenderer/ipcMain for renderer ↔ main
  communication.
- **Build:** electron-builder for cross-platform packaging (Windows, macOS, Linux).

### Data Flow

```
[Slippi Replay Folder]
    │
    ▼
[File Watcher] ──► detects new .slp files
    │
    ▼
[Pipeline] ──► parse with slippi-js, compute GameSummary + DerivedInsights
    │
    ├──► [SQLite] ──► store structured stats for trend tracking
    │
    └──► [LLM API] ──► generate coaching analysis
            │
            ▼
        [UI] ──► display analysis, trends, practice plans
```

### Local Database Schema (simplified)

```sql
-- The player using the app
player_profile (
    id, connect_code, display_name, created_at
)

-- Every game analyzed
games (
    id, session_id, replay_path, played_at,
    stage, duration_seconds,
    player_character, opponent_character,
    opponent_tag, opponent_connect_code,
    result (win/loss/draw),
    end_method,
    player_final_stocks, player_final_percent,
    opponent_final_stocks, opponent_final_percent
)

-- Detailed stats per game (one row per game)
game_stats (
    game_id,
    neutral_wins, neutral_losses, neutral_win_rate,
    openings_per_kill, conversion_rate,
    avg_damage_per_opening, kill_conversions,
    l_cancel_rate, wavedash_count,
    recovery_attempts, recovery_success_rate,
    ledge_entropy, knockdown_entropy, shield_pressure_entropy,
    avg_death_percent, total_damage_dealt, total_damage_taken
)

-- Session groupings
sessions (
    id, started_at, ended_at,
    games_played, games_won,
    ai_summary_text
)

-- AI coaching outputs
coaching_analyses (
    id, game_id, session_id,
    model_used, prompt_tokens, completion_tokens,
    analysis_text, created_at
)

-- Practice plans
practice_plans (
    id, coaching_analysis_id, created_at,
    drill_1, drill_2, drill_3,
    status (active/completed/abandoned)
)
```

---

## UI Screens

### 1. Dashboard (Home)
- Recent sessions with W/L record
- Key stat sparklines (trending up/down indicators)
- Active practice plan
- Quick-import button

### 2. Session View
- All games in the session, chronologically
- Per-game result cards (character icons, stage, stocks, key stats)
- Full AI coaching analysis for the session
- "Analyze" button if not yet analyzed

### 3. Game Detail
- Full stat breakdown for one game
- AI coaching analysis
- Stock-by-stock timeline
- Habit profiles (ledge, knockdown, shield pressure distributions)

### 4. Trends
- Stat line charts over time
- Filter by: matchup, stage, time range, opponent
- AI trend commentary (generated on demand)

### 5. Profile
- Your main characters, total games, overall stats
- Matchup W/L matrix
- Stage W/L matrix

### 6. Settings
- Slippi replay folder path
- Auto-import on/off
- LLM provider + API key
- Model selection

---

## Phased Roadmap

### Phase 1: Core Pipeline + CLI (current state → near-term)
**Goal:** Validate the analysis quality, get early feedback.

- [x] Data pipeline (slippi-js → GameSummary + DerivedInsights)
- [ ] LLM integration (API calls, multi-provider)
- [ ] CLI output: human-readable coaching analysis to terminal
- [ ] Prompt assembly from spec
- [ ] Test against a variety of replays (different characters, skill levels)

**Ship as:** CLI tool / npm package. Early adopters can run it from terminal.

### Phase 2: Local Database + Stat Tracking
**Goal:** Persistent player profile with trend data.

- [ ] SQLite database setup
- [ ] Auto-import from replay folder (file watcher)
- [ ] Session detection (group games by time)
- [ ] Stat storage per game
- [ ] Trend computation (rolling averages, per-matchup splits)
- [ ] CLI commands: `coach-clippi stats`, `coach-clippi trends`

**Ship as:** Enhanced CLI with persistent tracking.

### Phase 3: Desktop App (MVP)
**Goal:** Visual interface, accessible to non-technical players.

- [ ] Electron app shell
- [ ] Dashboard, session view, game detail screens
- [ ] Drag-and-drop replay import
- [ ] Settings screen (folder path, API key)
- [ ] Coaching analysis rendered in-app
- [ ] Basic trend charts

**Ship as:** Downloadable app (Windows, macOS, Linux).

### Phase 4: Full Trend Experience
**Goal:** The "keep opening the app" loop.

- [ ] Rich trend visualizations (charts, sparklines, heatmaps)
- [ ] Matchup and stage matrices
- [ ] AI trend commentary (cross-session insights)
- [ ] Practice plan tracking with progress indicators
- [ ] Session-over-session comparisons

### Phase 5: Community & Polish
**Goal:** Growth and retention features.

- [ ] Shareable coaching reports (export as image/link)
- [ ] Replay folder auto-watch as background service
- [ ] Opponent scouting (if you've played someone before, pull up your history)
- [ ] Local model support (LM Studio / Ollama integration)
- [ ] Theming (Melee-inspired UI, character-specific color schemes)
- [ ] Optional: anonymous stat contribution to community benchmarks
  ("your neutral win rate is top 20% among tracked Fox players")

---

## Model & Cost Strategy

**Per-analysis cost targets:**
- Gemini 2.5 Flash: ~$0.01-0.03 per game analysis (default)
- Claude Haiku / GPT-4o-mini: ~$0.02-0.05 (mid-tier option)
- Claude Sonnet / GPT-4o: ~$0.10-0.20 (premium option)
- Local models (Ollama/LM Studio): free, offline, lower quality (Phase 3/4)

**User pays for their own API usage.** No Coach-Clippi server, no subscription.
Users bring their own API key. This keeps the app free and avoids the need for
a backend service.

**Future option:** Offer a hosted mode where users pay Coach-Clippi directly
(small markup on API costs) so non-technical users don't need to get API keys.

---

## What Makes This Stick

1. **No competition.** Zero tools do LLM coaching from replay data today.
2. **Longitudinal tracking.** The more you use it, the more valuable it gets.
   Stats tools show you one game. Coach-Clippi shows you your trajectory.
3. **Actionable output.** Not just numbers — specific drills, habit callouts,
   trend alerts. Things you can act on in your next session.
4. **Local-first.** No account, no server, no subscription. Your data stays
   on your machine. Appeals to the privacy-conscious FGC audience.
5. **Low cost.** Pennies per analysis vs $40/hr for a human coach who can't
   watch every set anyway.

---

## Decisions Made

- **Electron + React.** Stay in TypeScript end-to-end. Faster to ship, Claude
  Code generates TS/React reliably, and the OpenClipPro experience carries over.
  Binary size doesn't matter for this audience.
- **Set detection:** Same opponent within 10-15 minutes = same set. User can
  manually group or split as an override.
- **Replay dedup:** SHA-256 hash each .slp on import, skip if hash exists in DB.
- **LLM support:** API-only for Phase 1 (Gemini Flash default). Local model
  support (Ollama/LM Studio) deferred to Phase 3/4.
