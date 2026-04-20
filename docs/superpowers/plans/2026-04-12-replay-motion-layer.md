# Replay Motion Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play recent win-highlight position traces as an abstract CAD-style motion graphic behind the Profile page's win/loss card, using Canvas 2D and the existing Slippi replay data.

**Architecture:** Three main-process units (pure extractor, static stage geometry table, new IPC handler that directly parses replays on demand), three renderer units (Canvas component with rAF loop + IntersectionObserver, react-query hook, Profile integration with bg/fg stacking context). No changes to parsePool — handler uses `new SlippiGame()` synchronously for the one-off 5-replay fetch on Profile mount.

**Tech Stack:** TypeScript strict, `@slippi/slippi-js/node`, better-sqlite3, Electron IPC (`safeHandle`), React, `@tanstack/react-query`, Canvas 2D, vitest.

**Spec:** `docs/superpowers/specs/2026-04-12-replay-motion-layer-design.md`

---

## File Structure

**New files:**

- `src/pipeline/stageGeometry.ts` — Static geometry table for the 6 legal stages + `makeProjector()` world→screen mapping.
- `src/pipeline/stageGeometry.test.ts` — Unit tests for table lookup and projector math.
- `src/pipeline/highlightTrace.ts` — `extractHighlightTrace(game, startFrame, aggressorPort, victimPort, meta)` pure function. Walks frames, decimates to 15Hz, returns `Float32Array` position buffers.
- `src/pipeline/highlightTrace.test.ts` — Unit tests for frame walk, decimation, port resolution.
- `src/renderer/components/ReplayMotionLayer.tsx` — Canvas component with rAF loop, IntersectionObserver pause, crossfade, theme MutationObserver.

**Modified files:**

- `src/db.ts` — Add `getRecentWinHighlightsForPlayer(targetTag, limit)` helper around line 1878 (next to existing `getRecentHighlights`).
- `src/main/handlers/analysis.ts` — Add `analysis:getRecentWinTraces` handler inside `registerAnalysisHandlers`.
- `src/preload/index.ts` — Expose `getRecentWinTraces` on `window.clippi`.
- `src/renderer/hooks/queries.ts` — Add `useRecentWinTraces` hook.
- `src/renderer/pages/Profile.tsx` — Wrap record card children in bg/fg divs, mount `<ReplayMotionLayer>`.
- `src/renderer/styles/components.css` — Append new rules for stacking context + layer.

---

### Task 1: Stage geometry table

**Files:**

- Create: `src/pipeline/stageGeometry.ts`
- Test: `src/pipeline/stageGeometry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/pipeline/stageGeometry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { STAGE_GEOMETRY, getStageGeometry } from "./stageGeometry.js";

describe("STAGE_GEOMETRY", () => {
  it("covers all 6 tournament-legal stages", () => {
    expect(STAGE_GEOMETRY[2]).toBeDefined(); // FoD
    expect(STAGE_GEOMETRY[3]).toBeDefined(); // Stadium
    expect(STAGE_GEOMETRY[8]).toBeDefined(); // Yoshi's
    expect(STAGE_GEOMETRY[28]).toBeDefined(); // Dreamland
    expect(STAGE_GEOMETRY[31]).toBeDefined(); // Battlefield
    expect(STAGE_GEOMETRY[32]).toBeDefined(); // Final Destination
  });

  it("has a top platform on Battlefield but not FD", () => {
    expect(STAGE_GEOMETRY[31]!.topPlatform).not.toBeNull();
    expect(STAGE_GEOMETRY[32]!.topPlatform).toBeNull();
  });

  it("has symmetric main floor bounds (left = -right)", () => {
    for (const g of Object.values(STAGE_GEOMETRY)) {
      const [left, right] = g.mainFloor.x;
      expect(left).toBeCloseTo(-right, 1);
    }
  });

  it("getStageGeometry returns null for unsupported stages", () => {
    expect(getStageGeometry(4)).toBeNull(); // Kongo Jungle — not supported
  });

  it("getStageGeometry returns the entry for supported stages", () => {
    const fd = getStageGeometry(32);
    expect(fd).not.toBeNull();
    expect(fd!.name).toBe("Final Destination");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx vitest run src/pipeline/stageGeometry.test.ts`
Expected: FAIL with "Cannot find module './stageGeometry.js'"

- [ ] **Step 3: Create the stage geometry module**

Create `src/pipeline/stageGeometry.ts`:

```ts
/**
 * Static geometry for the 6 tournament-legal Melee stages.
 * Used to render stage outlines as CAD-style wireframes behind replay motion graphics.
 *
 * All coordinates are in Melee world space: (0, 0) is the center of the main stage,
 * +x is right, +y is UP (math convention, NOT screen convention).
 * Numbers are community-standard values from UnclePunch / SSBM Tournament geometry dumps.
 *
 * Dynamic platform behavior (FoD oscillation, Stadium transformations, Whispy wind)
 * is intentionally NOT modeled — v1 renders static outlines only.
 */

export interface StageGeometry {
  id: number;
  name: string;
  /** Top surface of the main stage. `x: [left, right]`, `y: floor level`. */
  mainFloor: { x: [number, number]; y: number };
  /** Side platforms (0–2 per stage). */
  sidePlatforms: Array<{ x: [number, number]; y: number }>;
  /** Top platform — Battlefield, Dreamland, Yoshi's, FoD, Stadium. FD has none. */
  topPlatform: { x: [number, number]; y: number } | null;
  /** Outer kill boundary rectangle. */
  blastZones: { x: [number, number]; y: [number, number] };
}

export const STAGE_GEOMETRY: Record<number, StageGeometry> = {
  2: {
    id: 2,
    name: "Fountain of Dreams",
    mainFloor: { x: [-63.4, 63.4], y: 0 },
    sidePlatforms: [
      { x: [-49.5, -21.5], y: 16.125 },
      { x: [21.5, 49.5], y: 16.125 },
    ],
    topPlatform: { x: [-14.25, 14.25], y: 42.75 },
    blastZones: { x: [-198.75, 198.75], y: [-146.25, 202.5] },
  },
  3: {
    id: 3,
    name: "Pokémon Stadium",
    mainFloor: { x: [-87.75, 87.75], y: 0 },
    sidePlatforms: [
      { x: [-55, -25], y: 25 },
      { x: [25, 55], y: 25 },
    ],
    topPlatform: null,
    blastZones: { x: [-230, 230], y: [-111, 180] },
  },
  8: {
    id: 8,
    name: "Yoshi's Story",
    mainFloor: { x: [-56, 56], y: 0 },
    sidePlatforms: [
      { x: [-59.5, -28], y: 23.45 },
      { x: [28, 59.5], y: 23.45 },
    ],
    topPlatform: { x: [-15.75, 15.75], y: 42 },
    blastZones: { x: [-175.7, 173.6], y: [-91, 168] },
  },
  28: {
    id: 28,
    name: "Dreamland",
    mainFloor: { x: [-77.27, 77.27], y: 0 },
    sidePlatforms: [
      { x: [-57.4, -19.02], y: 30.2422 },
      { x: [19.02, 57.4], y: 30.2422 },
    ],
    topPlatform: { x: [-19.02, 19.02], y: 51.4252 },
    blastZones: { x: [-255, 255], y: [-123, 250] },
  },
  31: {
    id: 31,
    name: "Battlefield",
    mainFloor: { x: [-68.4, 68.4], y: 0 },
    sidePlatforms: [
      { x: [-57.6, -20], y: 27.2 },
      { x: [20, 57.6], y: 27.2 },
    ],
    topPlatform: { x: [-18.8, 18.8], y: 54.4 },
    blastZones: { x: [-224, 224], y: [-108.8, 200] },
  },
  32: {
    id: 32,
    name: "Final Destination",
    mainFloor: { x: [-85.6, 85.6], y: 0 },
    sidePlatforms: [],
    topPlatform: null,
    blastZones: { x: [-246, 246], y: [-140, 188] },
  },
};

export function getStageGeometry(stageId: number): StageGeometry | null {
  return STAGE_GEOMETRY[stageId] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx vitest run src/pipeline/stageGeometry.test.ts`
Expected: PASS — all 5 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/stageGeometry.ts src/pipeline/stageGeometry.test.ts
git -c commit.gpgsign=false commit -m "Add static stage geometry for legal stages"
```

---

### Task 2: World → screen projector

**Files:**

- Modify: `src/pipeline/stageGeometry.ts`
- Modify: `src/pipeline/stageGeometry.test.ts`

- [ ] **Step 1: Append failing tests**

Add to `src/pipeline/stageGeometry.test.ts`:

```ts
import { makeProjector } from "./stageGeometry.js";

describe("makeProjector", () => {
  it("returns null for unsupported stages", () => {
    expect(makeProjector(99, 400, 300)).toBeNull();
  });

  it("maps Battlefield center (0,0) to viewport center", () => {
    const proj = makeProjector(31, 400, 300)!;
    const [sx, sy] = proj(0, 0);
    expect(sx).toBeCloseTo(200, 0);
    expect(sy).toBeCloseTo(150, 0);
  });

  it("maps positive world y to smaller screen y (Y-up to Y-down flip)", () => {
    const proj = makeProjector(31, 400, 300)!;
    const [, center] = proj(0, 0);
    const [, above] = proj(0, 50);
    expect(above).toBeLessThan(center);
  });

  it("maps positive world x to larger screen x", () => {
    const proj = makeProjector(31, 400, 300)!;
    const [center] = proj(0, 0);
    const [right] = proj(50, 0);
    expect(right).toBeGreaterThan(center);
  });

  it("letterboxes — horizontal viewport leaves vertical slack", () => {
    // Battlefield blast zones are 448 wide x 308.8 tall.
    // A 400x300 viewport is ~1.33 aspect; stage is ~1.45 — letterbox top/bottom.
    const proj = makeProjector(31, 400, 300)!;
    const [, topBlast] = proj(0, 200); // top blast zone in world
    const [, botBlast] = proj(0, -108.8); // bottom blast zone in world
    // Both should be INSIDE [0,300] (letterboxed vertically), not clamped.
    expect(topBlast).toBeGreaterThan(0);
    expect(botBlast).toBeLessThan(300);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx vitest run src/pipeline/stageGeometry.test.ts`
Expected: FAIL — `makeProjector is not exported`.

- [ ] **Step 3: Implement makeProjector**

Append to `src/pipeline/stageGeometry.ts`:

```ts
/**
 * Build a world-to-screen projector for a given stage and viewport.
 * Maps Melee world coordinates (center origin, Y-up) to canvas pixel
 * coordinates (top-left origin, Y-down), preserving aspect ratio via
 * letterboxing (centered, with padding on the shorter axis).
 *
 * Returns null if the stage id is unsupported.
 */
export function makeProjector(
  stageId: number,
  viewportWidth: number,
  viewportHeight: number,
): ((worldX: number, worldY: number) => [number, number]) | null {
  const geo = getStageGeometry(stageId);
  if (!geo) return null;

  const [bxMin, bxMax] = geo.blastZones.x;
  const [byMin, byMax] = geo.blastZones.y;
  const worldW = bxMax - bxMin;
  const worldH = byMax - byMin;

  // Fit-inside: use the smaller scale so nothing clips, center the shorter axis.
  const scale = Math.min(viewportWidth / worldW, viewportHeight / worldH);
  const drawW = worldW * scale;
  const drawH = worldH * scale;
  const offsetX = (viewportWidth - drawW) / 2;
  const offsetY = (viewportHeight - drawH) / 2;

  return (worldX: number, worldY: number): [number, number] => {
    const normX = (worldX - bxMin) / worldW; // 0..1 left to right
    const normY = 1 - (worldY - byMin) / worldH; // 0..1 top to bottom (flip Y)
    return [offsetX + normX * drawW, offsetY + normY * drawH];
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx vitest run src/pipeline/stageGeometry.test.ts`
Expected: PASS — all 10 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/stageGeometry.ts src/pipeline/stageGeometry.test.ts
git -c commit.gpgsign=false commit -m "Add makeProjector for world-to-screen stage mapping"
```

---

### Task 3: Highlight trace extractor

**Files:**

- Create: `src/pipeline/highlightTrace.ts`
- Test: `src/pipeline/highlightTrace.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/pipeline/highlightTrace.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SlippiGame } from "@slippi/slippi-js/node";
import { readdirSync } from "fs";
import { join } from "path";
import { extractHighlightTrace } from "./highlightTrace.js";

const REPLAYS_DIR = join(__dirname, "../../test-replays");

function getFirstReplay(): string {
  const files = readdirSync(REPLAYS_DIR).filter((f) => f.endsWith(".slp"));
  if (files.length === 0) throw new Error("No test replays found");
  return join(REPLAYS_DIR, files[0]!);
}

describe("extractHighlightTrace", () => {
  it("returns float32 buffers and metadata for a real replay", () => {
    const replayPath = getFirstReplay();
    const game = new SlippiGame(replayPath);
    const stats = game.getStats();
    if (!stats) throw new Error("stats unavailable");

    const settings = game.getSettings();
    if (!settings) throw new Error("settings unavailable");
    const ports = settings.players.map((p) => p.playerIndex);
    const [aggressorPort, victimPort] = [ports[0]!, ports[1]!];

    // Pick a frame in the middle of the playable range
    const midFrame = Math.floor(stats.lastFrame / 2);

    const trace = extractHighlightTrace(game, midFrame, aggressorPort, victimPort, replayPath, {
      aggressorChar: "Fox",
      victimChar: "Marth",
      type: "test",
      label: "Test",
    });

    expect(trace.aggressor).toBeInstanceOf(Float32Array);
    expect(trace.victim).toBeInstanceOf(Float32Array);
    expect(trace.sampleCount).toBeGreaterThan(0);
    expect(trace.aggressor.length).toBe(trace.sampleCount * 2);
    expect(trace.victim.length).toBe(trace.sampleCount * 2);
    expect(trace.stageId).toBe(settings.stageId);
    expect(trace.meta.replayPath).toBe(replayPath);
    expect(trace.meta.type).toBe("test");
    expect(trace.durationMs).toBeGreaterThan(0);
  });

  it("decimates to 15Hz — ~75 samples for a 300-frame window", () => {
    const replayPath = getFirstReplay();
    const game = new SlippiGame(replayPath);
    const stats = game.getStats();
    const settings = game.getSettings();
    if (!stats || !settings) throw new Error("game data unavailable");

    // Ensure we pick a frame with room for the full window on both sides
    const startFrame = Math.max(60, Math.floor(stats.lastFrame / 2));
    const ports = settings.players.map((p) => p.playerIndex);

    const trace = extractHighlightTrace(game, startFrame, ports[0]!, ports[1]!, replayPath, {
      aggressorChar: "Fox",
      victimChar: "Marth",
      type: "test",
      label: "Test",
    });

    // 300 frames / 4 = 75 samples (with some slack for clamping at edges)
    expect(trace.sampleCount).toBeGreaterThanOrEqual(60);
    expect(trace.sampleCount).toBeLessThanOrEqual(76);
  });

  it("positions fall inside the stage's coarse bounds", () => {
    const replayPath = getFirstReplay();
    const game = new SlippiGame(replayPath);
    const stats = game.getStats();
    const settings = game.getSettings();
    if (!stats || !settings) throw new Error("game data unavailable");

    const startFrame = Math.max(60, Math.floor(stats.lastFrame / 2));
    const ports = settings.players.map((p) => p.playerIndex);

    const trace = extractHighlightTrace(game, startFrame, ports[0]!, ports[1]!, replayPath, {
      aggressorChar: "Fox",
      victimChar: "Marth",
      type: "test",
      label: "Test",
    });

    // Sanity: all x positions within a very generous envelope
    for (let i = 0; i < trace.aggressor.length; i += 2) {
      const x = trace.aggressor[i]!;
      const y = trace.aggressor[i + 1]!;
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Math.abs(x)).toBeLessThan(500); // way outside any blast zone
      expect(Math.abs(y)).toBeLessThan(500);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx vitest run src/pipeline/highlightTrace.test.ts`
Expected: FAIL with "Cannot find module './highlightTrace.js'"

- [ ] **Step 3: Implement the extractor**

Create `src/pipeline/highlightTrace.ts`:

```ts
import type { SlippiGame } from "@slippi/slippi-js/node";
import { Frames } from "@slippi/slippi-js/node";
import { getStageGeometry } from "./stageGeometry.js";

/** Playback window relative to the highlight's start frame. */
const PRE_ROLL_FRAMES = 30; // 0.5s before the highlight
const POST_ROLL_FRAMES = 270; // 4.5s after
const SAMPLE_STRIDE = 4; // 60Hz → 15Hz

export interface HighlightTrace {
  stageId: number;
  stageName: string;
  /** Decimated to 15Hz, ~75 samples for a 5-second window. Flat `[x0,y0,x1,y1,...]`. */
  aggressor: Float32Array;
  victim: Float32Array;
  /** Length of each player array / 2, in samples. */
  sampleCount: number;
  durationMs: number;
  meta: {
    replayPath: string;
    aggressorChar: string;
    victimChar: string;
    type: string;
    label: string;
  };
}

/**
 * Walk a highlight's frame range and build decimated position buffers.
 * Aggressor is always stored in the `[0]` slot — the renderer never sees raw ports.
 *
 * Skips gaps and dead-player frames (matches the pattern in playerSummary.ts).
 */
export function extractHighlightTrace(
  game: SlippiGame,
  startFrame: number,
  aggressorPort: number,
  victimPort: number,
  replayPath: string,
  meta: Pick<HighlightTrace["meta"], "aggressorChar" | "victimChar" | "type" | "label">,
): HighlightTrace {
  const settings = game.getSettings();
  const stats = game.getStats();
  if (!settings || !stats) {
    throw new Error(`Replay has no settings or stats: ${replayPath}`);
  }

  const stageId = settings.stageId ?? 0;
  const geo = getStageGeometry(stageId);
  const stageName = geo?.name ?? `Stage ${stageId}`;

  const frames = game.getFrames();
  const firstPlayable = Frames.FIRST_PLAYABLE;
  const lastFrame = stats.lastFrame;

  const rangeStart = Math.max(firstPlayable, startFrame - PRE_ROLL_FRAMES);
  const rangeEnd = Math.min(lastFrame, startFrame + POST_ROLL_FRAMES);

  // Collect samples first into plain arrays, then pack into Float32Array at the end.
  const aggX: number[] = [];
  const aggY: number[] = [];
  const vicX: number[] = [];
  const vicY: number[] = [];

  for (let f = rangeStart; f <= rangeEnd; f += SAMPLE_STRIDE) {
    const fd = frames[f];
    if (!fd) continue;

    const aggData = fd.players[aggressorPort]?.post;
    const vicData = fd.players[victimPort]?.post;
    if (!aggData || !vicData) continue;

    // Skip frames where a player is dead-and-waiting (same guard as playerSummary.ts:172)
    if (
      aggData.stocksRemaining != null &&
      aggData.stocksRemaining <= 0 &&
      vicData.stocksRemaining != null &&
      vicData.stocksRemaining <= 0
    )
      continue;

    const ax = aggData.positionX;
    const ay = aggData.positionY;
    const vx = vicData.positionX;
    const vy = vicData.positionY;
    if (
      ax == null ||
      ay == null ||
      vx == null ||
      vy == null ||
      !Number.isFinite(ax) ||
      !Number.isFinite(ay) ||
      !Number.isFinite(vx) ||
      !Number.isFinite(vy)
    )
      continue;

    aggX.push(ax);
    aggY.push(ay);
    vicX.push(vx);
    vicY.push(vy);
  }

  const sampleCount = aggX.length;
  const aggressor = new Float32Array(sampleCount * 2);
  const victim = new Float32Array(sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    aggressor[i * 2] = aggX[i]!;
    aggressor[i * 2 + 1] = aggY[i]!;
    victim[i * 2] = vicX[i]!;
    victim[i * 2 + 1] = vicY[i]!;
  }

  // 60Hz base, 1 sample = SAMPLE_STRIDE frames = SAMPLE_STRIDE/60 seconds
  const durationMs = Math.round(((sampleCount * SAMPLE_STRIDE) / 60) * 1000);

  return {
    stageId,
    stageName,
    aggressor,
    victim,
    sampleCount,
    durationMs,
    meta: {
      replayPath,
      ...meta,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx vitest run src/pipeline/highlightTrace.test.ts`
Expected: PASS — 3 assertions green. If the test-replays folder is empty, the tests will skip-fail; in that case copy at least one `.slp` file into `test-replays/` first.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/highlightTrace.ts src/pipeline/highlightTrace.test.ts
git -c commit.gpgsign=false commit -m "Add highlight trace extractor with decimated position buffers"
```

---

### Task 4: DB query helper

**Files:**

- Modify: `src/db.ts` (append helper after `getRecentHighlights` at line 1878)

- [ ] **Step 1: Read the existing helper for pattern reference**

Run: `cd C:/Users/MC/Desktop/TheMAGI && grep -n "getRecentHighlights" src/db.ts`
Confirm line ~1855. We'll insert the new helper directly below it.

- [ ] **Step 2: Add the helper**

In `src/db.ts`, insert after the closing `}` of `getRecentHighlights` (around line 1878):

```ts
export function getRecentWinHighlightsForPlayer(
  targetTag: string,
  limit: number = 5,
): (HighlightRow & {
  replayPath: string;
  stage: string;
  playedAt: string | null;
})[] {
  if (!targetTag) return [];

  // Wins only. Filters highlights where the target player was the aggressor —
  // matched by comparing highlights.character to games.player_character for wins.
  // Excludes "whole-game" highlight types whose start_frame is 0 (no useful motion range).
  const rows = getDb()
    .prepare(
      `
    SELECT h.id, h.game_id as gameId, h.type, h.label, h.description,
           h.character, h.victim,
           h.start_frame as startFrame, h.timestamp, h.damage,
           h.start_percent as startPercent,
           h.did_kill as didKill, h.moves_json, h.stock_number as stockNumber,
           g.replay_path as replayPath, g.stage, g.played_at as playedAt
    FROM highlights h
    JOIN games g ON g.id = h.game_id
    WHERE g.player_tag = ?
      AND g.result = 'win'
      AND h.character = g.player_character
      AND h.type NOT IN ('four-stock', 'jv5', 'jv4', 'comeback')
      AND h.start_frame > 0
    ORDER BY g.played_at DESC, h.start_frame ASC
    LIMIT ?
  `,
    )
    .all(targetTag, limit) as any[];

  return rows.map((r) => ({
    ...r,
    didKill: r.didKill === 1,
    moves: JSON.parse(r.moves_json) as string[],
  }));
}
```

- [ ] **Step 3: Type-check the change**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx tsc -p tsconfig.main.json --noEmit 2>&1 | head -20`
Expected: No output (clean type-check for main-process source). If errors mention `HighlightRow`, verify the import is already in scope at the top of `db.ts` — it's used by `getRecentHighlights` already so it should be.

- [ ] **Step 4: Sanity-run the existing db tests**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx vitest run src/db.test.ts 2>&1 | tail -20`
Expected: existing tests still pass (no regression from the new SELECT).

- [ ] **Step 5: Commit**

```bash
git add src/db.ts
git -c commit.gpgsign=false commit -m "Add getRecentWinHighlightsForPlayer db helper"
```

---

### Task 5: IPC handler

**Files:**

- Modify: `src/main/handlers/analysis.ts`

- [ ] **Step 1: Read the existing handler to see the registration pattern**

Run: `cd C:/Users/MC/Desktop/TheMAGI && grep -n "registerAnalysisHandlers\|safeHandle" src/main/handlers/analysis.ts | head -20`
Confirm `export function registerAnalysisHandlers(safeHandle: SafeHandleFn): void { ... }` and that it uses `safeHandle("analysis:xxx", ...)` for existing handlers.

- [ ] **Step 2: Add the imports at the top of `analysis.ts`**

At the top of `src/main/handlers/analysis.ts`, ensure these imports exist (add any that don't):

```ts
import { SlippiGame } from "@slippi/slippi-js/node";
import { getRecentWinHighlightsForPlayer } from "../../db.js";
import { extractHighlightTrace, type HighlightTrace } from "../../pipeline/highlightTrace.js";
import { getCharacterName } from "../../pipeline/helpers.js";
import { loadConfig } from "../../config.js";
```

Using the pipeline's own `getCharacterName(id)` helper (wraps `characterUtils.getCharacterShortName` from slippi-js) guarantees the character name format matches what the `highlights.character` column contains, because the pipeline populated that column using the same helper.

- [ ] **Step 3: Add the new handler inside `registerAnalysisHandlers`**

Inside the `registerAnalysisHandlers` function body, add:

```ts
safeHandle("analysis:getRecentWinTraces", async (_e, rawLimit?: number): Promise<HighlightTrace[]> => {
  const limit = Math.min(Math.max(1, rawLimit ?? 5), 5);

  const config = loadConfig();
  const targetTag = config.connectCode || config.targetPlayer || "";
  if (!targetTag) return [];

  const rows = getRecentWinHighlightsForPlayer(targetTag, limit);
  const traces: HighlightTrace[] = [];

  for (const row of rows) {
    try {
      const game = new SlippiGame(row.replayPath);
      const settings = game.getSettings();
      if (!settings) continue;

      // Resolve aggressor/victim ports: the highlight's `character` is the aggressor,
      // the `victim` is the opponent. Match them against the settings' player list
      // using the same getCharacterName helper that populated the highlights column.
      const players = settings.players;
      const aggressorPlayer = players.find((p) => getCharacterName(p.characterId) === row.character);
      const victimPlayer = players.find((p) => getCharacterName(p.characterId) === row.victim);
      if (!aggressorPlayer || !victimPlayer) continue;

      const trace = extractHighlightTrace(
        game,
        row.startFrame,
        aggressorPlayer.playerIndex,
        victimPlayer.playerIndex,
        row.replayPath,
        {
          aggressorChar: row.character,
          victimChar: row.victim,
          type: row.type,
          label: row.label,
        },
      );

      if (trace.sampleCount > 0) traces.push(trace);
    } catch (err) {
      console.warn(`[getRecentWinTraces] skipping highlight for ${row.replayPath}:`, err);
    }
  }

  return traces;
});
```

- [ ] **Step 4: Type-check**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx tsc -p tsconfig.main.json --noEmit 2>&1 | head -30`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/analysis.ts
git -c commit.gpgsign=false commit -m "Add analysis:getRecentWinTraces IPC handler"
```

---

### Task 6: Preload exposure

**Files:**

- Modify: `src/preload/index.ts`

- [ ] **Step 1: Read the existing preload to find the `clippi` object**

Run: `cd C:/Users/MC/Desktop/TheMAGI && grep -n "getStockTimeline\|stats:stockTimeline" src/preload/index.ts`
Note the line near where `getStockTimeline` is defined — we'll add ours immediately after.

- [ ] **Step 2: Add the new method**

`src/preload/index.ts` already exports `type ClippiAPI = typeof api` at the bottom of the file — the type is inferred from the `api` object literal, so adding a new entry to the object automatically updates the public type. No separate interface to maintain.

Add a new entry to the `api` object, alongside the existing Stock timeline entry (around line 59):

```ts
// Replay motion layer
getRecentWinTraces: (limit?: number) =>
  ipcRenderer.invoke("analysis:getRecentWinTraces", limit),
```

No explicit `import type { HighlightTrace }` needed at this layer — the return type is inferred as `Promise<any>` at the preload boundary, and the renderer re-types it via react-query's generic in Task 7.

- [ ] **Step 3: Type-check**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx tsc -p tsconfig.main.json --noEmit 2>&1 | head -20`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts
git -c commit.gpgsign=false commit -m "Expose getRecentWinTraces on window.clippi"
```

---

### Task 7: react-query hook

**Files:**

- Modify: `src/renderer/hooks/queries.ts`

- [ ] **Step 1: Append the hook after the existing ones**

At the end of `src/renderer/hooks/queries.ts` (before any `export type` blocks at the bottom if present), add:

```ts
export const useRecentWinTraces = (limit: number = 5) => {
  return useQuery({
    queryKey: ["recentWinTraces", limit],
    queryFn: () => window.clippi.getRecentWinTraces(limit),
    gcTime: GC_10MIN,
    // Traces are ~6KB total — cheap to cache. Stale after 2 minutes so new wins bubble up.
    staleTime: 1000 * 60 * 2,
  });
};
```

- [ ] **Step 2: Type-check the renderer**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "proxy/worker" | head -20`
Expected: clean (ignore the pre-existing `proxy/worker.ts` errors unrelated to this change).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/hooks/queries.ts
git -c commit.gpgsign=false commit -m "Add useRecentWinTraces react-query hook"
```

---

### Task 8: ReplayMotionLayer component

**Files:**

- Create: `src/renderer/components/ReplayMotionLayer.tsx`

- [ ] **Step 1: Create the component file**

Create `src/renderer/components/ReplayMotionLayer.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { getStageGeometry, makeProjector, type StageGeometry } from "../../pipeline/stageGeometry";
import type { HighlightTrace } from "../../pipeline/highlightTrace";

interface ReplayMotionLayerProps {
  traces: HighlightTrace[];
  /** How many decimated samples of tail to show behind the head. Default 45 (~3s). */
  tailLength?: number;
}

/** ms to hold each trace before crossfading to the next */
const HOLD_MS = 8000;
/** ms for the crossfade itself */
const FADE_MS = 400;
/** render rate in Hz */
const RENDER_HZ = 30;
/** sample advance rate in Hz (matches extractor stride of 60/4 = 15) */
const SAMPLE_HZ = 15;

function drawStageOffscreen(
  geo: StageGeometry,
  proj: (x: number, y: number) => [number, number],
  w: number,
  h: number,
  color: string,
): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.7;

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    const [a, b] = proj(x1, y1);
    const [c, d] = proj(x2, y2);
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(c, d);
    ctx.stroke();
  };

  // Main floor (horizontal line across the top surface)
  drawLine(geo.mainFloor.x[0], geo.mainFloor.y, geo.mainFloor.x[1], geo.mainFloor.y);

  // Side platforms
  for (const plat of geo.sidePlatforms) {
    drawLine(plat.x[0], plat.y, plat.x[1], plat.y);
  }

  // Top platform
  if (geo.topPlatform) {
    drawLine(geo.topPlatform.x[0], geo.topPlatform.y, geo.topPlatform.x[1], geo.topPlatform.y);
  }

  // Blast zone rectangle (very faint)
  ctx.globalAlpha = 0.15;
  const [bxMin, bxMax] = geo.blastZones.x;
  const [byMin, byMax] = geo.blastZones.y;
  drawLine(bxMin, byMin, bxMax, byMin);
  drawLine(bxMax, byMin, bxMax, byMax);
  drawLine(bxMax, byMax, bxMin, byMax);
  drawLine(bxMin, byMax, bxMin, byMin);

  return cv;
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  pts: Float32Array,
  head: number,
  tail: number,
  proj: (x: number, y: number) => [number, number],
  color: string,
  globalAlpha: number,
): void {
  const sampleCount = pts.length / 2;
  if (sampleCount === 0) return;

  // Draw from oldest (k=tail-1) to newest (k=0) so the head is painted last.
  for (let k = tail - 1; k >= 0; k--) {
    const i = head - k;
    if (i < 0) continue; // before the trace started — no wraparound
    const t = 1 - k / tail; // 0 at oldest, 1 at head
    const radius = 0.6 + t * 2.4;
    const alpha = t * t * 0.9 * globalAlpha;
    const [px, py] = proj(pts[i * 2]!, pts[i * 2 + 1]!);
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function ReplayMotionLayer({ traces, tailLength = 45 }: ReplayMotionLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (traces.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
    });
    io.observe(canvas);

    // State closed over the rAF loop
    let traceIdx = 0;
    let sample = 0;
    let traceStartMs = performance.now();
    let rafId = 0;
    let lastRenderMs = 0;
    let stageBg: HTMLCanvasElement | null = null;
    let currentProj: ((x: number, y: number) => [number, number]) | null = null;
    const FRAME_MS = 1000 / RENDER_HZ;

    // Theme colors — re-read when the theme attribute changes.
    let winColor = "#4ade80";
    let lossColor = "#f87171";
    let stageColor = "#94a3b8";
    const readColors = () => {
      const cs = getComputedStyle(canvas);
      winColor = cs.getPropertyValue("--win").trim() || "#4ade80";
      lossColor = cs.getPropertyValue("--loss").trim() || "#f87171";
      stageColor = cs.getPropertyValue("--text-muted").trim() || "#94a3b8";
    };
    readColors();

    const themeObserver = new MutationObserver(() => {
      readColors();
      // Rebuild stage bg so the new color takes effect next frame.
      stageBg = null;
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const prepareTrace = (t: HighlightTrace) => {
      const geo = getStageGeometry(t.stageId);
      if (!geo) {
        stageBg = null;
        currentProj = null;
        return;
      }
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      currentProj = makeProjector(t.stageId, cssW, cssH);
      stageBg = currentProj ? drawStageOffscreen(geo, currentProj, cssW, cssH, stageColor) : null;
    };
    prepareTrace(traces[0]!);

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);
      if (!visible) return;
      if (now - lastRenderMs < FRAME_MS) return;
      lastRenderMs = now;

      const trace = traces[traceIdx];
      if (!trace) return;

      // Advance sample index at SAMPLE_HZ (one per ~66ms).
      const elapsed = now - traceStartMs;
      const samplesIntoTrace = Math.floor((elapsed / 1000) * SAMPLE_HZ);
      sample = Math.min(samplesIntoTrace, trace.sampleCount - 1);

      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      ctx.clearRect(0, 0, cssW, cssH);

      // Crossfade: fade out tail end of the hold, fade in start.
      let alpha = 1;
      if (elapsed < FADE_MS) {
        alpha = elapsed / FADE_MS;
      } else if (elapsed > HOLD_MS - FADE_MS) {
        alpha = Math.max(0, (HOLD_MS - elapsed) / FADE_MS);
      }

      if (stageBg) ctx.drawImage(stageBg, 0, 0);
      if (currentProj) {
        drawTrail(ctx, trace.aggressor, sample, tailLength, currentProj, winColor, alpha);
        drawTrail(ctx, trace.victim, sample, tailLength, currentProj, lossColor, alpha);
      }

      if (elapsed >= HOLD_MS) {
        traceIdx = (traceIdx + 1) % traces.length;
        sample = 0;
        traceStartMs = now;
        prepareTrace(traces[traceIdx]!);
      }
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      io.disconnect();
      ro.disconnect();
      themeObserver.disconnect();
    };
  }, [traces, tailLength]);

  if (traces.length === 0) return null;
  return <canvas ref={canvasRef} className="replay-motion-layer" aria-hidden="true" />;
}
```

- [ ] **Step 2: Type-check the renderer**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "proxy/worker" | head -30`
Expected: clean (ignore pre-existing proxy/worker errors).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ReplayMotionLayer.tsx
git -c commit.gpgsign=false commit -m "Add ReplayMotionLayer Canvas component"
```

---

### Task 9: Profile page integration

**Files:**

- Modify: `src/renderer/pages/Profile.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/renderer/pages/Profile.tsx`, add the new imports next to the existing ones:

```ts
import { ReplayMotionLayer } from "../components/ReplayMotionLayer";
import { useRecentWinTraces } from "../hooks/queries";
```

- [ ] **Step 2: Add the hook call**

Inside the `Profile` function component, near the other `useRecentGames` / `useMatchupRecords` hook calls (around line 113), add:

```ts
const { data: recentWinTraces } = useRecentWinTraces(5);
```

- [ ] **Step 3: Wrap the record card content with bg/fg divs**

Replace the existing `<div className="profile-record-card">` block (currently lines ~216-233) with:

```tsx
<div className="profile-record-card">
  <div className="profile-record-bg">
    {recentWinTraces && recentWinTraces.length > 0 && <ReplayMotionLayer traces={recentWinTraces} />}
  </div>
  <div className="profile-record-fg">
    <div className="profile-record-big">
      <span className="record-win">
        <CountUp target={record.wins} />
      </span>
      <span className="profile-record-sep">-</span>
      <span className="record-loss">
        <CountUp target={record.losses} />
      </span>
    </div>
    <div className="profile-record-sub">
      <span className="profile-record-games">{record.totalGames}</span> games
      {" \u00B7 "}
      <span className="profile-record-rate" style={{ color: Number(winRate) >= 50 ? "var(--green)" : "var(--red)" }}>
        {winRate}%
      </span>{" "}
      win rate
    </div>
  </div>
</div>
```

- [ ] **Step 4: Type-check the renderer**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "proxy/worker" | head -20`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/Profile.tsx
git -c commit.gpgsign=false commit -m "Wire ReplayMotionLayer into Profile record card"
```

---

### Task 10: CSS stacking and layer styles

**Files:**

- Modify: `src/renderer/styles/components.css` (append new block)

- [ ] **Step 1: Find the current `.profile-record-card` rule**

Run: `cd C:/Users/MC/Desktop/TheMAGI && grep -n "profile-record-card\|profile-record-big\|profile-record-sub" src/renderer/styles/components.css`
Note the line numbers. We're appending new rules — not replacing — so the existing styles still apply to the wrapped elements.

- [ ] **Step 2: Append the new block**

Append to the end of `src/renderer/styles/components.css`:

```css
/* ── Replay Motion Layer (Profile record card background) ─────── */
.profile-record-card {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}
.profile-record-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
.profile-record-fg {
  position: relative;
  z-index: 1;
  isolation: isolate;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
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

Note: If the existing `.profile-record-card` already has `position`, `overflow`, or `isolation` declared elsewhere, the later rule wins (CSS cascade). The `!important` flag is NOT used — the append-block comes after the base styles so it overrides naturally.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/components.css
git -c commit.gpgsign=false commit -m "Add stacking context and replay motion layer CSS"
```

---

### Task 11: Final validation and visual verification

**Files:**

- None (validation only)

- [ ] **Step 1: Full main-process type check**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx tsc -p tsconfig.main.json --noEmit 2>&1 | head -20`
Expected: no output.

- [ ] **Step 2: Full renderer type check**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "proxy/worker"`
Expected: only the two pre-existing `proxy/worker.ts` errors (unrelated to this work). Any NEW error is a regression — fix before proceeding.

- [ ] **Step 3: Run all tests**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npm test 2>&1 | tail -30`
Expected: all tests pass, including the three new `stageGeometry` and `highlightTrace` tests.

- [ ] **Step 4: Start dev mode for visual verification**

Run: `cd C:/Users/MC/Desktop/TheMAGI && npm run dev`

- Open the Electron window, navigate to Profile.
- Verify the record card has visible motion behind the "22 — 10" numbers.
- Verify the "22 — 10" text stays razor-legible over the motion (opacity 0.22 should leave plenty of contrast).
- Switch themes (dark → light → melee → win98) via Settings. Verify:
  - Trail colors update without restart (MutationObserver working).
  - Win98 still shows its flat silver card (the CSS `@media (prefers-reduced-motion)` and win98's system linear easing shouldn't disable it, so v1 DOES show the motion layer in win98 — if that looks wrong, add a `[data-theme="win98"] .replay-motion-layer { display: none }` rule).
- Scroll the Profile page so the record card leaves the viewport. Open devtools → Performance tab → record a few seconds → verify no rAF activity while scrolled off-screen.
- Check multiple stages: confirm the wireframe looks right for Battlefield, FD, and at least one other stage present in the user's replay history.

- [ ] **Step 5: Final commit (if anything needed tweaking)**

If any styling tweaks were needed during visual verification, commit them:

```bash
git add -A
git -c commit.gpgsign=false commit -m "Tune replay motion layer after visual verification"
```

- [ ] **Step 6: Summary**

The Profile record card now plays a looping, abstract, CAD-style motion graphic of the player's recent win highlights — ghosted player position trails over a wireframe stage outline, at 0.22 opacity behind the big win/loss numbers. Theme-aware colors, auto-pausing via IntersectionObserver, crossfading between 5 highlights every 8 seconds. Win98 may need an opt-out if period-accuracy is desired.

---

## Spec coverage check

Mapping each spec section to its implementing task:

- **Success criteria 1** (non-empty card with visible motion) → Task 9 + Task 10
- **Success criteria 2** (no perf regression) → Task 8 IntersectionObserver + Task 11 manual verification
- **Success criteria 3** (pause off-screen / hidden window) → Task 8 IntersectionObserver + rAF auto-pause
- **Success criteria 4** (theme reactivity) → Task 8 MutationObserver
- **Success criteria 5** (6 stages) → Task 1 STAGE_GEOMETRY table
- **Success criteria 6** (graceful hide if no highlights) → Task 8 early return + Task 9 conditional render
- **Success criteria 7** (foreground legibility) → Task 10 `.profile-record-fg { isolation: isolate }` + mix-blend-mode on the canvas only

- **Architecture §1 (data extraction)** → Task 3
- **Architecture §2 (stage geometry)** → Tasks 1 + 2
- **Architecture §3 (IPC handler)** → Task 5
- **Architecture §4 (renderer component)** → Task 8
- **Architecture §5 (Profile integration)** → Task 9
- **Architecture §6 (CSS)** → Task 10

- **Data flow** → Tasks 3 → 4 → 5 → 6 → 7 → 8 → 9
- **Error handling** → Task 5 (per-row try/catch), Task 8 (null ctx / geometry / traces bail), Task 10 (prefers-reduced-motion)
- **Performance budget** → Task 8 (dpr cap, 30Hz throttle, IO, rAF)
- **Testing** → Tasks 1–3 (vitest) + Task 11 (manual)
- **Files touched** → all match the "Files" sections above

No gaps.
