# MAGI UI Density Redesign

**Date:** 2026-04-20
**Branch:** `feat/new-ui`
**Status:** Design approved, ready for implementation plan.

## Problem

The current renderer is a reskin of the pre-Liquid layout. Shell, theme tokens, and primitives have landed, but pages still render the old structure. Info density is poor — the prototype in `new ui/` packs substantially more data per screen using KPI grids, data tables, inline sparklines, and stat-group cards. This spec turns the prototype's structure into the actual renderer: real data, real LLM wiring, real persistence, purist deletions of the old UI.

## Reference

The authoritative visual + structural reference is `new ui/` in this repo:

- `MAGI Redesign.html` — shell entry
- `shell.jsx` — Sidebar + TweaksPanel
- `base.css`, `themes.css` — token system + component styling
- `pages_a.jsx`, `pages_b.jsx`, `pages_c.jsx`, `pages_d.jsx` — 8 pages + GameDrawer
- `data.js` — mock data shape (used only to understand the primitive vocabulary; real data comes from the existing pipeline + DB)

## Scope decisions

The following were decided during brainstorming and are closed:

| Decision                | Outcome                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redesign scope          | Full port — all pages rewritten to the prototype's density patterns.                                                                                                 |
| New pages               | Add **Practice** and **Oracle** as top-level nav items.                                                                                                              |
| Practice backing        | LLM-generated drill plans from weakness profile, persisted.                                                                                                          |
| Sessions                | **Replace** Sets/Opponents views with prototype's per-day session cards. Net loss of functionality is accepted for the sake of consistency.                          |
| Orphan pages            | **Delete** Coaching page, GameDetail route, Win98Shell, HighlightCards, Onboarding. Coaching output moves inline into GameDrawer. First-run becomes an `EmptyState`. |
| Themes                  | Prototype set only: `liquid, telemetry, tournament, crt, amber, light`. Delete `win98` and `melee`.                                                                  |
| Implementation strategy | **Foundation-first.** Lock primitives + themes + shell polish, then rewrite pages in parallel order, then delete orphans.                                            |

## Architecture

The redesign stays in `src/renderer/` (no `renderer-v2`). Layer shape after cleanup:

```
src/renderer/
  App.tsx                        — routes, single shell (no Win98 branch)
  themes.ts                      — prototype theme set only
  components/
    LiquidShell.tsx              — prototype shell (keep)
    TweaksPanel.tsx              — prune theme chips to 6
    GameDrawer.tsx               — rewritten (stat-group pattern)
    ui/
      Card.tsx + variant prop
      DataTable.tsx, KPI.tsx, Pill.tsx, ResultDot.tsx,
      WinrateBar.tsx, Badge.tsx                          (existing)
      Sparkline.tsx                                      (new)
      StatGroupCard.tsx                                  (new)
      EmptyState.tsx                                     (new)
  pages/
    Dashboard.tsx, Sessions.tsx, Library.tsx,
    Characters.tsx, Trends.tsx, Settings.tsx             (rewritten)
    Practice.tsx, Oracle.tsx                             (new)
  hooks/queries.ts               — extend return shapes
  radarStats.ts                  — keep as-is
```

**Deleted outright:** `Win98Shell.tsx`, `pages/Coaching.tsx`, `pages/GameDetail.tsx`, `components/Onboarding.tsx`, `components/HighlightCards.tsx`, `components/CoachingCards.tsx` (if orphaned after Coaching page deletion), all `win98`/`melee` theme tokens + CSS, `/coaching` + `/game/:gameId` routes.

## Primitive vocabulary

Every page speaks only the `ui/` primitive set.

**Existing (keep):**

- `Card` — surface container. **Add** a `variant?: "default" | "chrome"` prop for the chrome-plate treatment.
- `DataTable` — dense rows with hover lift.
- `KPI` — top-of-page metric tile. Verify/extend to support `delta` + `deltaLabel`.
- `Pill` / `PillRow` — filter chips.
- `ResultDot` — win/loss dot.
- `WinrateBar` — thin gradient bar.
- `Badge` — inline W/L label.

**New:**

- `Sparkline` — one component, two presets. `kind="spark"` for 120×32 inline sparks on Dashboard; `kind="chart"` for full-width Trends charts (polyline + gradient area + dashed gridlines + endpoint dot).
- `StatGroupCard` — `{ group: string, items: Array<{ label, value, good?, isText? }> }` → `Card` with title + responsive `minmax(120px, 1fr)` grid of stat tiles. Used in GameDrawer (×3) and Characters detail.
- `EmptyState` — icon + title + sub + optional CTA. Replaces all existing empty-state blocks and the Onboarding component.

## Page specs

### Dashboard

- `page-header` with player tag + game count + streak text.
- `kpi-grid` with 4 tiles: **Win Rate**, **Neutral WR**, **L-Cancel**, **Dmg/Opening** (replaces Edgeguard in the top row — richer signal; Edgeguard still visible on per-game rows). Each tile shows a trend delta arrow.
- 2-column grid below:
  - **Left — Recent Form `Card`.** Last-10 dot strip (each dot opens `GameDrawer`), three inline `Sparkline`s for Neutral/L-Cancel/Conversion.
  - **Right — Oracle Insight `Card`.** Reuses existing `analyzeTrends` IPC. Prompt reframed with Oracle voice. Single "Coach this session" CTA.
- `Card` wrapping a `DataTable` of Recent Games, 9 columns (dot, matchup, opponent, stage, stocks, neutral, l-cancel, dmg/op, →). Click row → open `GameDrawer`.

**Losing:** `HighlightCards` grid (Best Character / Best Matchup / Worst Matchup / Best Stage), the bespoke `dash-game-row` grid, the bottom-of-page AI insight block, the per-stat `PulseStat` boxes.

### Library

Current implementation is close. Keep filter card (`search`, `matchup`, `stage`, `result-pills`), keep `DataTable` body. Minor: consider raising the hard 200-row cap or virtualizing — 500+ games is realistic for an active player. Optionally add a small KPI row above the filters ("filtered 24 of 500 · 58% winrate").

### Sessions

Grid of per-day `Card`s matching `pages_b.jsx` Sessions.

- Per card: calendar date, record (W-L + winrate%), dot strip (each dot opens `GameDrawer`), `WinrateBar` to winrate, opponent name list ("vs MANG0, ZAIN +3"), **"Session Report" button** → calls new `analyzeSession(date)` IPC which returns a cached LLM summary.
- New hook `useSessionsByDay(range)` replaces `useSets`, `useOpponents`, `useOpponentDetail`.

**Losing:** Sets view, Opponents view, per-opponent detail panel (`OpponentDetailPanel`), stage + character breakdown bars.

### Characters

- Grid view: character tiles with emoji/card-art, name (colored), `{wins}W-{losses}L · {games} games`, `WinrateBar`.
- Detail view on click:
  - Left: `Card variant="chrome"` with emoji hero, character name, games count, "Analyze Matchup" button, 2×2 stat mini-grid (Neutral WR, Conv Rate, L-Cancel, Op/Kill).
  - Right: matchup `DataTable` (vs char, games, record, winrate with `WinrateBar`).
- **Below the right column:** preserved signature-stats section, rendered via `StatGroupCard` for consistency.

### Trends

Exactly the prototype (`pages_c.jsx`).

- Header: date-range pills (7d / 30d / All).
- Filter card: opponent-character filter pills.
- Hero `Card` with selected-metric `Sparkline kind="chart"` (height 260) + delta pill (↑/↓ pp).
- Responsive grid of 5 smaller chart cards for the other metrics. Click mini → promote to hero.
- New hook `useTrendSeries(metric, range, filterChar?)`.

### Practice (new)

- Header has "+ New Plan" button.
- Card grid of plans. Per card: plan name, "N due" badge, `N/M drills complete`, `WinrateBar` progress, drill checklist with checkboxes (struck-through when done), "Start session" button.
- "+ New Plan" opens a modal → calls new `generatePracticePlan(playerProfileId)` IPC. LLM returns JSON `{ name, drills: [{ name, target }] }`. Persisted.
- Checkbox toggle calls `setDrillCompletion(drillId, completed)`.

### Oracle (new)

- Full-height chat.
- **Single long-running conversation** (no multi-conversation sidebar — matches prototype, keeps scope tight).
- Messages rendered with 32×32 avatar square (`M` for Oracle, `Y` for user), whitespace-preserving body.
- Input at bottom, Enter or "Ask" submits.
- Backend: new `askOracle(messages)` IPC, streams via existing LLM infra. System prompt teaches Oracle voice; last N games' stats summary prepended to each turn (no tool-calling for now).
- Persisted in `oracle_messages`. "Clear history" action in a dropdown.

### Settings

Prototype visual style — `Card`s with `card-title` labels + `Pill` chips for choices. **Keeps all current config:**

- Replay watcher + folder path
- Active player selector
- API keys for all 5 providers (OpenRouter, Gemini, Anthropic, OpenAI, local)
- Selected model per provider
- Dolphin path
- Theme + density stay in the floating `TweaksPanel`.

### GameDrawer (rewritten)

- Header row: W/L `Badge` + "Marth vs Fox" title + sub-line (`vs {tag} · {stage} · {mm:ss}`).
- Action row: "Get Coaching" (primary) + "Watch Replay".
- `StockTimeline` component stays (already built, keep current visualization).
- Three `StatGroupCard`s:
  - **Performance** — Neutral WR, L-Cancel, Conversion, Dmg/Op, Op/Kill.
  - **Defense** — Recovery%, Death%, Power Shields.
  - **Offense** — Edgeguard%, Dmg dealt, Kill Move.
- "Get Coaching" click renders coaching markdown **inline inside the drawer** — this is what replaces the deleted Coaching page.

## Theme migration

- Rename `dark` → `telemetry` (same tokens, new id + display name).
- Add `tournament` (pure black bg, blue accent), `crt` (green phosphor), `amber` (warm brown/gold). Token values port straight from `new ui/themes.css`.
- Delete `win98`, `melee` from `THEMES`.
- Drop the `isWin98` branch in `App.tsx`; the app always renders `LiquidShell`.
- Config migration in App.tsx theme loader: map saved `colorMode`:
  - `dark` → `telemetry`
  - `win98`, `melee` → `liquid`
  - invalid/unknown → `liquid` (existing fallback)
- `TweaksPanel` theme chip list rewrites to the six prototype entries.

## Data layer

**`useRecentGames` extension.** Add to the SELECT in `src/main/handlers/stats.ts` and the TS type:
`avgDamagePerOpening, conversionRate, recoverySuccessRate, avgDeathPercent, powerShieldCount, totalDamageDealt, totalDamageTaken, killMove, durationSeconds, playerFinalPercent, opponentFinalPercent, opponentConnectCode`. All exist in DB after the 5 existing migrations.

**`useDashboardHighlights.trends` extension.** Add `damagePerOpeningDelta` + `conversionRateDelta` so the new KPI tile can render its arrow.

**New hooks:**

- `useSessionsByDay(range)` — groups games by calendar day, returns per-day aggregates (date, games, wins, losses, opponents, gameIds) matching the prototype's session card shape.
- `useTrendSeries(metric, range, filterChar?)` — returns chronological value array for Trends charts.

**Removed hooks** after page migration: `useSets`, `useOpponents`, `useOpponentDetail`.

## LLM + DB additions

**Migration #6** (new):

- `practice_plans (id, player_profile_id, name, weakness_summary, created_at)`
- `practice_drills (id, plan_id, name, target, completed, sort_order)`
- `oracle_messages (id, role, content, created_at)`
- `session_reports (id, date, content, created_at)` — cache so repeated "Session Report" clicks don't re-bill the LLM.

**New prompts** in `src/pipeline/prompt.ts`:

- `SYSTEM_PROMPT_PRACTICE` — input: weakness profile from `derivedInsights`; output: JSON `{ name, drills: [{ name, target }] }`, 3–5 drills.
- `SYSTEM_PROMPT_ORACLE` — conversational coach voice, must cite concrete stats from the appended games summary.
- `SYSTEM_PROMPT_SESSION` — input: one day's games; output: 2-paragraph synthesis (what worked, what to focus on next).

**New IPC** in `src/main/handlers/llm.ts` + preload exposure:

- `generatePracticePlan(playerProfileId)` → persists plan + drills, returns Plan.
- `setDrillCompletion(drillId, completed)` → updates row.
- `listPracticePlans(playerProfileId)` / `getPracticePlan(id)`.
- `askOracle(messages)` → streams response; persists both user + assistant rows.
- `listOracleMessages()` / `clearOracleHistory()`.
- `analyzeSession(date)` → check `session_reports`; call LLM on miss, cache, return.

## Rollout order

Each step is a separate commit. A review checkpoint sits between every step.

1. **Foundation.** Add `Sparkline`, `StatGroupCard`, `EmptyState`, `Card` `variant` prop. Add `tournament`/`crt`/`amber` themes. Rename `dark`→`telemetry`. Migrate saved `colorMode`. Update `TweaksPanel` chip list. Delete `Win98Shell.tsx`, `win98`+`melee` theme code + CSS.
2. **GameDrawer rewrite.** Done before every page because every page navigates into it.
3. **Dashboard rewrite.**
4. **Library polish.** Smaller delta; optional KPI row.
5. **Sessions replacement.** Delete Sets/Opponents code + hooks, add `useSessionsByDay`, add per-day cards, wire `analyzeSession` IPC.
6. **Characters rewrite.** Grid + `ChromePlate` hero + matchup `DataTable` + signature stats in `StatGroupCard`.
7. **Trends rewrite.** Hero chart + mini-grid + filter pills + `useTrendSeries` hook.
8. **Practice.** Migration #6 (tables), prompt, IPC, page.
9. **Oracle.** Migration #6 (table already added in step 8), streaming IPC, page.
10. **Settings re-skin.** Preserve all config keys.
11. **Cleanup.** Delete `pages/Coaching.tsx`, `pages/GameDetail.tsx`, `components/Onboarding.tsx`, `components/HighlightCards.tsx`, `components/CoachingCards.tsx` (if orphaned). Remove `/coaching` + `/game/:gameId` routes. Delete dead CSS classes. Run `npx tsc -p tsconfig.main.json --noEmit && npm test && npm run build`.

## Success criteria

- All 8 nav pages render in all 6 themes with the prototype's density.
- GameDrawer is the only game-detail surface.
- `tsc`, `vitest`, `vite build`, and `electron-builder` all green.
- `grep -r 'win98\|melee-theme\|Onboarding\|HighlightCards\|CoachingCards' src/renderer` returns nothing meaningful.
- First-run UX reaches Settings via an `EmptyState` CTA.
- Practice plans persist across restarts; completed drills stay completed.
- Oracle conversation survives restarts until explicitly cleared.
- Session Report button caches after the first click per day.

## Out of scope

- Multi-conversation Oracle sidebar (single long-running conversation only).
- Drill telemetry (no integration with replays confirming a drill was "practiced").
- Per-character-specific practice plans (one plan list per player profile, not per main).
- Mobile-responsive breakpoints (Electron desktop only).
- Live Watch integration changes — button remains a link to Settings.
