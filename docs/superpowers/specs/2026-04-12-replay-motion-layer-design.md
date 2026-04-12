# Replay Motion Layer — Profile Card Background

**Status:** Design
**Date:** 2026-04-12
**Scope:** v1 — minimum viable shipping target

## Goal

Replace the empty space inside the Profile page's win/loss card with a looping motion-graphic background that plays the player's most recent wins as abstract CAD-style x-ray animations. The "22 — 10" numbers stay crisp in the foreground; behind them, the stage outlines trace in as a wireframe and both players' positions move across it as ghosted trails. Desaturated, theme-tinted, ~25% opacity. The effect should feel like watching a highlight reel rendered by a frame-data analyzer — data-native, not video.

## Success criteria

1. A non-empty Profile card — the "22 — 10" numbers sit over visible, moving motion graphics that are clearly recognizable as replay playback.
2. No perceptible perf regression on the Profile page. Canvas work fits inside the GPU compositor budget; stat tables and radar chart scroll smoothly while the layer animates.
3. Animation pauses when the card scrolls off-screen or the window is hidden.
4. The layer's colors react to theme switches without app restart.
5. Works on Battlefield, Final Destination, Dreamland, Yoshi's Story, Fountain of Dreams, and Pokémon Stadium.
6. Gracefully hides itself if there are no recent win-highlights available.
7. Foreground text (the win/loss numbers and subtitle) remains razor-legible against the animated background.

## In scope (v1)

- New utility `src/pipeline/highlightTrace.ts` that extracts per-frame position samples for a highlight's frame window from a `.slp` file via the existing worker pool.
- New static stage-geometry table in `src/pipeline/stageGeometry.ts` covering the 6 tournament-legal stages (static geometry only — platforms, ledges, main floor).
- New IPC handler `analysis:getRecentWinTraces` that returns the 3–5 most recent `ExtractedHighlight` objects where the target player was the aggressor.
- New React component `src/renderer/components/ReplayMotionLayer.tsx` that renders a `<canvas>` with the rolling-buffer trail animation, crossfades between highlights, and pauses via IntersectionObserver.
- New CSS rules in `src/renderer/styles/components.css` (or a scoped file) for the layer and the foreground stacking context.
- Integration into `src/renderer/pages/Profile.tsx` — the existing `.profile-record-card` becomes the positioning container, the canvas sits absolutely behind the record numbers, foreground content gets its own stacking context.

## Out of scope (punted to v2+)

- Damage flash events, stock-loss icons, attack-state color shifts.
- Character-aware trail colors (v1 uses theme `--win`/`--loss`).
- Dynamic stage events (FoD platform oscillation, Stadium transformations, Whispy wind).
- Item trails (Peach turnips, Falco lasers, Link bombs).
- Non-legal stages (Brinstar, Corneria, Mute City, etc.).
- DB migration for `end_frame` — v1 uses a fixed padding window.
- "Hover to replay" interaction.
- Persistent trace caching across sessions — v1 caches in memory only.

## Architecture

Six components, each behind a clean interface — three in the main process (extraction, geometry, IPC handler), three in the renderer (component, page integration, CSS):

### 1. Data extraction (main process)

**File:** `src/pipeline/highlightTrace.ts` (new)

Pure function over a parsed `SlippiGame`. Walks frames `[startFrame − 30, startFrame + 270]` (a 300-frame / 5-second window), samples every 4th frame (Melee 60Hz → 15Hz playback) for ~75 samples per trace, and produces two `Float32Array`s of `[x0, y0, x1, y1, ...]` — one per player — plus metadata. The default renderer tail length is 45 samples (~3s), so the head always has history to fade behind it and never fills the full window.

```ts
export interface HighlightTrace {
  stageId: number;
  stageName: string;
  /** Decimated to 15Hz, ~75 samples for a 5-second window */
  aggressor: Float32Array;
  victim: Float32Array;
  /** Length of each player array / 2, in samples */
  sampleCount: number;
  durationMs: number;
  meta: {
    replayPath: string;
    aggressorChar: string;
    victimChar: string;
    type: string; // highlight type from the DB
    label: string; // "Zero to Death", "Spike Kill", etc.
  };
}

export function extractHighlightTrace(
  game: SlippiGame,
  startFrame: number,
  aggressorPort: number,
  victimPort: number,
  replayPath: string,
  meta: Pick<HighlightTrace["meta"], "aggressorChar" | "victimChar" | "type" | "label">,
): HighlightTrace;
```

The extractor uses `Frames.FIRST_PLAYABLE` as the floor for the start range, clamps the end to `stats.lastFrame`, skips missing frames, and handles ports 0–3 via the raw `frame.players[portIndex].post` slot access documented in `CLAUDE.md`. Aggressor is always resolved to the `[0]` slot in the output so the renderer never thinks about port indices.

### 2. Stage geometry (main process)

**File:** `src/pipeline/stageGeometry.ts` (new)

A static object keyed by Slippi stage id (2, 3, 8, 28, 31, 32) with:

- `mainFloor`: `{ x: [left, right], y: number }` — the top surface of the main stage.
- `sidePlatforms`: `Array<{ x: [left, right], y: number }>` — one entry per side platform.
- `topPlatform`: `{ x: [left, right], y: number } | null` — Battlefield/Dreamland/Yoshi's only.
- `blastZones`: `{ x: [left, right], y: [bottom, top] }` — the outer kill boundary rectangle.

Numbers are community-standard (UnclePunch / SSBM Tournament stages JSON). These are the values cited in the research digest and will be verified against a second source before landing. The table is small (~6 entries × 4 fields) and ships as a plain TS object.

A helper `makeProjector(stageId, viewportWidth, viewportHeight)` returns a function `(worldX, worldY) => [screenX, screenY]` that maps Melee world coordinates (centered, Y-up) to canvas pixel coordinates (top-left origin, Y-down), with automatic letterboxing to preserve aspect ratio.

### 3. IPC handler (main process)

**File:** `src/main/handlers/analysis.ts` (existing — adds a new handler)

```ts
ipcMain.handle("analysis:getRecentWinTraces", async (_e, limit = 5): Promise<HighlightTrace[]> => { ... });
```

Flow:

1. Read target player from `loadConfig()`.
2. Query the highlights DB via a new `getRecentWinHighlightsForPlayer(targetTag, limit)` helper in `src/db.ts`. Joins `highlights` to `games` to get `replay_path`, filters to highlights where the target player was the aggressor (the highlights row's `character` column matches the target player's character on that game), orders by `games.played_at DESC`. Excludes highlight types `four-stock`, `jv5`, `jv4`, `comeback` — those use `startFrame: 0` and have no useful motion range. If no target player is configured, the helper returns an empty array and the handler short-circuits.
3. For each returned row: parse the replay via `parsePool.parse()` (worker-pooled), resolve the aggressor/victim ports by matching the stored characters against `gameSummary.players`, call `extractHighlightTrace()`, push to result.
4. Return the array. Errors during individual highlight extraction are swallowed and the failed entry is skipped (the layer just plays whatever traces succeeded).
5. `limit` is capped at 5 in the handler itself to prevent runaway parses.

Preload exposes this via `window.clippi.getRecentWinTraces(limit?)`.

### 4. Renderer component

**File:** `src/renderer/components/ReplayMotionLayer.tsx` (new)

Props:

```ts
interface ReplayMotionLayerProps {
  traces: HighlightTrace[];
  /** How many decimated samples of tail to show behind the head. Default 45 (~3s). */
  tailLength?: number;
}
```

Internal state (refs, no React re-renders during animation):

- `canvasRef` — the foreground canvas.
- `stageBgRef` — offscreen canvas with the pre-drawn stage wireframe, rebuilt on trace swap.
- `rafRef` — the current `requestAnimationFrame` id.
- `visibleRef` — `true` when intersecting, gated by IntersectionObserver.
- `traceIdxRef`, `sampleRef` — which trace and which sample we're on.
- `crossfadeRef` — a `{ from, to, startedAt }` for the 400ms crossfade between traces.

Lifecycle:

1. On mount, size the canvas to its container with `dpr = Math.min(devicePixelRatio, 2)`. Attach IntersectionObserver. Build the initial offscreen stage wireframe.
2. Start the rAF loop. Each tick:
   - Return early if `!visibleRef.current`.
   - Throttle to 30Hz render rate (sample advance at 15Hz).
   - `clearRect`, `drawImage(stageBgRef.current, 0, 0)` to paint the stage.
   - Call `drawTrail(ctx, trace.aggressor, sample, tailLength, proj, winColor)` and the same for `victim` with loss color.
   - Advance the sample index. On trace end, kick off a crossfade to the next trace (loop modulo `traces.length`), and rebuild the offscreen stage if the new trace is a different stage.
3. On unmount, cancel rAF and disconnect IO.

Theme colors are read via `getComputedStyle(canvas).getPropertyValue("--win" | "--loss" | "--text-dim" | "--accent-glow")` whenever a trace is loaded. A small effect listens for `data-theme` attribute changes on `documentElement` via a MutationObserver so theme swaps refresh colors mid-animation.

The trail drawing function taper is documented in the research digest: radius `0.6 + t * 2.4` and opacity `t²` where `t` is the newness (1.0 = head, 0.0 = oldest tail sample). This gives a punchy head and a fading wisp instead of a scatter plot.

### 5. Profile page integration

**File:** `src/renderer/pages/Profile.tsx`

The `.profile-record-card` gains `position: relative` and `overflow: hidden`. A new child `<div class="profile-record-bg">` is inserted as the first child with `position: absolute; inset: 0; z-index: 0` and hosts the `<ReplayMotionLayer>`. The existing `.profile-record-big` and `.profile-record-sub` get wrapped in a new `<div class="profile-record-fg">` with `position: relative; z-index: 1; isolation: isolate` so the `mix-blend-mode` on the canvas layer can't contaminate the foreground text.

Traces are fetched via a new `useRecentWinTraces(5)` hook (added to `src/renderer/hooks/queries.ts` following the existing react-query pattern). While loading or empty, `ReplayMotionLayer` simply renders nothing and the card falls back to its current empty state.

### 6. CSS

**File:** `src/renderer/styles/components.css` (appended)

```css
.profile-record-card {
  position: relative;
  overflow: hidden;
}
.profile-record-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  will-change: transform;
}
.profile-record-fg {
  position: relative;
  z-index: 1;
  isolation: isolate;
}
.replay-motion-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.22;
  mix-blend-mode: screen;
  filter: drop-shadow(0 0 6px var(--accent-glow, transparent));
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .replay-motion-layer {
    display: none;
  }
}
```

## Data flow

```
Profile.tsx (mount)
    └─ useRecentWinTraces(5)
        └─ window.clippi.getRecentWinTraces(5)
            └─ IPC "analysis:getRecentWinTraces"
                ├─ db.getRecentWinHighlightsForPlayer(tag, 5)
                └─ for each row:
                    ├─ parsePool.parse(replayPath)
                    ├─ resolve aggressor/victim ports from stored characters
                    └─ extractHighlightTrace(game, startFrame, ...)
    └─ <ReplayMotionLayer traces={...} />
        └─ canvas rAF loop
            ├─ stage offscreen wireframe (drawn once per trace)
            └─ per-frame: clearRect → drawImage(bg) → drawTrail(aggressor) → drawTrail(victim)
```

## Error handling

- **No recent highlights**: `traces` array is empty, component renders nothing, card looks like it does today. No error surfaced.
- **Replay file missing or unreadable**: individual `parsePool.parse()` call throws, the handler catches it per-row and skips. Rest of the highlights still render.
- **Stage id not in the v1 table**: `makeProjector()` returns null, that trace is filtered out before being passed to the component. A console warning names the unsupported stage so we can add it later.
- **`getFrames()` returns gaps or undefined entries**: extractor skips them (matches existing pipeline pattern at `playerSummary.ts:169`).
- **Canvas context creation fails** (ancient GPU / software compositing): the component's mount effect detects the null context and bails out without attaching rAF or IO, leaving the DOM canvas element empty. The card falls back to its current appearance.
- **Theme change mid-animation**: MutationObserver re-reads CSS vars, next draw frame uses new colors. No crash, no restart.

## Performance budget

- **Parse + extract**: ~80–250ms per replay on a modern machine (one-off at hook load, worker-pooled, max 5 replays). Fetched once on Profile mount, cached in react-query for the session.
- **In-memory per trace**: ~75 samples × 2 players × 2 floats × 4 bytes = 1200 bytes per trace. 5 traces ≈ 6KB. Negligible.
- **Render loop**: 30Hz frame rate, ~90 `arc()` calls per frame (45 tail samples × 2 players), `clearRect`, one `drawImage` of the ~400×300 offscreen stage. Well inside compositor budget.
- **IntersectionObserver** pauses the loop entirely when the card scrolls offscreen.
- **rAF auto-pauses** when Electron window is hidden or minimized (Chromium default).
- **`devicePixelRatio` capped at 2** to prevent 4× fill cost on Retina at DPR=3.

## Testing

Automated:

- `src/pipeline/highlightTrace.test.ts` — given a known test replay from `test-replays/`, assert the extracted trace has the expected sample count (~75 samples for a standard window), non-null aggressor/victim arrays, and player positions within the stage's coarse bounds. Uses vitest (already the project's test runner per `npm test`) and mirrors the fixture-loading pattern from existing pipeline tests.
- `src/pipeline/stageGeometry.test.ts` — unit test `makeProjector()` for each of the 6 stages with a known world point → expected screen point (simple math, catches off-by-one axis flips).

Manual:

- Visual verification across all 6 stages using the stages the user has games on. The user runs dev mode, switches to Profile, confirms the background is visibly playing highlight motion, and confirms win/loss numbers remain legible.
- Theme switch — verify trail colors update without restart.
- Scroll the page — verify the animation pauses when the card is off-screen (no GPU in devtools perf tab).
- No test replays for a stage → the trace for that game is skipped, app does not crash.
- Empty DB / new install → card renders its current empty state.

## Open questions

None blocking v1. Flagged for v2 consideration:

- Whether to eventually backfill `end_frame` in a DB migration so we can use the real conversion window instead of the padded one. The padded 5-second window is slightly long for some highlights (e.g., spike kills which finish in ~1s) but the extra frames of "nothing happening" at the tail are invisible at 0.22 opacity.
- Whether to add a per-character color palette (Fox blue laser, Marth red sword, Falco orange) as a v2 visual upgrade, replacing the win/loss green/red.
- Whether to cache extracted traces to disk so subsequent Profile loads skip the re-parse. v1 caches in memory via react-query for session lifetime only, which is probably enough.

## Files touched

New:

- `src/pipeline/highlightTrace.ts`
- `src/pipeline/stageGeometry.ts`
- `src/pipeline/highlightTrace.test.ts`
- `src/pipeline/stageGeometry.test.ts`
- `src/renderer/components/ReplayMotionLayer.tsx`
- `src/renderer/hooks/queries.ts` — add `useRecentWinTraces` hook (file already exists)

Modified:

- `src/main/handlers/analysis.ts` — add `analysis:getRecentWinTraces` IPC handler
- `src/db.ts` — add `getRecentWinHighlightsForPlayer()` query helper
- `src/preload/index.ts` — expose `getRecentWinTraces` on `window.clippi`
- `src/renderer/pages/Profile.tsx` — wrap record card children in bg/fg divs, mount `<ReplayMotionLayer>`
- `src/renderer/styles/components.css` — append new rules for the stacking context + layer

## References

- Research digest (in conversation) — Slippi data extraction and motion graphics execution.
- `CLAUDE.md` — slippi-js conversion semantics, project architecture.
- `src/pipeline/playerSummary.ts:160–250` — per-frame walking + delta detection patterns to mirror.
- `src/main/handlers/stockTimeline.ts` — template for an IPC handler that reads .slp via `parsePool`.
- `src/renderer/components/StockTimeline.tsx` — existing reference for a canvas-style visualization component in this codebase.
- slippilab (frankborden) — prior art on Canvas-based .slp viewer.
- F1-RACEREPLAY (Astrageguyonthemoon) — prior art on "moving dot tracing a venue outline."
