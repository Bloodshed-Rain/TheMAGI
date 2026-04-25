# Character Wireframes — Design

**Date:** 2026-04-25
**Topic:** Replace the unused emoji decoration on the Characters page with character-tinted wireframe imagery.

## Summary

Give every character a distinct visual identity on the Characters page (grid tiles + detail hero) by integrating the 27 white-line-on-transparent wireframe PNGs that already live in `site/`. Each wireframe is color-tinted to match the character's accent color via a CSS-mask technique, and a single optimized asset per character is committed to the renderer assets directory.

## Goals

- Every character with a tile gets a recognizable silhouette in that tile.
- The detail page hero shows the same wireframe, scaled up.
- Bundle size stays reasonable (~3–5 MB total for all wireframes after optimization, vs. ~54 MB raw).
- No regression to existing functionality (matchups table, signature stats, coaching modal).

## Non-Goals

- No changes to the rest of the Characters page beyond the visual treatment described here.
- No ambient/drifting marketing-site-style background behavior.
- No two-size (tile vs hero) asset variants — a single optimized PNG per character serves both placements.
- No changes to character data, stats, or pipeline code.

## Asset Pipeline

### Source

`site/*_wireframe.png` — 27 files, ~2 MB each, white lines on transparent background.

### Optimization

One-shot offline step (not part of the runtime build):

1. Run all 27 PNGs through `pngquant` (or `oxipng`) with quality settings tuned to keep the line work crisp.
2. Target output size: ~50–200 KB per file, ~3–5 MB total.
3. The optimized assets are committed to the repo. The pipeline is not re-run at build time.

### Output Location

`src/renderer/assets/characters/<short-key>.png`

The existing `marth.png` and `peach.png` portrait files in this directory are **replaced** by the wireframe versions. Those portrait files were the prior art experiment and are superseded by the unified wireframe treatment.

### Name Mapping

Wireframe filenames use full snake_case names; the app uses short keys. The mapping:

| App key | Source filename |
|---|---|
| `Fox` | `fox_wireframe.png` |
| `Falco` | `falco_wireframe.png` |
| `Marth` | `marth_dair_wireframe.png` *(action pose preferred)* |
| `Sheik` | `sheik_wireframe.png` |
| `Falcon` | `captain_falcon_wireframe.png` |
| `Puff` | `jigglypuff_wireframe.png` |
| `Peach` | `peach_wireframe.png` |
| `ICs` | `ice_climbers_wireframe.png` |
| `Samus` | `samus_wireframe.png` |
| `Pikachu` | `pikachu_wireframe.png` |
| `Luigi` | `luigi_wireframe.png` |
| `Mario` | `mario_wireframe.png` |
| `Doc` | `dr_mario_wireframe.png` |
| `Yoshi` | `yoshi_wireframe.png` |
| `Ganon` | `ganondorf_wireframe.png` |
| `Link` | `link_wireframe.png` |
| `YLink` | `young_link_wireframe.png` |
| `Zelda` | `zelda_wireframe.png` |
| `Roy` | `roy_wireframe.png` |
| `Mewtwo` | `mewtwo_wireframe.png` |
| `G&W` | `game_and_watch_wireframe.png` |
| `Ness` | `ness_wireframe.png` |
| `Bowser` | `bowser_wireframe.png` |
| `Kirby` | `kirby_wireframe.png` |
| `DK` | `donkey_kong_wireframe.png` |
| `Pichu` | `pichu_wireframe.png` |

`marth_wireframe.png` (the static neutral pose) is intentionally not used.

## Color-Tinting Technique

White-line-on-transparent PNGs cannot be cleanly tinted via `<img>` + CSS `filter` (the required filter chains are fragile and don't yield clean accent colors). The reliable technique is **CSS mask**:

```css
.char-wireframe {
  mask-image: var(--wf-src);
  -webkit-mask-image: var(--wf-src);
  mask-size: contain;
  mask-position: center;
  mask-repeat: no-repeat;
  background-color: var(--char-color);
}
```

A `<div>` with the wireframe as its mask and the character's accent color as its background paints exactly the white pixels in that color. Electron uses Chromium, so this is safe across all supported platforms.

The character color comes from the existing `CHARACTER_META[name].color` table (e.g. Fox = orange, Falco = blue, Marth = blue-purple). No new color data is introduced.

## Component Changes (`src/renderer/pages/Characters.tsx`)

### Removed

- `CHARACTER_IMAGE_NAMES` (the 2-entry portrait map).
- The `emoji` field from every `CHARACTER_META` entry — it is defined but never rendered anywhere in the codebase, confirmed via grep. Cleanup-only change.
- The `CharacterCardImage` component (replaced).

### Added

- `CHARACTER_WIREFRAMES`: a `Record<string, string>` keyed by app short-name → imported asset URL. 27 entries covering the full mapping table above.
- `CharacterWireframe` component:
  - Props: `character: string`, `size?: "tile" | "hero"` (default `"tile"`).
  - Renders a `<div>` with the masked-and-tinted treatment.
  - If the character has no entry in `CHARACTER_WIREFRAMES`, renders nothing (graceful degradation).
  - Reads the character's accent color from `CHARACTER_META[character]?.color ?? var(--accent)`.

### Call Sites

- Grid tile (`character-tile`) — replaces the existing `<CharacterCardImage>` call. `size="tile"`.
- Detail hero (`character-hero`) — replaces the existing `<CharacterCardImage>` call. `size="hero"`.

## Visual Spec

### Tile

- Container: existing `.character-tile` (no structural change).
- Wireframe layer: `position: absolute; inset: 0;` behind the existing tile content (`z-index: 0`).
- Mask sizing: `mask-size: contain` with slight bottom-bias positioning so the silhouette doesn't visually collide with the character name and record text.
- Opacity: `0.45` default, `0.6` on tile hover.
- Existing `.character-tile-name`, `.character-tile-record`, and the win-rate bar render above the wireframe via `position: relative; z-index: 1` (already largely in place via `.char-card-content`).

### Detail Hero

- Container: existing `.character-hero` card.
- Wireframe layer: rendered as a sized box (~280 px tall) above the character name, centered.
- Same color tint, same opacity (`0.45`) — per "A: same recipe, bigger" decision.
- The mini stat grid and Analyze Matchup button are unchanged.

### CSS Additions

A new `.character-wireframe` rule (and `.character-wireframe.tile` / `.character-wireframe.hero` size variants) is added to `src/renderer/styles/components.css`. The existing `.char-card-bg-img` rules can be removed since no caller will use them after this change.

## Risks & Mitigations

- **Mask asset URL stability under Vite**: Assets imported via `import wfFox from "../assets/characters/fox.png"` produce hashed URLs that work correctly in `mask-image: url(...)`. Verified pattern in the codebase (the existing `CharacterCardImage` already uses `new URL(..., import.meta.url).href`). Same approach extends here.
- **Wireframe visibility on light themes**: The app currently has dark and light themes. White lines on a light surface, even tinted with the character color, may be hard to see on a light background. Mitigation: the tint is applied via `background-color`, so on light themes the silhouette appears in the character's accent color (which is generally vivid enough to read on a light surface). If contrast issues surface during testing, opacity can be bumped per-theme via a CSS variable.
- **One-shot optimization step**: Because optimized PNGs are committed (not regenerated at build), a developer adding a new character later must re-run the optimization step manually. Documented in the implementation plan.
- **`marth.png` / `peach.png` removal**: Anywhere outside `Characters.tsx` that imports those files would break. A grep confirms they're only referenced in the soon-to-be-replaced `CHARACTER_IMAGE_NAMES` map, so removal is safe.

## Testing

- Visual inspection of the Characters grid: every character tile shows its wireframe in the character's accent color.
- Visual inspection of the detail page for a few characters (Fox, Marth, Falco, Puff, ICs): hero wireframe renders correctly at the larger size.
- Hover state on tile: opacity increase visible.
- Theme toggle: wireframes still readable on the light theme.
- No regression: matchups table, signature stats, and Analyze Matchup coaching modal continue to function as before.
- TypeScript compile passes (`npx tsc -p tsconfig.main.json --noEmit` and the renderer Vite build).

## Out of Scope (Future Work)

- Per-theme opacity tuning if contrast issues are reported.
- Two-size asset variants if perf issues surface with the 27-image grid.
- Animation / drift / hover transformations on the wireframe (currently the only motion is the existing opacity transition).
- Using wireframes outside the Characters page (e.g. dashboard, history, command palette).
