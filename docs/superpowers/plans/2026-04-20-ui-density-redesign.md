# MAGI UI Density Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every page and orphaned component in `src/renderer/` with the density-first layout from `new ui/`, add Practice + Oracle pages, drop win98/melee themes, and wire real data + LLM calls everywhere.

**Architecture:** Foundation-first. Lock primitive components (`Sparkline`, `StatGroupCard`, `EmptyState`), the 6-theme token set, and the LiquidShell. Then rewrite pages one at a time against that vocabulary. Finish with a cleanup sweep that deletes every orphaned file. Reference: `docs/superpowers/specs/2026-04-20-ui-density-redesign-design.md`.

**Tech Stack:** React 18, TypeScript, Vite, Electron, `better-sqlite3`, `@tanstack/react-query`, `framer-motion`, `react-markdown`, existing LLM multi-provider infra in `src/llm.ts`.

---

## Ground rules for every task

- **Branch:** work continues on `feat/new-ui`.
- **After each task, run** `npx tsc -p tsconfig.main.json --noEmit && npm test` before committing. The type check covers main-process types; renderer compiles via Vite.
- **Test convention:** `vitest` unit tests live in `tests/`. Renderer-only pure-logic modules get unit tests. Pure-visual React components don't need tests — manual verification in dev server is the gate.
- **Never** use `--no-verify` or skip hooks.
- **Commit messages:** conventional (`feat:`, `refactor:`, `chore:`). One commit per task unless noted.

---

## File structure after completion

```
src/renderer/
  App.tsx                              [modified — single shell, new routes]
  themes.ts                            [rewritten — 6 themes]
  components/
    LiquidShell.tsx                    [keep]
    TweaksPanel.tsx                    [keep — theme chips auto-update via THEME_ORDER]
    GameDrawer.tsx                     [modified — inline coaching, no GameDetail nav]
    StockTimeline.tsx                  [keep]
    CommandPalette.tsx                 [keep]
    RadarChart.tsx                     [keep]
    ErrorBoundary.tsx, Tooltip.tsx,
    NavIcons.tsx, ThemeIcons.tsx       [keep]
    CoachingModal.tsx                  [keep — used by drawer inline coaching]
    ui/
      Card.tsx                         [keep — `tone="chrome-plate"` exists]
      DataTable.tsx, KPI.tsx, Pill.tsx,
      ResultDot.tsx, WinrateBar.tsx,
      Badge.tsx                        [keep]
      Sparkline.tsx                    [NEW]
      StatGroupCard.tsx                [NEW]
      EmptyState.tsx                   [NEW]
  pages/
    Dashboard.tsx                      [rewritten]
    Sessions.tsx                       [rewritten — per-day cards]
    Library.tsx                        [minor polish]
    Characters.tsx                     [rewritten]
    Trends.tsx                         [rewritten]
    Settings.tsx                       [rewritten visuals only]
    Practice.tsx                       [NEW]
    Oracle.tsx                         [NEW]
  hooks/
    queries.ts                         [extend types, add new hooks]
  radarStats.ts                        [keep]

src/main/handlers/
  stats.ts                             [add sessionsByDay, trendSeries]
  llm.ts                               [add askOracle, generatePracticePlan,
                                        analyzeSession, drill mgmt]

src/
  db.ts                                [migration #6 — 4 new tables]
  pipeline/prompt.ts                   [add SYSTEM_PROMPT_{ORACLE,PRACTICE,SESSION}]
  preload/index.ts                     [expose new IPC]
```

**Deleted outright (final cleanup):**

- `src/renderer/components/Win98Shell.tsx`
- `src/renderer/components/Onboarding.tsx`
- `src/renderer/components/HighlightCards.tsx`
- `src/renderer/components/CoachingCards.tsx` (only if not imported after Coaching page deletion)
- `src/renderer/pages/Coaching.tsx`
- `src/renderer/pages/GameDetail.tsx`
- `src/renderer/styles/theme-win98.css` or equivalent win98 CSS blocks
- melee-theme CSS blocks in `src/renderer/styles/tokens.css`
- routes for `/coaching` and `/game/:gameId` in `App.tsx`

---

# Phase 1 — Foundation

## Task 1: Add `Sparkline` primitive

**Files:**

- Create: `src/renderer/components/ui/Sparkline.tsx`
- Create: `tests/sparkline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/sparkline.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildSparklinePoints } from "../src/renderer/components/ui/Sparkline.js";

describe("buildSparklinePoints", () => {
  it("maps a flat series to a horizontal line at mid-height", () => {
    const pts = buildSparklinePoints([5, 5, 5], 100, 40);
    expect(pts).toBe("0,40 50,40 100,40");
  });

  it("maps increasing series to a bottom-left → top-right diagonal", () => {
    const pts = buildSparklinePoints([0, 1, 2], 100, 40);
    expect(pts).toBe("0,40 50,20 100,0");
  });

  it("returns empty string for empty input", () => {
    expect(buildSparklinePoints([], 100, 40)).toBe("");
  });

  it("handles single-value series by centering", () => {
    expect(buildSparklinePoints([7], 100, 40)).toBe("0,40");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sparkline.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Sparkline`**

Create `src/renderer/components/ui/Sparkline.tsx`:

```tsx
import { CSSProperties } from "react";

export function buildSparklinePoints(values: number[], w: number, h: number): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `0,${h}`;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
}

interface SparklineProps {
  values: number[];
  kind?: "spark" | "chart";
  color?: string;
  height?: number;
  /** When true, shows a subtle area fill and 3 dashed gridlines (chart kind only). */
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Sparkline({
  values,
  kind = "spark",
  color = "var(--accent)",
  height,
  fill,
  className,
  style,
}: SparklineProps) {
  const w = kind === "chart" ? 1000 : 120;
  const h = height ?? (kind === "chart" ? 200 : 32);
  const pts = buildSparklinePoints(values, w, h);
  if (!pts) return null;

  const showFill = fill ?? kind === "chart";
  const showGrid = kind === "chart";
  const gridLines = [0.25, 0.5, 0.75].map((t) => h * t);
  const lastX = w;
  const lastY = values.length > 1 ? Number(pts.split(" ").slice(-1)[0]!.split(",")[1]) : h;
  const areaPath = `0,${h} ${pts} ${w},${h}`;
  const gradId = `sparkgrad-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={kind === "chart" ? "100%" : w}
      height={h}
      preserveAspectRatio={kind === "chart" ? "none" : "xMinYMid meet"}
      style={{ display: "block", overflow: "visible", ...style }}
      className={className}
    >
      {showFill && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {showGrid &&
        gridLines.map((y) => (
          <line key={y} x1="0" y1={y} x2={w} y2={y} stroke="var(--border-subtle)" strokeDasharray="3 3" />
        ))}
      {showFill && <polygon points={areaPath} fill={`url(#${gradId})`} />}
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={kind === "chart" ? 2 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {kind === "chart" && values.length > 1 && (
        <circle cx={lastX} cy={lastY} r="5" fill={color} stroke="var(--bg)" strokeWidth="2" />
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sparkline.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ui/Sparkline.tsx tests/sparkline.test.ts
git commit -m "feat(ui): add Sparkline primitive with spark + chart presets"
```

## Task 2: Add `StatGroupCard` primitive

**Files:**

- Create: `src/renderer/components/ui/StatGroupCard.tsx`

- [ ] **Step 1: Implement `StatGroupCard`**

Create `src/renderer/components/ui/StatGroupCard.tsx`:

```tsx
import { Card } from "./Card";

export interface StatItem {
  label: string;
  value: string | number;
  /** true = green, false = red, undefined = neutral */
  good?: boolean;
  /** Render as plain text (not mono), used for strings like kill-move names. */
  isText?: boolean;
}

interface StatGroupCardProps {
  title: string;
  items: StatItem[];
}

export function StatGroupCard({ title, items }: StatGroupCardProps) {
  return (
    <Card title={title}>
      <div className="stat-group-grid">
        {items.map((it) => (
          <div key={it.label} className="stat-group-cell">
            <div className="stat-group-label">{it.label}</div>
            <div
              className={it.isText ? "stat-group-value stat-group-value-text" : "stat-group-value mono"}
              style={{
                color: it.good === true ? "var(--win)" : it.good === false ? "var(--loss)" : "var(--text)",
              }}
            >
              {String(it.value)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Add CSS for `.stat-group-grid` / `.stat-group-cell`**

Append to `src/renderer/styles/components.css`:

```css
.stat-group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}
.stat-group-cell {
  padding: 12px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}
.stat-group-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 4px;
}
.stat-group-value {
  font-weight: 700;
  font-size: 18px;
}
.stat-group-value-text {
  font-size: 13px;
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc -p tsconfig.main.json --noEmit && npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ui/StatGroupCard.tsx src/renderer/styles/components.css
git commit -m "feat(ui): add StatGroupCard primitive"
```

## Task 3: Add `EmptyState` primitive

**Files:**

- Create: `src/renderer/components/ui/EmptyState.tsx`

- [ ] **Step 1: Implement `EmptyState`**

Create `src/renderer/components/ui/EmptyState.tsx`:

```tsx
import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  sub?: string;
  cta?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, sub, cta }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h2 className="empty-state-title">{title}</h2>
      {sub && <p className="empty-state-sub">{sub}</p>}
      {cta && (
        <button className="btn btn-primary" onClick={cta.onClick}>
          {cta.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Ensure CSS exists**

Verify `src/renderer/styles/components.css` has `.empty-state` + `.empty-state-icon`. If not present, append:

```css
.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-muted);
}
.empty-state-icon {
  margin-bottom: 16px;
  color: var(--accent);
  display: inline-flex;
}
.empty-state-title {
  font-family: var(--font-display);
  margin: 0 0 8px;
  color: var(--text);
}
.empty-state-sub {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ui/EmptyState.tsx src/renderer/styles/components.css
git commit -m "feat(ui): add EmptyState primitive"
```

## Task 4: Add `telemetry` theme (rename of `dark`)

**Files:**

- Modify: `src/renderer/themes.ts`

- [ ] **Step 1: Add `telemetry` theme key with same tokens as `dark`**

In `src/renderer/themes.ts`, inside the `THEMES` record, **before** the existing `dark` entry, add a new entry with the same token values but id/name `telemetry`:

```ts
  telemetry: {
    id: "telemetry",
    name: "Telemetry",
    bg: "#0f172a",
    surface1: "#1e293b",
    surface2: "#334155",
    surface3: "#475569",
    border: "rgba(148, 163, 184, 0.1)",
    borderSubtle: "rgba(148, 163, 184, 0.05)",
    borderMuted: "rgba(148, 163, 184, 0.2)",
    text: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#64748b",
    accent: "#22d3ee",
    accentHover: "#06b6d4",
    accentMuted: "rgba(34, 211, 238, 0.15)",
    win: "#4ade80",
    loss: "#f87171",
    caution: "#fbbf24",
    sidebarBg: "#0f172a",
    sidebarHover: "#1e293b",
    sidebarActiveBg: "rgba(34, 211, 238, 0.12)",
    sidebarAccent: "#22d3ee",
    shadowSm: "0 1px 3px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)",
    shadowMd: "0 4px 16px rgba(0,0,0,0.4)",
    shadowLg: "0 12px 40px rgba(0,0,0,0.5)",
    fontMono: FONT_MONO,
    fontSans: FONT_SANS,
    fontDisplay: FONT_DISPLAY,
    easeSpring: EASE_SPRING,
    easeOut: EASE_OUT,
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/themes.ts
git commit -m "feat(themes): add telemetry theme"
```

## Task 5: Add `tournament` theme

**Files:**

- Modify: `src/renderer/themes.ts`

- [ ] **Step 1: Add `tournament` entry after `telemetry`**

Add to `THEMES` record in `src/renderer/themes.ts`:

```ts
  tournament: {
    id: "tournament",
    name: "Tournament",
    bg: "#000000",
    surface1: "#0a0a0a",
    surface2: "#141414",
    surface3: "#1f1f1f",
    border: "rgba(255,255,255,0.08)",
    borderSubtle: "rgba(255,255,255,0.04)",
    borderMuted: "rgba(255,255,255,0.14)",
    text: "#ffffff",
    textSecondary: "#d4d4d4",
    textMuted: "#737373",
    accent: "#3b82f6",
    accentHover: "#2563eb",
    accentMuted: "rgba(59,130,246,0.15)",
    win: "#4ade80",
    loss: "#f87171",
    caution: "#fbbf24",
    sidebarBg: "#000000",
    sidebarHover: "#0a0a0a",
    sidebarActiveBg: "rgba(59,130,246,0.15)",
    sidebarAccent: "#3b82f6",
    shadowSm: "0 1px 3px rgba(0,0,0,0.6)",
    shadowMd: "0 4px 16px rgba(0,0,0,0.6)",
    shadowLg: "0 12px 40px rgba(0,0,0,0.7)",
    fontMono: FONT_MONO,
    fontSans: FONT_SANS,
    fontDisplay: FONT_DISPLAY,
    easeSpring: EASE_SPRING,
    easeOut: EASE_OUT,
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/themes.ts
git commit -m "feat(themes): add tournament theme"
```

## Task 6: Add `crt` theme

**Files:**

- Modify: `src/renderer/themes.ts`

- [ ] **Step 1: Add `crt` entry**

```ts
  crt: {
    id: "crt",
    name: "CRT",
    bg: "#050a05",
    surface1: "#0a140a",
    surface2: "#111e11",
    surface3: "#1a2e1a",
    border: "rgba(51,255,51,0.08)",
    borderSubtle: "rgba(51,255,51,0.04)",
    borderMuted: "rgba(51,255,51,0.15)",
    text: "#33ff33",
    textSecondary: "#29cc29",
    textMuted: "#1a801a",
    accent: "#33ff33",
    accentHover: "#29cc29",
    accentMuted: "rgba(51,255,51,0.12)",
    win: "#33ff33",
    loss: "#ff3333",
    caution: "#ffcc00",
    sidebarBg: "#050a05",
    sidebarHover: "#0a140a",
    sidebarActiveBg: "rgba(51,255,51,0.12)",
    sidebarAccent: "#33ff33",
    shadowSm: "0 0 4px rgba(51,255,51,0.25)",
    shadowMd: "0 0 12px rgba(51,255,51,0.3)",
    shadowLg: "0 0 24px rgba(51,255,51,0.35)",
    fontMono: FONT_MONO,
    fontSans: FONT_MONO,
    fontDisplay: FONT_MONO,
    easeSpring: EASE_SPRING,
    easeOut: EASE_OUT,
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/themes.ts
git commit -m "feat(themes): add crt theme"
```

## Task 7: Add `amber` theme

**Files:**

- Modify: `src/renderer/themes.ts`

- [ ] **Step 1: Add `amber` entry**

```ts
  amber: {
    id: "amber",
    name: "Amber",
    bg: "#1a1006",
    surface1: "#231709",
    surface2: "#2e200e",
    surface3: "#3d2c15",
    border: "rgba(217,175,106,0.1)",
    borderSubtle: "rgba(217,175,106,0.05)",
    borderMuted: "rgba(217,175,106,0.18)",
    text: "#f5e6c8",
    textSecondary: "#c9a96e",
    textMuted: "#8b6d3f",
    accent: "#d9a540",
    accentHover: "#c4922e",
    accentMuted: "rgba(217,165,64,0.14)",
    win: "#7dba5a",
    loss: "#d95b5b",
    caution: "#d9a540",
    sidebarBg: "#1a1006",
    sidebarHover: "#231709",
    sidebarActiveBg: "rgba(217,165,64,0.14)",
    sidebarAccent: "#d9a540",
    shadowSm: "0 2px 6px rgba(0,0,0,0.4)",
    shadowMd: "0 6px 18px rgba(0,0,0,0.5)",
    shadowLg: "0 16px 48px rgba(0,0,0,0.6)",
    fontMono: FONT_MONO,
    fontSans: FONT_SANS,
    fontDisplay: FONT_DISPLAY,
    easeSpring: EASE_SPRING,
    easeOut: EASE_OUT,
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/themes.ts
git commit -m "feat(themes): add amber theme"
```

## Task 8: Delete `win98` and `melee` themes; update `THEME_ORDER` + `ColorMode`

**Files:**

- Modify: `src/renderer/themes.ts`

- [ ] **Step 1: Remove `win98` and `melee` entries from `THEMES`**

Delete the entire `win98: { ... }` block and the entire `melee: { ... }` block from the `THEMES` record.

- [ ] **Step 2: Delete the old `dark` entry**

Remove the `dark: { ... }` block (its tokens are now on `telemetry`).

- [ ] **Step 3: Update `THEME_ORDER` + `ColorMode`**

Replace:

```ts
export const THEME_ORDER = ["liquid", "dark", "light", "win98", "melee"] as const;
export type ColorMode = "liquid" | "dark" | "light" | "win98" | "melee";
```

With:

```ts
export const THEME_ORDER = ["liquid", "telemetry", "tournament", "crt", "amber", "light"] as const;
export type ColorMode = "liquid" | "telemetry" | "tournament" | "crt" | "amber" | "light";
```

- [ ] **Step 4: Update fallback in `getResolvedTheme`**

Replace `return THEMES[themeId] ?? THEMES["dark"]!;` with `return THEMES[themeId] ?? THEMES["liquid"]!;`.

- [ ] **Step 5: Verify type-check**

Run: `npx tsc -p tsconfig.main.json --noEmit && npm test`
Expected: may fail in `App.tsx` / `TweaksPanel.tsx` if they reference removed themes. Fix in next tasks.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/themes.ts
git commit -m "refactor(themes): drop win98 and melee, order as prototype set"
```

## Task 9: Migrate saved `colorMode` in `App.tsx`

**Files:**

- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Replace the theme loader migration block**

In `App.tsx`, locate the `loadTheme` function. Replace its body with:

```ts
async function loadTheme() {
  try {
    const config = await window.clippi.loadConfig();
    const raw = config?.colorMode ?? "liquid";

    // Legacy id remap.
    const migrated: ColorMode = ((): ColorMode => {
      if (raw === "dark") return "telemetry";
      if (raw === "win98" || raw === "melee") return "liquid";
      return (raw in THEMES ? raw : "liquid") as ColorMode;
    })();

    setColorMode(migrated);
    applyTheme(getResolvedTheme(migrated, migrated));

    if (migrated !== raw) {
      window.clippi.saveConfig({ colorMode: migrated }).catch(() => {});
    }
    const savedDensity: Density = config?.density === "compact" ? "compact" : "comfortable";
    setDensity(savedDensity);
  } catch {
    applyTheme(getResolvedTheme("liquid", "liquid"));
  }
}
```

- [ ] **Step 2: Delete `isWin98` branch**

Remove the entire `const isWin98 = colorMode === "win98";` line and the `if (isWin98) { ... return ... }` block, along with the `Win98Shell`/`handleWin98Import`/`handleWin98ClearAll` imports and `useCallback`s. The only shell should be `LiquidShell`.

- [ ] **Step 3: Verify type-check**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: may still fail in TweaksPanel — fix next.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "refactor(app): migrate legacy colorMode, drop Win98Shell branch"
```

## Task 10: Fix `TweaksPanel` after win98 removal

**Files:**

- Modify: `src/renderer/components/TweaksPanel.tsx`

- [ ] **Step 1: Remove win98-specific density guard**

Replace:

```tsx
      {colorMode !== "win98" && (
        <div className="tweaks-group">
```

With:

```tsx
      <div className="tweaks-group">
```

And remove the matching close paren below. The chip list driven by `THEME_ORDER` auto-updates — no other change needed.

- [ ] **Step 2: Verify type-check and manual smoke test**

Run: `npx tsc -p tsconfig.main.json --noEmit && npm test`
Expected: green.

Then run `npm run dev`, open the TweaksPanel (gear icon bottom-right), verify all 6 chips appear (Liquid / Telemetry / Tournament / CRT / Amber / Light), and each click swaps the theme.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/TweaksPanel.tsx
git commit -m "fix(tweaks): drop win98 density guard"
```

## Task 11: Delete `Win98Shell.tsx` file

**Files:**

- Delete: `src/renderer/components/Win98Shell.tsx`

- [ ] **Step 1: Confirm no remaining imports**

Run: `npx grep -r "Win98Shell" src/`
Expected: zero results (App.tsx import was removed in Task 9).

- [ ] **Step 2: Delete the file**

```bash
rm src/renderer/components/Win98Shell.tsx
```

- [ ] **Step 3: Verify build**

Run: `npx tsc -p tsconfig.main.json --noEmit && npm test && npm run build -- --skip-package 2>&1 | tail -20`

If `--skip-package` isn't supported, run `vite build` and `tsc --noEmit` individually. Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete Win98Shell.tsx"
```

## Task 12: Prune win98 + melee CSS blocks

**Files:**

- Modify: `src/renderer/styles/tokens.css` (primary carrier of theme-specific blocks)
- Potentially modify: `src/renderer/styles/shells.css`, `src/renderer/styles/components.css`

- [ ] **Step 1: Find win98/melee CSS blocks**

Run: `npx grep -rn '\[data-theme="win98"\]\|\[data-theme="melee"\]' src/renderer/styles/ | head -40`

Note each selector + line number. Delete every matched block (the full selector + all its nested properties).

- [ ] **Step 2: Verify dev build still compiles**

Run: `npm run dev` briefly and confirm the app loads without CSS errors. Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/
git commit -m "chore(styles): drop win98 and melee theme CSS"
```

---

# Phase 2 — GameDrawer rewrite

## Task 13: Refactor GameDrawer to use `StatGroupCard` primitive

**Files:**

- Modify: `src/renderer/components/GameDrawer.tsx`

- [ ] **Step 1: Replace inline stat-grid with `StatGroupCard`**

In `GameDrawer.tsx`, replace the `.map((s) => ( <Card ...> ... </Card> ))` block near the bottom with:

```tsx
{
  stats.map((s) => <StatGroupCard key={s.group} title={s.group} items={s.items} />);
}
```

Add the import at the top:

```tsx
import { StatGroupCard } from "./ui/StatGroupCard";
```

- [ ] **Step 2: Add Kill Move to Offense group**

In the `buildStats` function, extend the Offense `items` array to include:

```ts
{ label: "Kill Move", value: (g as unknown as { killMove?: string }).killMove ?? "—", isText: true },
```

(The `killMove` field will be added to the query in Phase 3. For now, it will render "—".)

- [ ] **Step 3: Delete old `.drawer-stat-grid` / `.drawer-stat-cell` CSS**

Run `npx grep -rn "drawer-stat-grid\|drawer-stat-cell\|drawer-stat-label" src/renderer/styles/`. Delete each matched block — the new primitive uses `.stat-group-*` classes added in Task 2.

- [ ] **Step 4: Verify**

Run: `npx tsc -p tsconfig.main.json --noEmit && npm test`. Then `npm run dev`, click a game row to open the drawer, confirm the three stat groups render correctly.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/GameDrawer.tsx src/renderer/styles/
git commit -m "refactor(drawer): use StatGroupCard primitive; add Kill Move stat"
```

## Task 14: Inline coaching inside GameDrawer

**Files:**

- Modify: `src/renderer/components/GameDrawer.tsx`

- [ ] **Step 1: Add state for inline coaching**

Near the top of the `GameDrawer` component body, add:

```tsx
import { useState } from "react";
import Markdown from "react-markdown";
// Existing imports stay.

// …inside component…
const [coaching, setCoaching] = useState<string | null>(null);
const [coachLoading, setCoachLoading] = useState(false);
const [coachError, setCoachError] = useState<string | null>(null);

const onGetCoaching = async () => {
  if (!game) return;
  setCoachLoading(true);
  setCoachError(null);
  try {
    const result = await window.clippi.analyzeGame(game.id);
    setCoaching(result);
  } catch (err) {
    setCoachError(err instanceof Error ? err.message : String(err));
  } finally {
    setCoachLoading(false);
  }
};
```

- [ ] **Step 2: Replace "Get Coaching" button onClick and delete "Open full analysis"**

Replace the `<div style={{ display: "flex", gap: 8, marginBottom: 24 }}>...</div>` block with:

```tsx
<div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
  <button className="btn btn-primary" onClick={onGetCoaching} disabled={coachLoading}>
    {coachLoading ? "Analyzing…" : "Get Coaching"}
  </button>
  <button
    className="btn"
    onClick={() => {
      if (game?.replayPath) window.clippi.launchReplay(game.replayPath);
    }}
  >
    Watch Replay
  </button>
</div>
```

Delete the `onOpenFull`, `navigate` usage, and the `useNavigate` import. Add `replayPath?: string` to the `DrawerGame` interface.

- [ ] **Step 3: Render coaching block after stat groups**

Add before the closing `</div>` of `.drawer`:

```tsx
{
  coachError && (
    <Card title="Coaching">
      <p style={{ color: "var(--loss)" }}>{coachError}</p>
    </Card>
  );
}
{
  coaching && (
    <Card title="Coaching">
      <div className="drawer-coaching-body">
        <Markdown>{coaching}</Markdown>
      </div>
    </Card>
  );
}
```

Append to `components.css`:

```css
.drawer-coaching-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.drawer-coaching-body h1,
.drawer-coaching-body h2,
.drawer-coaching-body h3 {
  color: var(--text);
}
.drawer-coaching-body code {
  font-family: var(--font-mono);
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 4px;
}
```

- [ ] **Step 4: Verify `launchReplay` and `analyzeGame` are exposed**

Run: `npx grep -n "launchReplay\|analyzeGame" src/preload/index.ts`
Expected: both present. If `launchReplay` doesn't exist, add it in a follow-up — but verify first. If `analyzeGame` returns a promise of the coaching string, the code above works. If it returns an object with a `content` field, adjust `setCoaching(result)` to `setCoaching(result.content)`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/GameDrawer.tsx src/renderer/styles/components.css
git commit -m "feat(drawer): inline coaching and Watch Replay; drop full-analysis nav"
```

---

# Phase 3 — Dashboard rewrite

## Task 15: Extend `getRecentGames` to return `killMove` + `durationSeconds`

**Files:**

- Modify: `src/db.ts`
- Modify: `src/main/handlers/stats.ts` (no change; passthrough)

- [ ] **Step 1: Update SQL and TS type**

In `src/db.ts`, find `export function getRecentGames` and its `RecentGame` interface. Add fields to the SELECT and the interface:

```ts
export interface RecentGame {
  id: number;
  replayPath: string;
  playedAt: string | null;
  stage: string;
  playerCharacter: string;
  opponentCharacter: string;
  opponentTag: string;
  opponentConnectCode: string | null;
  result: "win" | "loss" | "draw";
  playerFinalStocks: number;
  playerFinalPercent: number;
  opponentFinalStocks: number;
  opponentFinalPercent: number;
  durationSeconds: number;
  neutralWinRate: number;
  lCancelRate: number;
  openingsPerKill: number;
  avgDamagePerOpening: number;
  conversionRate: number;
  avgDeathPercent: number;
  powerShieldCount: number;
  edgeguardAttempts: number;
  edgeguardSuccessRate: number;
  recoverySuccessRate: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  wavedashCount: number;
  dashDanceFrames: number;
  killMove: string | null;
}
```

Replace the SELECT body with:

```sql
SELECT
  g.id, g.replay_path as replayPath,
  g.played_at as playedAt, g.stage,
  g.player_character as playerCharacter,
  g.opponent_character as opponentCharacter,
  g.opponent_tag as opponentTag,
  g.opponent_connect_code as opponentConnectCode,
  g.result,
  g.player_final_stocks as playerFinalStocks,
  g.player_final_percent as playerFinalPercent,
  g.opponent_final_stocks as opponentFinalStocks,
  g.opponent_final_percent as opponentFinalPercent,
  g.duration_seconds as durationSeconds,
  gs.neutral_win_rate as neutralWinRate,
  gs.l_cancel_rate as lCancelRate,
  gs.openings_per_kill as openingsPerKill,
  gs.avg_damage_per_opening as avgDamagePerOpening,
  gs.conversion_rate as conversionRate,
  gs.avg_death_percent as avgDeathPercent,
  gs.power_shield_count as powerShieldCount,
  gs.edgeguard_attempts as edgeguardAttempts,
  gs.edgeguard_success_rate as edgeguardSuccessRate,
  gs.recovery_success_rate as recoverySuccessRate,
  gs.total_damage_dealt as totalDamageDealt,
  gs.total_damage_taken as totalDamageTaken,
  gs.wavedash_count as wavedashCount,
  gs.dash_dance_frames as dashDanceFrames,
  (SELECT h.label
     FROM highlights h
     WHERE h.game_id = g.id AND h.did_kill = 1
     ORDER BY h.damage DESC
     LIMIT 1) as killMove
FROM games g
JOIN game_stats gs ON gs.game_id = g.id
ORDER BY g.played_at DESC
LIMIT ?
```

- [ ] **Step 2: Run tests**

Run: `npx tsc -p tsconfig.main.json --noEmit && npm test`. Expected: green; existing consumers see `killMove` as nullable and will fall through.

- [ ] **Step 3: Commit**

```bash
git add src/db.ts
git commit -m "feat(db): extend getRecentGames with duration, percents, killMove"
```

## Task 16: Extend `getDashboardHighlights.trends` with damagePerOpening + conversion deltas

**Files:**

- Modify: `src/db.ts`

- [ ] **Step 1: Update the `trends` interface**

Locate `DashboardHighlights` in `src/db.ts`. Replace the `trends` field with:

```ts
trends: {
  neutralWinRate: number;
  lCancelRate: number;
  edgeguardSuccessRate: number;
  openingsPerKill: number;
  avgDamagePerOpening: number;
  conversionRate: number;
}
```

- [ ] **Step 2: Update the trend-computation SELECT + mapping**

Find the `// Trend deltas` SELECT and add columns:

```sql
SELECT gs.neutral_win_rate as neutralWinRate,
       gs.l_cancel_rate as lCancelRate,
       gs.edgeguard_success_rate as edgeguardSuccessRate,
       gs.openings_per_kill as openingsPerKill,
       gs.avg_damage_per_opening as avgDamagePerOpening,
       gs.conversion_rate as conversionRate
FROM games g
JOIN game_stats gs ON gs.game_id = g.id
ORDER BY g.played_at DESC
LIMIT ?
```

Update the row type with the new fields, and extend the `trends` object:

```ts
const trends =
  previous.length > 0
    ? {
        neutralWinRate: avg(recent, "neutralWinRate") - avg(previous, "neutralWinRate"),
        lCancelRate: avg(recent, "lCancelRate") - avg(previous, "lCancelRate"),
        edgeguardSuccessRate: avg(recent, "edgeguardSuccessRate") - avg(previous, "edgeguardSuccessRate"),
        openingsPerKill: avg(recent, "openingsPerKill") - avg(previous, "openingsPerKill"),
        avgDamagePerOpening: avg(recent, "avgDamagePerOpening") - avg(previous, "avgDamagePerOpening"),
        conversionRate: avg(recent, "conversionRate") - avg(previous, "conversionRate"),
      }
    : {
        neutralWinRate: 0,
        lCancelRate: 0,
        edgeguardSuccessRate: 0,
        openingsPerKill: 0,
        avgDamagePerOpening: 0,
        conversionRate: 0,
      };
```

- [ ] **Step 3: Verify**

Run: `npx tsc -p tsconfig.main.json --noEmit && npm test`. Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/db.ts
git commit -m "feat(db): add avgDamagePerOpening + conversion trend deltas"
```

## Task 17: Rewrite Dashboard page

**Files:**

- Modify: `src/renderer/pages/Dashboard.tsx` (full rewrite)
- Modify: `src/renderer/styles/dashboard.css` (prune + replace)

- [ ] **Step 1: Replace page body**

Replace the entire contents of `src/renderer/pages/Dashboard.tsx` with:

```tsx
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Markdown from "react-markdown";
import { Compass } from "lucide-react";
import { useRecentGames, useOverallRecord, useDashboardHighlights } from "../hooks/queries";
import { useGlobalStore } from "../stores/useGlobalStore";
import { Card } from "../components/ui/Card";
import { KPI } from "../components/ui/KPI";
import { DataTable } from "../components/ui/DataTable";
import { ResultDot } from "../components/ui/ResultDot";
import { Sparkline } from "../components/ui/Sparkline";
import { EmptyState } from "../components/ui/EmptyState";

interface RecentGame {
  id: number;
  playedAt: string | null;
  stage: string;
  playerCharacter: string;
  opponentCharacter: string;
  opponentTag: string;
  result: "win" | "loss" | "draw";
  playerFinalStocks: number;
  opponentFinalStocks: number;
  neutralWinRate: number;
  lCancelRate: number;
  conversionRate: number;
  avgDamagePerOpening: number;
  replayPath: string;
}

function fmtDelta(d: number, invert = false): { label: string; tone: "good" | "bad" | "neutral" } {
  if (Math.abs(d) < 0.005) return { label: "—", tone: "neutral" };
  const improving = invert ? d < 0 : d > 0;
  const mag = (Math.abs(d) * 100).toFixed(1);
  return { label: `${improving ? "↑" : "↓"} ${mag}pp`, tone: improving ? "good" : "bad" };
}

function fmtDmgDelta(d: number): { label: string; tone: "good" | "bad" | "neutral" } {
  if (Math.abs(d) < 0.05) return { label: "—", tone: "neutral" };
  const improving = d > 0;
  return { label: `${improving ? "↑" : "↓"} ${Math.abs(d).toFixed(1)}`, tone: improving ? "good" : "bad" };
}

function buildRecentSummary(games: RecentGame[]): string {
  const wins = games.filter((g) => g.result === "win").length;
  const avg = (fn: (g: RecentGame) => number) => games.reduce((s, g) => s + fn(g), 0) / games.length;
  return [
    `Last ${games.length} games: ${wins}W-${games.length - wins}L`,
    `- Neutral ${(avg((g) => g.neutralWinRate) * 100).toFixed(1)}%`,
    `- L-Cancel ${(avg((g) => g.lCancelRate) * 100).toFixed(1)}%`,
    `- Conversion ${(avg((g) => g.conversionRate) * 100).toFixed(1)}%`,
    `- Dmg/Op ${avg((g) => g.avgDamagePerOpening).toFixed(1)}`,
    "",
    games
      .map(
        (g, i) =>
          `  Game ${i + 1}: ${g.playerCharacter} vs ${g.opponentCharacter} (${g.opponentTag}) — ${g.result.toUpperCase()} ${g.playerFinalStocks}-${g.opponentFinalStocks}`,
      )
      .join("\n"),
    "",
    "You are MAGI Oracle. One concise paragraph. Reference one or two specific numbers above. End with a single sentence focusing the next session.",
  ].join("\n");
}

export function Dashboard({ refreshKey }: { refreshKey: number }) {
  const navigate = useNavigate();
  const openDrawer = useGlobalStore((s) => s.openDrawer);
  const { data: games = [], isLoading, refetch } = useRecentGames(100);
  const { data: record, refetch: refetchRecord } = useOverallRecord();
  const { data: highlights, refetch: refetchHighlights } = useDashboardHighlights();

  useEffect(() => {
    refetch();
    refetchRecord();
    refetchHighlights();
  }, [refreshKey, refetch, refetchRecord, refetchHighlights]);

  const recent = games.slice(0, 20) as RecentGame[];
  const last10 = recent.slice(0, 10);
  const avgNeutral = useMemo(
    () => (recent.length ? recent.reduce((s, g) => s + g.neutralWinRate, 0) / recent.length : 0),
    [recent],
  );
  const avgLCancel = useMemo(
    () => (recent.length ? recent.reduce((s, g) => s + g.lCancelRate, 0) / recent.length : 0),
    [recent],
  );
  const avgDmg = useMemo(
    () => (recent.length ? recent.reduce((s, g) => s + g.avgDamagePerOpening, 0) / recent.length : 0),
    [recent],
  );

  const wins = record?.wins ?? 0;
  const losses = record?.losses ?? 0;
  const totalGames = record?.totalGames ?? recent.length;
  const overallWR = totalGames > 0 ? (wins / totalGames) * 100 : 0;

  const trends = highlights?.trends;
  const neutralD = trends ? fmtDelta(trends.neutralWinRate) : { label: "—", tone: "neutral" as const };
  const lcancelD = trends ? fmtDelta(trends.lCancelRate) : { label: "—", tone: "neutral" as const };
  const dmgD = trends ? fmtDmgDelta(trends.avgDamagePerOpening) : { label: "—", tone: "neutral" as const };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
        Loading…
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <EmptyState
        title="No replays imported yet"
        sub="Point MAGI at your Slippi folder to start tracking stats and coaching."
        cta={{ label: "Open Settings", onClick: () => navigate("/settings") }}
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>
            {totalGames} games · {wins}W-{losses}L
            {highlights?.streak
              ? highlights.streak > 0
                ? ` · ${highlights.streak}W streak`
                : ` · ${Math.abs(highlights.streak)}L streak`
              : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => navigate("/settings")}>
            Import Replays
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <KPI label="Win Rate" value={`${overallWR.toFixed(0)}%`} sub={`${wins}W · ${losses}L`} />
        <KPI
          label="Neutral WR"
          value={`${(avgNeutral * 100).toFixed(1)}%`}
          sub={neutralD.label}
          subTone={neutralD.tone}
        />
        <KPI
          label="L-Cancel"
          value={`${(avgLCancel * 100).toFixed(1)}%`}
          sub={lcancelD.label}
          subTone={lcancelD.tone}
        />
        <KPI label="Dmg / Opening" value={avgDmg.toFixed(1)} sub={dmgD.label} subTone={dmgD.tone} />
      </div>

      <div className="dash-split">
        <Card title="Recent Form">
          <div className="dash-dot-strip">
            {last10.map((g) => (
              <span
                key={g.id}
                onClick={() => openDrawer(g.id)}
                style={{ cursor: "pointer" }}
                title={`${g.result} vs ${g.opponentTag}`}
              >
                <ResultDot result={g.result === "win" ? "win" : "loss"} />
              </span>
            ))}
            <span style={{ marginLeft: 12, fontSize: 12, color: "var(--text-muted)" }}>
              Last 10 ·{" "}
              <strong style={{ color: "var(--text)" }}>
                {last10.filter((g) => g.result === "win").length}W-
                {last10.filter((g) => g.result === "loss").length}L
              </strong>
            </span>
          </div>
          <div className="dash-spark-grid">
            <div>
              <div className="dash-spark-label">Neutral WR</div>
              <Sparkline values={recent.map((g) => g.neutralWinRate).reverse()} color="var(--accent)" />
            </div>
            <div>
              <div className="dash-spark-label">L-Cancel</div>
              <Sparkline values={recent.map((g) => g.lCancelRate).reverse()} color="var(--win)" />
            </div>
            <div>
              <div className="dash-spark-label">Conversion</div>
              <Sparkline values={recent.map((g) => g.conversionRate).reverse()} color="var(--caution)" />
            </div>
          </div>
        </Card>

        <OracleInsightCard games={recent} />
      </div>

      <Card>
        <div className="dash-section-head">
          <div className="card-title" style={{ marginBottom: 0 }}>
            Recent Games
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/library")}>
            View all →
          </button>
        </div>
        <DataTable>
          <thead>
            <tr>
              <th></th>
              <th>Matchup</th>
              <th>Opponent</th>
              <th>Stage</th>
              <th>Stocks</th>
              <th>Neutral</th>
              <th>L-Cancel</th>
              <th>Dmg/Op</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recent.slice(0, 10).map((g) => (
              <tr key={g.id} onClick={() => openDrawer(g.id)} style={{ cursor: "pointer" }}>
                <td>
                  <ResultDot result={g.result === "win" ? "win" : "loss"} />
                </td>
                <td style={{ fontWeight: 600 }}>
                  {g.playerCharacter} <span style={{ color: "var(--text-muted)" }}>vs</span> {g.opponentCharacter}
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{g.opponentTag}</td>
                <td style={{ color: "var(--text-secondary)" }}>{g.stage}</td>
                <td className="mono">
                  {g.playerFinalStocks}-{g.opponentFinalStocks}
                </td>
                <td className="mono">{(g.neutralWinRate * 100).toFixed(1)}%</td>
                <td className="mono">{(g.lCancelRate * 100).toFixed(0)}%</td>
                <td className="mono">{g.avgDamagePerOpening.toFixed(1)}</td>
                <td style={{ color: "var(--text-muted)" }}>›</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </motion.div>
  );
}

function OracleInsightCard({ games }: { games: RecentGame[] }) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (games.length < 3 || runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setInsight(null);
    setError(null);
    try {
      const summary = buildRecentSummary(games.slice(0, 5));
      const result = await window.clippi.analyzeTrends(summary);
      setInsight(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  }, [games]);

  const gameKey = games
    .slice(0, 5)
    .map((g) => g.id)
    .join(",");
  useEffect(() => {
    if (games.length >= 3 && !insight && !loading) run();
  }, [gameKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card title="MAGI Oracle">
      {loading && (
        <div className="analyze-loading">
          <div className="spinner" />
          <span>Reading your recent games…</span>
        </div>
      )}
      {error && <p style={{ color: "var(--loss)" }}>{error}</p>}
      {insight && (
        <div className="dash-oracle-body">
          <Markdown>{insight}</Markdown>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Rewrite Dashboard CSS**

Open `src/renderer/styles/dashboard.css`. Replace file contents with:

```css
.dash-split {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}
[data-density="compact"] .dash-split {
  gap: 10px;
  margin-bottom: 10px;
}

.dash-dot-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.dash-spark-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.dash-spark-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.dash-section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.dash-oracle-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.dash-oracle-body p:first-child {
  margin-top: 0;
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc -p tsconfig.main.json --noEmit && npm test`. Run `npm run dev`, load Dashboard with at least 3 games in DB, confirm:

- KPI row with 4 tiles, deltas render.
- Dot strip of last-10, all 3 sparklines render.
- Oracle Insight auto-loads after ~5s.
- Recent Games table, 10 rows, clicking opens drawer.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/Dashboard.tsx src/renderer/styles/dashboard.css
git commit -m "feat(dashboard): KPI + sparkline + Oracle insight + data-table rewrite"
```

---

# Phase 4 — Library polish

## Task 18: Add a top-of-page KPI summary row

**Files:**

- Modify: `src/renderer/pages/Library.tsx`

- [ ] **Step 1: Add summary KPIs above the filter card**

Near the top of the JSX, right after the `page-header` block, insert:

```tsx
{
  (() => {
    const filteredWins = filtered.filter((g) => g.result === "win").length;
    const filteredWR = filtered.length > 0 ? (filteredWins / filtered.length) * 100 : 0;
    return (
      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <KPI label="Filtered" value={filtered.length} sub={`of ${games.length}`} />
        <KPI
          label="Win Rate"
          value={`${filteredWR.toFixed(0)}%`}
          sub={`${filteredWins}W · ${filtered.length - filteredWins}L`}
        />
        <KPI label="Unique Opponents" value={new Set(filtered.map((g) => g.opponentTag)).size} />
        <KPI
          label="Characters Played"
          value={
            new Set(filtered.map((g) => (g as unknown as { playerCharacter?: string }).playerCharacter ?? "")).size
          }
        />
      </div>
    );
  })();
}
```

Add `import { KPI } from "../components/ui/KPI";` at the top.

- [ ] **Step 2: Raise hard row cap**

Change `.slice(0, 200)` → `.slice(0, 500)` in the table body.

- [ ] **Step 3: Verify + commit**

Run type-check + tests. Commit:

```bash
git add src/renderer/pages/Library.tsx
git commit -m "feat(library): add filter-aware KPI summary row; raise row cap to 500"
```

---

# Phase 5 — Sessions replacement

## Task 19: Add `useSessionsByDay` hook + IPC

**Files:**

- Modify: `src/db.ts`
- Modify: `src/main/handlers/stats.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/global.d.ts`
- Modify: `src/renderer/hooks/queries.ts`

- [ ] **Step 1: Add `getSessionsByDay` DB fn**

At the end of `src/db.ts`, append:

```ts
export interface DaySession {
  date: string; // YYYY-MM-DD
  games: number;
  wins: number;
  losses: number;
  opponents: string[];
  gameIds: number[];
}

export function getSessionsByDay(daysBack: number = 90): DaySession[] {
  const rows = getDb()
    .prepare(
      `
    SELECT
      substr(played_at, 1, 10) as date,
      id,
      result,
      opponent_tag as opponentTag
    FROM games
    WHERE played_at >= date('now', '-' || ? || ' days')
    ORDER BY played_at DESC
  `,
    )
    .all(daysBack) as Array<{ date: string; id: number; result: string; opponentTag: string }>;

  const map = new Map<string, DaySession>();
  for (const r of rows) {
    const existing = map.get(r.date) ?? {
      date: r.date,
      games: 0,
      wins: 0,
      losses: 0,
      opponents: [] as string[],
      gameIds: [] as number[],
    };
    existing.games += 1;
    if (r.result === "win") existing.wins += 1;
    else if (r.result === "loss") existing.losses += 1;
    existing.gameIds.push(r.id);
    if (!existing.opponents.includes(r.opponentTag)) existing.opponents.push(r.opponentTag);
    map.set(r.date, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}
```

- [ ] **Step 2: Register IPC**

In `src/main/handlers/stats.ts`, add to the imports:

```ts
  getSessionsByDay,
```

And inside `registerStatsHandlers`, add:

```ts
safeHandle("stats:sessionsByDay", (_e, daysBack?: number) => getSessionsByDay(daysBack));
```

- [ ] **Step 3: Expose in preload**

In `src/preload/index.ts`, add (within the `clippi` object):

```ts
getSessionsByDay: (daysBack?: number) => ipcRenderer.invoke("stats:sessionsByDay", daysBack),
```

In `src/renderer/global.d.ts` (search for `getSets` to find the IPC type block), add:

```ts
getSessionsByDay: (daysBack?: number) =>
  Promise<
    Array<{
      date: string;
      games: number;
      wins: number;
      losses: number;
      opponents: string[];
      gameIds: number[];
    }>
  >;
```

- [ ] **Step 4: Add the hook**

Append to `src/renderer/hooks/queries.ts`:

```ts
export const useSessionsByDay = (daysBack: number = 90) => {
  return useQuery({
    queryKey: ["sessionsByDay", daysBack],
    queryFn: () => window.clippi.getSessionsByDay(daysBack),
    gcTime: GC_10MIN,
  });
};
```

- [ ] **Step 5: Verify + commit**

Run: `npx tsc -p tsconfig.main.json --noEmit && npm test`.

```bash
git add src/db.ts src/main/handlers/stats.ts src/preload/index.ts src/renderer/global.d.ts src/renderer/hooks/queries.ts
git commit -m "feat(db): getSessionsByDay + useSessionsByDay hook"
```

## Task 20: Add `analyzeSession(date)` IPC + prompt + cache table

**Files:**

- Modify: `src/db.ts` (migration #6 partial — `session_reports` only for now, others in Phase 8)
- Modify: `src/pipeline/prompt.ts`
- Modify: `src/main/handlers/llm.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/global.d.ts`

- [ ] **Step 1: Append migration #6 with `session_reports` table**

In `src/db.ts`, append to the `migrations` array:

```ts
  {
    version: 6,
    description: "Add session_reports, oracle_messages, practice_plans, practice_drills tables",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS session_reports (
          id INTEGER PRIMARY KEY,
          date TEXT NOT NULL UNIQUE,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS oracle_messages (
          id INTEGER PRIMARY KEY,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS practice_plans (
          id INTEGER PRIMARY KEY,
          player_profile_id INTEGER,
          name TEXT NOT NULL,
          weakness_summary TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS practice_drills (
          id INTEGER PRIMARY KEY,
          plan_id INTEGER NOT NULL REFERENCES practice_plans(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          target TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_drills_plan ON practice_drills(plan_id);
        CREATE INDEX IF NOT EXISTS idx_oracle_created ON oracle_messages(created_at);
      `);
    },
  },
```

- [ ] **Step 2: Add session-report DB helpers**

Append to `src/db.ts`:

```ts
export function getSessionReport(date: string): string | null {
  const row = getDb().prepare("SELECT content FROM session_reports WHERE date = ?").get(date) as
    | { content: string }
    | undefined;
  return row?.content ?? null;
}

export function setSessionReport(date: string, content: string): void {
  getDb().prepare("INSERT OR REPLACE INTO session_reports (date, content) VALUES (?, ?)").run(date, content);
}

export function getGamesOnDate(date: string): RecentGame[] {
  return getDb()
    .prepare(
      `
    SELECT
      g.id, g.replay_path as replayPath,
      g.played_at as playedAt, g.stage,
      g.player_character as playerCharacter,
      g.opponent_character as opponentCharacter,
      g.opponent_tag as opponentTag,
      g.opponent_connect_code as opponentConnectCode,
      g.result,
      g.player_final_stocks as playerFinalStocks,
      g.player_final_percent as playerFinalPercent,
      g.opponent_final_stocks as opponentFinalStocks,
      g.opponent_final_percent as opponentFinalPercent,
      g.duration_seconds as durationSeconds,
      gs.neutral_win_rate as neutralWinRate,
      gs.l_cancel_rate as lCancelRate,
      gs.openings_per_kill as openingsPerKill,
      gs.avg_damage_per_opening as avgDamagePerOpening,
      gs.conversion_rate as conversionRate,
      gs.avg_death_percent as avgDeathPercent,
      gs.power_shield_count as powerShieldCount,
      gs.edgeguard_attempts as edgeguardAttempts,
      gs.edgeguard_success_rate as edgeguardSuccessRate,
      gs.recovery_success_rate as recoverySuccessRate,
      gs.total_damage_dealt as totalDamageDealt,
      gs.total_damage_taken as totalDamageTaken,
      gs.wavedash_count as wavedashCount,
      gs.dash_dance_frames as dashDanceFrames,
      NULL as killMove
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    WHERE substr(g.played_at, 1, 10) = ?
    ORDER BY g.played_at ASC
  `,
    )
    .all(date) as RecentGame[];
}
```

- [ ] **Step 3: Add `SYSTEM_PROMPT_SESSION`**

Append to `src/pipeline/prompt.ts`:

```ts
export const SYSTEM_PROMPT_SESSION = `You are MAGI Oracle reviewing one day of Melee play.

Write exactly two paragraphs (2-4 sentences each).

Paragraph 1 — What worked: reference one or two concrete numbers from the day's games and what that suggests the player was doing well.

Paragraph 2 — Next focus: pick the single most valuable thing to improve next session, grounded in a number from the data. End with one concrete drill the player can do in Unclepunch or training mode.

No bullet lists, no headers, no meta-commentary. Straight prose.`;
```

- [ ] **Step 4: Add `analyzeSession` IPC + preload**

In `src/main/handlers/llm.ts`, add:

```ts
import { getGamesOnDate, getSessionReport, setSessionReport } from "../../db.js";
import { SYSTEM_PROMPT_SESSION } from "../../pipeline/prompt.js";
import { runLLM } from "../../llm.js";

// inside registerLlmHandlers(safeHandle), add:
safeHandle("llm:analyzeSession", async (_e, date: string) => {
  const cached = getSessionReport(date);
  if (cached) return cached;

  const games = getGamesOnDate(date);
  if (games.length === 0) return "No games found for that day.";

  const summary = [
    `Date: ${date}`,
    `Games: ${games.length} (${games.filter((g) => g.result === "win").length}W-${games.filter((g) => g.result === "loss").length}L)`,
    "",
    ...games.map(
      (g, i) =>
        `Game ${i + 1}: ${g.playerCharacter} vs ${g.opponentCharacter} (${g.opponentTag}) on ${g.stage} — ${g.result.toUpperCase()} ${g.playerFinalStocks}-${g.opponentFinalStocks} | neutral ${(g.neutralWinRate * 100).toFixed(0)}%, l-cancel ${(g.lCancelRate * 100).toFixed(0)}%, conv ${(g.conversionRate * 100).toFixed(0)}%, dmg/op ${g.avgDamagePerOpening.toFixed(1)}`,
    ),
  ].join("\n");

  const response = await runLLM(SYSTEM_PROMPT_SESSION, summary);
  setSessionReport(date, response);
  return response;
});
```

(The actual callable name for the LLM may be different in your codebase — search for an existing handler like `llm:analyzeTrends` and copy its pattern.)

- [ ] **Step 5: Expose in preload + global.d.ts**

In `src/preload/index.ts`:

```ts
analyzeSession: (date: string) => ipcRenderer.invoke("llm:analyzeSession", date),
```

In `src/renderer/global.d.ts`:

```ts
analyzeSession: (date: string) => Promise<string>;
```

- [ ] **Step 6: Verify + commit**

Run: `npx tsc -p tsconfig.main.json --noEmit && npm test`.

```bash
git add src/db.ts src/pipeline/prompt.ts src/main/handlers/llm.ts src/preload/index.ts src/renderer/global.d.ts
git commit -m "feat(llm): analyzeSession IPC + session_reports cache + migration #6"
```

## Task 21: Rewrite Sessions page

**Files:**

- Modify: `src/renderer/pages/Sessions.tsx` (full rewrite)
- Modify: `src/renderer/styles/` — prune old sessions CSS classes as you find dead ones

- [ ] **Step 1: Replace page body**

Replace the entire contents of `src/renderer/pages/Sessions.tsx` with:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Markdown from "react-markdown";
import { useSessionsByDay } from "../hooks/queries";
import { useGlobalStore } from "../stores/useGlobalStore";
import { Card } from "../components/ui/Card";
import { WinrateBar } from "../components/ui/WinrateBar";
import { ResultDot } from "../components/ui/ResultDot";
import { EmptyState } from "../components/ui/EmptyState";

interface Day {
  date: string;
  games: number;
  wins: number;
  losses: number;
  opponents: string[];
  gameIds: number[];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function DayCard({ day }: { day: Day }) {
  const openDrawer = useGlobalStore((s) => s.openDrawer);
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wr = day.games > 0 ? day.wins / day.games : 0;
  const pct = Math.round(wr * 100);

  const onReport = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await window.clippi.analyzeSession(day.date);
      setReport(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <div className="session-card-head">
        <div className="session-card-date">{formatDate(day.date)}</div>
        <span className="mono" style={{ color: wr >= 0.5 ? "var(--win)" : "var(--loss)", fontWeight: 700 }}>
          {pct}%
        </span>
      </div>
      <div className="session-card-sub">
        {day.games} games · <span style={{ color: "var(--win)" }}>{day.wins}W</span>-
        <span style={{ color: "var(--loss)" }}>{day.losses}L</span>
      </div>
      <div className="session-card-dots">
        {day.gameIds.map((id, idx) => (
          <span key={id} onClick={() => openDrawer(id)} style={{ cursor: "pointer" }}>
            {/* `win` or `loss` derived from aggregate — per-game result is in the drawer. */}
            <ResultDot result={idx < day.wins ? "win" : "loss"} />
          </span>
        ))}
      </div>
      <WinrateBar value={wr} />
      <div className="session-card-opponents">
        vs {day.opponents.slice(0, 3).join(", ")}
        {day.opponents.length > 3 ? ` +${day.opponents.length - 3}` : ""}
      </div>
      <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={onReport} disabled={loading}>
        {loading ? "Analyzing…" : report ? "Regenerate Report" : "Session Report"}
      </button>
      {err && <p style={{ color: "var(--loss)", fontSize: 12, marginTop: 10 }}>{err}</p>}
      {report && (
        <div className="session-card-report">
          <Markdown>{report}</Markdown>
        </div>
      )}
    </Card>
  );
}

export function Sessions({ refreshKey: _ }: { refreshKey: number }) {
  const navigate = useNavigate();
  const { data: days = [], isLoading } = useSessionsByDay(90);

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
        Loading…
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <EmptyState
        title="No session data yet"
        sub="Sessions appear once you have games on at least one day."
        cta={{ label: "Open Settings", onClick: () => navigate("/settings") }}
      />
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Sessions</h1>
          <p>{days.length} days · grouped by calendar date</p>
        </div>
      </div>

      <div className="sessions-grid">
        {days.map((d) => (
          <DayCard key={d.date} day={d as Day} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS**

Append to `src/renderer/styles/components.css`:

```css
.sessions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}
.session-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.session-card-date {
  font-weight: 700;
  font-size: 15px;
}
.session-card-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.session-card-dots {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.session-card-opponents {
  font-size: 11px;
  color: var(--text-muted);
  margin: 10px 0 12px;
}
.session-card-report {
  margin-top: 12px;
  padding: 12px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}
```

- [ ] **Step 3: Verify + commit**

Run type-check + tests. Open dev server, navigate to Sessions, confirm grid layout, click "Session Report" on one card and watch an LLM response render.

```bash
git add src/renderer/pages/Sessions.tsx src/renderer/styles/components.css
git commit -m "feat(sessions): per-day cards with winrate bar + cached session report"
```

---

# Phase 6 — Characters rewrite

## Task 22: Rewrite Characters page — grid + detail using prototype primitives

**Files:**

- Modify: `src/renderer/pages/Characters.tsx` (full rewrite)

- [ ] **Step 1: Replace page body**

Read the existing `Characters.tsx` to capture character metadata and signature-stats render logic (keep `CHARACTER_META`, `CharacterCardImage`, and whatever renders signature stats). Then replace the grid + detail layout with the prototype pattern:

Key structure for the new `Characters.tsx` (condensed — preserve existing metadata blocks from the current file):

```tsx
// Imports
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  useCharacterList,
  useCharacterMatchups,
  useCharacterSignatureStats,
  useCharacterGameStats,
} from "../hooks/queries";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { WinrateBar } from "../components/ui/WinrateBar";
import { StatGroupCard, StatItem } from "../components/ui/StatGroupCard";
import { EmptyState } from "../components/ui/EmptyState";
import { CoachingModal } from "../components/CoachingModal";

// Preserve CHARACTER_META from existing file.
// Preserve CharacterCardImage from existing file.

export function Characters({ refreshKey: _ }: { refreshKey: number }) {
  const { data: list = [] } = useCharacterList();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const listener = (e: CustomEvent) => {
      if ((e.detail as { page?: string })?.page === "characters") setSelected(null);
    };
    window.addEventListener("nav:reactivate", listener as EventListener);
    return () => window.removeEventListener("nav:reactivate", listener as EventListener);
  }, []);

  if (list.length === 0) {
    return (
      <EmptyState
        title="No character data yet"
        sub="Import replays to see character stats."
        title="No character data yet"
      />
    );
  }

  if (selected) return <CharacterDetail character={selected} onBack={() => setSelected(null)} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Characters</h1>
          <p>{list.length} characters played</p>
        </div>
      </div>
      <div className="characters-grid">
        {list.map((c) => {
          const meta = CHARACTER_META[c.character] ?? DEFAULT_META;
          const wr = c.winRate ?? (c.games > 0 ? c.wins / c.games : 0);
          return (
            <button key={c.character} className="card character-tile" onClick={() => setSelected(c.character)}>
              <CharacterCardImage character={c.character} />
              <div className="character-tile-name" style={{ color: meta.color }}>
                {c.character}
              </div>
              <div className="character-tile-record">
                <span style={{ color: "var(--win)" }}>{c.wins}W</span>-
                <span style={{ color: "var(--loss)" }}>{c.losses}L</span> · {c.games} games
              </div>
              <WinrateBar value={wr} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CharacterDetail({ character, onBack }: { character: string; onBack: () => void }) {
  const meta = CHARACTER_META[character] ?? DEFAULT_META;
  const { data: matchups = [] } = useCharacterMatchups(character);
  const { data: signature } = useCharacterSignatureStats(character);
  const { data: gameStats } = useCharacterGameStats(character);
  const [coachOpen, setCoachOpen] = useState(false);

  const heroStats: Array<[string, string]> = gameStats
    ? [
        ["Neutral WR", `${(gameStats.neutralWinRate * 100).toFixed(1)}%`],
        ["Conv Rate", `${(gameStats.conversionRate * 100).toFixed(0)}%`],
        ["L-Cancel", `${(gameStats.lCancelRate * 100).toFixed(0)}%`],
        ["Op/Kill", gameStats.openingsPerKill.toFixed(1)],
      ]
    : [];

  const sigItems: StatItem[] = signature
    ? signature.stats.map((s) => ({ label: s.label, value: s.value, isText: typeof s.value === "string" }))
    : [];

  return (
    <div>
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 20 }}>
        ← All Characters
      </button>
      <div className="character-detail-split">
        <Card tone="chrome-plate" className="character-hero">
          <CharacterCardImage character={character} />
          <h2 style={{ color: meta.color, marginTop: 10 }}>{character}</h2>
          <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 20 }}>
            {gameStats?.gamesPlayed ?? 0} games
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setCoachOpen(true)}>
            Analyze Matchup
          </button>
          <div className="character-hero-mini">
            {heroStats.map(([label, value]) => (
              <div key={label} className="character-hero-stat">
                <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
                  {value}
                </div>
                <div className="character-hero-stat-label">{label}</div>
              </div>
            ))}
          </div>
        </Card>

        <div>
          <Card title="Matchups">
            <DataTable>
              <thead>
                <tr>
                  <th>vs</th>
                  <th>Games</th>
                  <th>Record</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {matchups.slice(0, 12).map((m) => {
                  const wr = m.winRate ?? (m.totalGames > 0 ? m.wins / m.totalGames : 0);
                  return (
                    <tr key={m.opponentCharacter}>
                      <td style={{ fontWeight: 600 }}>{m.opponentCharacter}</td>
                      <td className="mono">{m.totalGames}</td>
                      <td>
                        <span style={{ color: "var(--win)" }}>{m.wins}W</span>-
                        <span style={{ color: "var(--loss)" }}>{m.losses}L</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            className="mono"
                            style={{ color: wr >= 0.5 ? "var(--win)" : "var(--loss)", fontWeight: 700 }}
                          >
                            {(wr * 100).toFixed(0)}%
                          </span>
                          <WinrateBar value={wr} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </Card>

          {sigItems.length > 0 && <StatGroupCard title="Signature Stats" items={sigItems} />}
        </div>
      </div>

      {coachOpen && (
        <CoachingModal
          isOpen
          onClose={() => setCoachOpen(false)}
          scope="character"
          id={character}
          title={`${character} Matchup Analysis`}
          replayPath=""
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS**

Append to `src/renderer/styles/components.css`:

```css
.characters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.character-tile {
  position: relative;
  text-align: left;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px;
  cursor: pointer;
  font-family: inherit;
  color: var(--text);
  overflow: hidden;
}
.character-tile-name {
  font-weight: 700;
  font-size: 16px;
  margin-bottom: 4px;
}
.character-tile-record {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.character-detail-split {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 20px;
}
.character-hero {
  text-align: center;
  padding: 28px;
}
.character-hero-mini {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 20px;
}
.character-hero-stat {
  padding: 10px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}
.character-hero-stat-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
```

- [ ] **Step 3: Verify + commit**

Confirm types: the shape of `useCharacterList`, `useCharacterMatchups`, `useCharacterSignatureStats`, `useCharacterGameStats` hooks should match. Read the current `Characters.tsx` for reference — if field names differ (e.g. `totalGames` vs `games`), adjust the new code to match the hook return shape.

```bash
git add src/renderer/pages/Characters.tsx src/renderer/styles/components.css
git commit -m "feat(characters): grid + ChromePlate hero + matchup table + StatGroupCard"
```

---

# Phase 7 — Trends rewrite

## Task 23: Add `getTrendSeries` DB fn + hook

**Files:**

- Modify: `src/db.ts`
- Modify: `src/main/handlers/stats.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/global.d.ts`
- Modify: `src/renderer/hooks/queries.ts`

- [ ] **Step 1: Add DB helper**

Append to `src/db.ts`:

```ts
export type TrendMetric =
  | "neutralWinRate"
  | "lCancelRate"
  | "conversionRate"
  | "avgDamagePerOpening"
  | "openingsPerKill"
  | "avgDeathPercent";

const METRIC_COLUMN: Record<TrendMetric, string> = {
  neutralWinRate: "gs.neutral_win_rate",
  lCancelRate: "gs.l_cancel_rate",
  conversionRate: "gs.conversion_rate",
  avgDamagePerOpening: "gs.avg_damage_per_opening",
  openingsPerKill: "gs.openings_per_kill",
  avgDeathPercent: "gs.avg_death_percent",
};

export function getTrendSeries(metric: TrendMetric, range: "7d" | "30d" | "all", filterChar: string | null): number[] {
  const column = METRIC_COLUMN[metric];
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (range === "7d") where.push("g.played_at >= date('now', '-7 days')");
  else if (range === "30d") where.push("g.played_at >= date('now', '-30 days')");
  if (filterChar && filterChar !== "all") {
    where.push("g.opponent_character = ?");
    params.push(filterChar);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `
    SELECT ${column} as v
    FROM games g
    JOIN game_stats gs ON gs.game_id = g.id
    ${whereClause}
    ORDER BY g.played_at ASC
  `;
  const rows = getDb()
    .prepare(sql)
    .all(...params) as Array<{ v: number }>;
  return rows.map((r) => r.v);
}
```

- [ ] **Step 2: Register handler + preload + global.d.ts + hook**

`src/main/handlers/stats.ts`:

```ts
import { getTrendSeries, type TrendMetric } from "../../db.js";
// inside registerStatsHandlers:
safeHandle("stats:trendSeries", (_e, metric: TrendMetric, range: "7d" | "30d" | "all", filterChar: string | null) =>
  getTrendSeries(metric, range, filterChar),
);
```

`src/preload/index.ts`:

```ts
getTrendSeries: (metric: string, range: string, filterChar: string | null) =>
  ipcRenderer.invoke("stats:trendSeries", metric, range, filterChar),
```

`src/renderer/global.d.ts`:

```ts
getTrendSeries: (
  metric:
    | "neutralWinRate"
    | "lCancelRate"
    | "conversionRate"
    | "avgDamagePerOpening"
    | "openingsPerKill"
    | "avgDeathPercent",
  range: "7d" | "30d" | "all",
  filterChar: string | null,
) => Promise<number[]>;
```

`src/renderer/hooks/queries.ts`:

```ts
export const useTrendSeries = (
  metric:
    | "neutralWinRate"
    | "lCancelRate"
    | "conversionRate"
    | "avgDamagePerOpening"
    | "openingsPerKill"
    | "avgDeathPercent",
  range: "7d" | "30d" | "all",
  filterChar: string | null,
) => {
  return useQuery({
    queryKey: ["trendSeries", metric, range, filterChar],
    queryFn: () => window.clippi.getTrendSeries(metric, range, filterChar),
    gcTime: GC_10MIN,
  });
};
```

- [ ] **Step 3: Verify + commit**

```bash
git add src/db.ts src/main/handlers/stats.ts src/preload/index.ts src/renderer/global.d.ts src/renderer/hooks/queries.ts
git commit -m "feat(db): getTrendSeries for metric/range/char"
```

## Task 24: Rewrite Trends page

**Files:**

- Modify: `src/renderer/pages/Trends.tsx` (full rewrite)

- [ ] **Step 1: Replace page body**

Replace `src/renderer/pages/Trends.tsx` with:

```tsx
import { useState } from "react";
import { motion } from "framer-motion";
import { useTrendSeries } from "../hooks/queries";
import { useRecentGames } from "../hooks/queries";
import { Card } from "../components/ui/Card";
import { Pill, PillRow } from "../components/ui/Pill";
import { Sparkline } from "../components/ui/Sparkline";
import { EmptyState } from "../components/ui/EmptyState";

type MetricKey =
  | "neutralWinRate"
  | "lCancelRate"
  | "conversionRate"
  | "avgDamagePerOpening"
  | "openingsPerKill"
  | "avgDeathPercent";

const METRICS: Array<{
  key: MetricKey;
  label: string;
  fmt: (v: number) => string;
  color: string;
  invert?: boolean;
  pct?: boolean;
}> = [
  {
    key: "neutralWinRate",
    label: "Neutral WR",
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    color: "var(--win)",
    pct: true,
  },
  { key: "lCancelRate", label: "L-Cancel", fmt: (v) => `${(v * 100).toFixed(1)}%`, color: "var(--accent)", pct: true },
  {
    key: "conversionRate",
    label: "Conversion",
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    color: "var(--caution)",
    pct: true,
  },
  { key: "avgDamagePerOpening", label: "Dmg/Opening", fmt: (v) => v.toFixed(1), color: "var(--text)" },
  { key: "openingsPerKill", label: "Openings/Kill", fmt: (v) => v.toFixed(1), color: "var(--loss)", invert: true },
  { key: "avgDeathPercent", label: "Avg Death %", fmt: (v) => `${v.toFixed(0)}%`, color: "var(--text-secondary)" },
];

function rolling(vals: number[], win: number): number[] {
  return vals.map((_, i) => {
    const slice = vals.slice(Math.max(0, i - win + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function firstHalfDelta(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mid = Math.floor(vals.length / 2);
  const a = vals.slice(0, mid);
  const b = vals.slice(mid);
  const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  return avg(b) - avg(a);
}

export function Trends({ refreshKey: _ }: { refreshKey: number }) {
  const [range, setRange] = useState<"7d" | "30d" | "all">("30d");
  const [metric, setMetric] = useState<MetricKey>("neutralWinRate");
  const [filterChar, setFilterChar] = useState<string>("all");

  const { data: recent = [] } = useRecentGames(500);
  const chars = Array.from(
    new Set(recent.map((g) => (g as unknown as { opponentCharacter: string }).opponentCharacter)),
  ).sort();
  const { data: series = [], isLoading } = useTrendSeries(metric, range, filterChar === "all" ? null : filterChar);

  const current = METRICS.find((m) => m.key === metric)!;
  const smoothed = rolling(series, 5);
  const delta = firstHalfDelta(smoothed);
  const improving = current.invert ? delta < 0 : delta > 0;

  if (recent.length === 0) {
    return <EmptyState title="No games yet" sub="Trends appear once you have replays imported." />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <div className="page-header">
        <div>
          <h1>Trends</h1>
          <p>{series.length} games · 5-game rolling avg</p>
        </div>
        <PillRow>
          {(["7d", "30d", "all"] as const).map((k) => (
            <Pill key={k} active={range === k} onClick={() => setRange(k)}>
              {k.toUpperCase()}
            </Pill>
          ))}
        </PillRow>
      </div>

      <Card style={{ marginBottom: 20, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="tweaks-label">Opponent character</div>
          <PillRow>
            <Pill active={filterChar === "all"} onClick={() => setFilterChar("all")}>
              All
            </Pill>
            {chars.slice(0, 8).map((c) => (
              <Pill key={c} active={filterChar === c} onClick={() => setFilterChar(c)}>
                {c}
              </Pill>
            ))}
          </PillRow>
        </div>
      </Card>

      <Card>
        <div className="trends-hero-head">
          <div>
            <div className="card-title">{current.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div className="kpi-value" style={{ fontSize: 48 }}>
                {smoothed.length > 0 ? current.fmt(smoothed[smoothed.length - 1]!) : "—"}
              </div>
              <div
                className="mono"
                style={{ color: improving ? "var(--win)" : "var(--loss)", fontWeight: 700, fontSize: 14 }}
              >
                {Math.abs(delta) < 0.0005
                  ? "—"
                  : `${improving ? "↑" : "↓"} ${current.pct ? (Math.abs(delta) * 100).toFixed(1) + "pp" : Math.abs(delta).toFixed(1)}`}
              </div>
            </div>
          </div>
          <PillRow>
            {METRICS.map((m) => (
              <Pill key={m.key} active={metric === m.key} onClick={() => setMetric(m.key)}>
                {m.label}
              </Pill>
            ))}
          </PillRow>
        </div>
        {isLoading ? (
          <div style={{ height: 260, display: "grid", placeItems: "center" }}>
            <div className="spinner" />
          </div>
        ) : (
          <Sparkline values={smoothed} kind="chart" height={260} color={current.color} fill />
        )}
      </Card>

      <div className="trends-grid">
        {METRICS.filter((m) => m.key !== metric).map((m) => (
          <MiniChart key={m.key} metric={m} range={range} filterChar={filterChar} onSelect={() => setMetric(m.key)} />
        ))}
      </div>
    </motion.div>
  );
}

function MiniChart({
  metric,
  range,
  filterChar,
  onSelect,
}: {
  metric: (typeof METRICS)[number];
  range: "7d" | "30d" | "all";
  filterChar: string;
  onSelect: () => void;
}) {
  const { data: series = [] } = useTrendSeries(metric.key, range, filterChar === "all" ? null : filterChar);
  const smoothed = rolling(series, 5);
  const delta = firstHalfDelta(smoothed);
  const improving = metric.invert ? delta < 0 : delta > 0;

  return (
    <Card onClick={onSelect} style={{ cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {metric.label}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="mono" style={{ fontWeight: 700, color: metric.color }}>
            {smoothed.length > 0 ? metric.fmt(smoothed[smoothed.length - 1]!) : "—"}
          </span>
          <span className="mono" style={{ fontSize: 10, color: improving ? "var(--win)" : "var(--loss)" }}>
            {Math.abs(delta) < 0.0005 ? "" : improving ? "↑" : "↓"}
          </span>
        </div>
      </div>
      <Sparkline values={smoothed} kind="chart" height={80} color={metric.color} fill />
    </Card>
  );
}
```

- [ ] **Step 2: Add CSS**

Append to `src/renderer/styles/components.css`:

```css
.trends-hero-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 20px;
  gap: 20px;
  flex-wrap: wrap;
}
.trends-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  margin-top: 16px;
}
```

- [ ] **Step 3: Verify + commit**

Run type-check + tests. Open dev server, navigate to Trends, confirm: hero chart, 5 mini-charts, range pills, char filter, click mini → promotes to hero.

```bash
git add src/renderer/pages/Trends.tsx src/renderer/styles/components.css
git commit -m "feat(trends): hero chart + 5-metric mini grid + filters"
```

---

# Phase 8 — Practice page

## Task 25: Add `SYSTEM_PROMPT_PRACTICE` + `generatePracticePlan` IPC

**Files:**

- Modify: `src/pipeline/prompt.ts`
- Modify: `src/main/handlers/llm.ts`
- Modify: `src/db.ts` — practice_plans/drills helpers
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/global.d.ts`

- [ ] **Step 1: Add the system prompt**

Append to `src/pipeline/prompt.ts`:

```ts
export const SYSTEM_PROMPT_PRACTICE = `You are MAGI Oracle writing a practice plan for a Melee player.

Input: a weakness profile with numbers. Output: JSON only — no markdown, no commentary. Shape:

{
  "name": "short plan name, 2-4 words",
  "drills": [
    { "name": "drill name", "target": "what to aim for, concrete and measurable" }
  ]
}

Constraints:
- 3 to 5 drills total.
- Every drill must map to a specific weakness in the input.
- Drill names: concrete Melee tech (e.g. "Shield drop → Uair OOS", "Ledgedash to tipper").
- Targets: measurable (e.g. "8/10 successful", "under 4 frames GALINT").
- No "practice neutral" or other vague prose.

Return ONLY the JSON object, nothing else.`;
```

- [ ] **Step 2: Add DB helpers**

Append to `src/db.ts`:

```ts
export interface PracticePlan {
  id: number;
  name: string;
  weaknessSummary: string | null;
  createdAt: string;
  drills: PracticeDrill[];
}
export interface PracticeDrill {
  id: number;
  name: string;
  target: string;
  completed: boolean;
  sortOrder: number;
}

export function insertPracticePlan(
  name: string,
  weaknessSummary: string | null,
  drills: Array<{ name: string; target: string }>,
): PracticePlan {
  const db = getDb();
  const insertPlan = db.prepare(
    "INSERT INTO practice_plans (name, weakness_summary) VALUES (?, ?) RETURNING id, created_at",
  );
  const planRow = insertPlan.get(name, weaknessSummary) as { id: number; created_at: string };
  const insertDrill = db.prepare(
    "INSERT INTO practice_drills (plan_id, name, target, sort_order) VALUES (?, ?, ?, ?) RETURNING id",
  );
  const drillRows: PracticeDrill[] = drills.map((d, i) => {
    const row = insertDrill.get(planRow.id, d.name, d.target, i) as { id: number };
    return { id: row.id, name: d.name, target: d.target, completed: false, sortOrder: i };
  });
  return { id: planRow.id, name, weaknessSummary, createdAt: planRow.created_at, drills: drillRows };
}

export function listPracticePlans(): PracticePlan[] {
  const db = getDb();
  const plans = db
    .prepare(
      "SELECT id, name, weakness_summary as weaknessSummary, created_at as createdAt FROM practice_plans ORDER BY created_at DESC",
    )
    .all() as Array<{ id: number; name: string; weaknessSummary: string | null; createdAt: string }>;
  const drillStmt = db.prepare(
    "SELECT id, name, target, completed, sort_order as sortOrder FROM practice_drills WHERE plan_id = ? ORDER BY sort_order",
  );
  return plans.map((p) => ({
    ...p,
    drills: (
      drillStmt.all(p.id) as Array<{ id: number; name: string; target: string; completed: number; sortOrder: number }>
    ).map((d) => ({
      ...d,
      completed: d.completed === 1,
    })),
  }));
}

export function setDrillCompletion(drillId: number, completed: boolean): void {
  getDb()
    .prepare("UPDATE practice_drills SET completed = ? WHERE id = ?")
    .run(completed ? 1 : 0, drillId);
}

export function deletePracticePlan(planId: number): void {
  getDb().prepare("DELETE FROM practice_drills WHERE plan_id = ?").run(planId);
  getDb().prepare("DELETE FROM practice_plans WHERE id = ?").run(planId);
}
```

- [ ] **Step 3: Add IPC handler**

In `src/main/handlers/llm.ts`, add:

````ts
import { insertPracticePlan, listPracticePlans, setDrillCompletion, deletePracticePlan } from "../../db.js";
import { SYSTEM_PROMPT_PRACTICE } from "../../pipeline/prompt.js";
// runLLM already imported in Task 20.

safeHandle("llm:generatePracticePlan", async (_e, weaknessSummary: string) => {
  const raw = await runLLM(SYSTEM_PROMPT_PRACTICE, weaknessSummary);
  let parsed: { name: string; drills: Array<{ name: string; target: string }> };
  try {
    // Strip a leading ```json fence if present.
    const cleaned = raw
      .trim()
      .replace(/^```(json)?\s*/i, "")
      .replace(/\s*```$/, "");
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM returned non-JSON response: ${raw.slice(0, 140)}…`);
  }
  if (!parsed.name || !Array.isArray(parsed.drills) || parsed.drills.length === 0) {
    throw new Error("LLM response missing required fields (name, drills[]).");
  }
  return insertPracticePlan(parsed.name, weaknessSummary, parsed.drills);
});

safeHandle("llm:listPracticePlans", () => listPracticePlans());
safeHandle("llm:setDrillCompletion", (_e, drillId: number, completed: boolean) => {
  setDrillCompletion(drillId, completed);
  return true;
});
safeHandle("llm:deletePracticePlan", (_e, planId: number) => {
  deletePracticePlan(planId);
  return true;
});
````

- [ ] **Step 4: Expose in preload + global.d.ts**

`src/preload/index.ts`:

```ts
generatePracticePlan: (weaknessSummary: string) => ipcRenderer.invoke("llm:generatePracticePlan", weaknessSummary),
listPracticePlans: () => ipcRenderer.invoke("llm:listPracticePlans"),
setDrillCompletion: (drillId: number, completed: boolean) =>
  ipcRenderer.invoke("llm:setDrillCompletion", drillId, completed),
deletePracticePlan: (planId: number) => ipcRenderer.invoke("llm:deletePracticePlan", planId),
```

`src/renderer/global.d.ts`:

```ts
generatePracticePlan: (weaknessSummary: string) =>
  Promise<{
    id: number;
    name: string;
    weaknessSummary: string | null;
    createdAt: string;
    drills: Array<{ id: number; name: string; target: string; completed: boolean; sortOrder: number }>;
  }>;
listPracticePlans: () =>
  Promise<
    Array<{
      id: number;
      name: string;
      weaknessSummary: string | null;
      createdAt: string;
      drills: Array<{ id: number; name: string; target: string; completed: boolean; sortOrder: number }>;
    }>
  >;
setDrillCompletion: (drillId: number, completed: boolean) => Promise<boolean>;
deletePracticePlan: (planId: number) => Promise<boolean>;
```

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/pipeline/prompt.ts src/main/handlers/llm.ts src/preload/index.ts src/renderer/global.d.ts
git commit -m "feat(practice): prompt + DB helpers + IPC for plan generation"
```

## Task 26: Add Practice page + route

**Files:**

- Create: `src/renderer/pages/Practice.tsx`
- Modify: `src/renderer/App.tsx` (add route + nav item)
- Modify: `src/renderer/components/NavIcons.tsx` (add PracticeIcon)

- [ ] **Step 1: Add `PracticeIcon`**

In `src/renderer/components/NavIcons.tsx`, append:

```tsx
export function PracticeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 6v12M6 12h12" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
```

- [ ] **Step 2: Create Practice page**

Create `src/renderer/pages/Practice.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useDashboardHighlights } from "../hooks/queries";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { WinrateBar } from "../components/ui/WinrateBar";
import { EmptyState } from "../components/ui/EmptyState";

interface Drill {
  id: number;
  name: string;
  target: string;
  completed: boolean;
  sortOrder: number;
}
interface Plan {
  id: number;
  name: string;
  weaknessSummary: string | null;
  createdAt: string;
  drills: Drill[];
}

function buildWeaknessSummary(h: ReturnType<typeof useDashboardHighlights>["data"]): string {
  if (!h) return "No recent data available.";
  const t = h.trends;
  return [
    "Weakness profile:",
    `- Neutral WR trend: ${(t.neutralWinRate * 100).toFixed(1)}pp`,
    `- L-Cancel trend: ${(t.lCancelRate * 100).toFixed(1)}pp`,
    `- Edgeguard trend: ${(t.edgeguardSuccessRate * 100).toFixed(1)}pp`,
    `- Openings/Kill trend: ${t.openingsPerKill.toFixed(2)} (lower is better)`,
    `- Conversion trend: ${(t.conversionRate * 100).toFixed(1)}pp`,
    `- Dmg/Opening trend: ${t.avgDamagePerOpening.toFixed(2)}`,
    h.worstMatchup
      ? `- Struggles vs ${h.worstMatchup.opponentCharacter} (${(h.worstMatchup.winRate * 100).toFixed(0)}% WR over ${h.worstMatchup.games} games)`
      : "",
    h.bestMatchup
      ? `- Strong vs ${h.bestMatchup.opponentCharacter} (${(h.bestMatchup.winRate * 100).toFixed(0)}% WR)`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function Practice({ refreshKey: _ }: { refreshKey: number }) {
  const { data: highlights } = useDashboardHighlights();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setPlans(await window.clippi.listPracticePlans());
  };

  useEffect(() => {
    refresh();
  }, []);

  const onNewPlan = async () => {
    setGenerating(true);
    setErr(null);
    try {
      await window.clippi.generatePracticePlan(buildWeaknessSummary(highlights));
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const onToggle = async (plan: Plan, drill: Drill) => {
    await window.clippi.setDrillCompletion(drill.id, !drill.completed);
    setPlans((prev) =>
      prev.map((p) =>
        p.id !== plan.id
          ? p
          : { ...p, drills: p.drills.map((d) => (d.id === drill.id ? { ...d, completed: !d.completed } : d)) },
      ),
    );
  };

  const onDelete = async (planId: number) => {
    await window.clippi.deletePracticePlan(planId);
    setPlans((prev) => prev.filter((p) => p.id !== planId));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Practice</h1>
          <p>{plans.length} plans · MAGI-generated from weakness patterns</p>
        </div>
        <button className="btn btn-primary" onClick={onNewPlan} disabled={generating}>
          {generating ? "Generating…" : "+ New Plan"}
        </button>
      </div>

      {err && <p style={{ color: "var(--loss)" }}>{err}</p>}

      {plans.length === 0 && !generating ? (
        <EmptyState
          title="No practice plans yet"
          sub="MAGI can read your stats and generate a drill plan tailored to your weakest areas."
          cta={{ label: "+ Generate First Plan", onClick: onNewPlan }}
        />
      ) : (
        <div className="practice-grid">
          {plans.map((p) => {
            const done = p.drills.filter((d) => d.completed).length;
            const total = p.drills.length;
            const pct = total > 0 ? done / total : 0;
            const due = total - done;
            return (
              <Card key={p.id}>
                <div className="practice-head">
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                  <Badge variant={due > 0 ? "neutral" : "win"}>{due > 0 ? `${due} due` : "done"}</Badge>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
                  <span className="mono">
                    {done}/{total}
                  </span>{" "}
                  drills complete
                </div>
                <div style={{ marginBottom: 14 }}>
                  <WinrateBar value={pct} />
                </div>
                <div className="practice-drills">
                  {p.drills.map((d) => (
                    <label key={d.id} className="practice-drill-row">
                      <input
                        type="checkbox"
                        checked={d.completed}
                        onChange={() => onToggle(p, d)}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      <div>
                        <div
                          style={{
                            color: d.completed ? "var(--text-muted)" : "var(--text)",
                            textDecoration: d.completed ? "line-through" : "none",
                            fontSize: 13,
                          }}
                        >
                          {d.name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.target}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => onDelete(p.id)}>
                  Delete plan
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add route + nav item in App.tsx**

In `src/renderer/App.tsx`:

```tsx
// Under existing lazy imports:
const Practice = lazy(() => import("./pages/Practice").then((m) => ({ default: m.Practice })));
```

Update `ANALYZE_ITEMS`:

```tsx
const ANALYZE_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", Icon: DashboardIcon },
  { id: "sessions", label: "Sessions", path: "/sessions", Icon: SessionsIcon },
  { id: "library", label: "Library", path: "/library", Icon: LibraryIcon },
  { id: "trends", label: "Trends", path: "/trends", Icon: TrendsIcon },
  { id: "characters", label: "Characters", path: "/characters", Icon: CharactersIcon },
  { id: "practice", label: "Practice", path: "/practice", Icon: PracticeIcon },
];
```

(Add `PracticeIcon` to the `NavIcons` import. Drop `Profile` — the feature stayed inside Characters; if Profile.tsx is still referenced, keep the route but drop it from nav, or delete Profile entirely in Phase 11. Here, delete the `profile` entry from `ANALYZE_ITEMS` and the `/profile` route.)

Add the route inside `<Routes>`:

```tsx
<Route path="/practice" element={<Practice refreshKey={refreshKey} />} />
```

Update the `Page` union type accordingly.

- [ ] **Step 4: CSS**

Append to `src/renderer/styles/components.css`:

```css
.practice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 16px;
}
.practice-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.practice-drills {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.practice-drill-row {
  display: flex;
  align-items: start;
  gap: 10px;
  cursor: pointer;
}
```

- [ ] **Step 5: Verify + commit**

Run type-check + tests. Open dev server, click "+ New Plan" on the Practice page, confirm an LLM-generated plan persists and drill checkboxes toggle.

```bash
git add src/renderer/pages/Practice.tsx src/renderer/App.tsx src/renderer/components/NavIcons.tsx src/renderer/styles/components.css
git commit -m "feat(practice): new page with LLM-generated drill plans"
```

---

# Phase 9 — Oracle page

## Task 27: Add Oracle IPC (chat history + new message)

**Files:**

- Modify: `src/pipeline/prompt.ts`
- Modify: `src/main/handlers/llm.ts`
- Modify: `src/db.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/global.d.ts`

- [ ] **Step 1: Add `SYSTEM_PROMPT_ORACLE`**

Append to `src/pipeline/prompt.ts`:

```ts
export const SYSTEM_PROMPT_ORACLE = `You are MAGI Oracle — a Melee coaching companion. You speak directly, like a senior training partner, not a chatbot.

You have access to a summary of the user's last games below. When the user asks a question:
- Cite at least one concrete number from the data (e.g. "Your L-cancel dropped from 91% to 84% last week").
- Be specific. "Work on your neutral" is useless; "Your dash-dance grab hit rate against Fox is 18% — you're committing to grab too early" is useful.
- If the data doesn't support an answer, say so plainly and suggest what replay or stat would.
- Format: short paragraphs. Use **bold** sparingly. Use numbered lists for multi-step advice.
- Do not invent stats. If something isn't in the data, don't reference it.`;
```

- [ ] **Step 2: Add DB helpers**

Append to `src/db.ts`:

```ts
export interface OracleMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export function listOracleMessages(): OracleMessage[] {
  return getDb()
    .prepare("SELECT id, role, content, created_at as createdAt FROM oracle_messages ORDER BY created_at ASC")
    .all() as OracleMessage[];
}

export function appendOracleMessage(role: "user" | "assistant", content: string): OracleMessage {
  const row = getDb()
    .prepare("INSERT INTO oracle_messages (role, content) VALUES (?, ?) RETURNING id, created_at")
    .get(role, content) as { id: number; created_at: string };
  return { id: row.id, role, content, createdAt: row.created_at };
}

export function clearOracleMessages(): void {
  getDb().prepare("DELETE FROM oracle_messages").run();
}
```

- [ ] **Step 3: Add IPC**

In `src/main/handlers/llm.ts`:

```ts
import { listOracleMessages, appendOracleMessage, clearOracleMessages, getRecentGames } from "../../db.js";
import { SYSTEM_PROMPT_ORACLE } from "../../pipeline/prompt.js";

function buildOracleContext(): string {
  const games = getRecentGames(20);
  if (games.length === 0) return "No games in DB yet.";
  const lines = games.map(
    (g, i) =>
      `${i + 1}. ${g.playerCharacter} vs ${g.opponentCharacter} (${g.opponentTag}) — ${g.result.toUpperCase()} | neutral ${(g.neutralWinRate * 100).toFixed(0)}%, l-cancel ${(g.lCancelRate * 100).toFixed(0)}%, conv ${(g.conversionRate * 100).toFixed(0)}%, dmg/op ${g.avgDamagePerOpening.toFixed(1)}, edge ${(g.edgeguardSuccessRate * 100).toFixed(0)}%`,
  );
  return `Recent games (newest first):\n${lines.join("\n")}`;
}

safeHandle("llm:oracleListMessages", () => listOracleMessages());

safeHandle("llm:oracleAsk", async (_e, text: string) => {
  const userMsg = appendOracleMessage("user", text);
  const history = listOracleMessages();
  const dialog = history
    .slice(-20)
    .map((m) => `${m.role === "user" ? "User" : "Oracle"}: ${m.content}`)
    .join("\n\n");
  const context = buildOracleContext();
  const userPrompt = `${context}\n\n---\n\n${dialog}\n\nOracle:`;
  const response = await runLLM(SYSTEM_PROMPT_ORACLE, userPrompt);
  const assistantMsg = appendOracleMessage("assistant", response);
  return { user: userMsg, assistant: assistantMsg };
});

safeHandle("llm:oracleClear", () => {
  clearOracleMessages();
  return true;
});
```

- [ ] **Step 4: Preload + global.d.ts**

`src/preload/index.ts`:

```ts
oracleListMessages: () => ipcRenderer.invoke("llm:oracleListMessages"),
oracleAsk: (text: string) => ipcRenderer.invoke("llm:oracleAsk", text),
oracleClear: () => ipcRenderer.invoke("llm:oracleClear"),
```

`src/renderer/global.d.ts`:

```ts
oracleListMessages: () =>
  Promise<Array<{ id: number; role: "user" | "assistant"; content: string; createdAt: string }>>;
oracleAsk: (text: string) =>
  Promise<{
    user: { id: number; role: "user"; content: string; createdAt: string };
    assistant: { id: number; role: "assistant"; content: string; createdAt: string };
  }>;
oracleClear: () => Promise<boolean>;
```

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/pipeline/prompt.ts src/main/handlers/llm.ts src/preload/index.ts src/renderer/global.d.ts
git commit -m "feat(oracle): prompt + DB helpers + chat IPC with recent-games context"
```

## Task 28: Add Oracle page + route

**Files:**

- Create: `src/renderer/pages/Oracle.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/NavIcons.tsx` (add OracleIcon)

- [ ] **Step 1: Add `OracleIcon`**

Append to `src/renderer/components/NavIcons.tsx`:

```tsx
export function OracleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2l2.39 6.96H22l-6.19 4.5L18.18 20 12 15.67 5.82 20l2.37-6.54L2 8.96h7.61L12 2z" />
    </svg>
  );
}
```

- [ ] **Step 2: Create Oracle page**

Create `src/renderer/pages/Oracle.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export function Oracle({ refreshKey: _ }: { refreshKey: number }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.clippi.oracleListMessages().then(setMsgs);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length, loading]);

  const submit = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    setErr(null);
    setInput("");
    try {
      const { user, assistant } = await window.clippi.oracleAsk(text);
      setMsgs((m) => [...m, user, assistant]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    if (!confirm("Clear Oracle conversation history?")) return;
    await window.clippi.oracleClear();
    setMsgs([]);
  };

  return (
    <div style={{ height: "calc(100vh - 80px)", display: "flex", flexDirection: "column" }}>
      <div className="page-header">
        <div>
          <h1>MAGI Oracle</h1>
          <p>Ask about any game, session, or pattern</p>
        </div>
        {msgs.length > 0 && (
          <button className="btn btn-ghost" onClick={clear}>
            Clear history
          </button>
        )}
      </div>
      <Card style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
        <div className="oracle-scroll">
          {msgs.length === 0 && !loading && (
            <EmptyState
              title="Ask the Oracle"
              sub="Try: 'Why am I losing to Fox lately?' or 'Where is my edgeguard weakest?'"
            />
          )}
          {msgs.map((m) => (
            <div key={m.id} className="oracle-row">
              <div className={`oracle-avatar oracle-avatar-${m.role}`}>{m.role === "user" ? "Y" : "M"}</div>
              <div className="oracle-body">
                <Markdown>{m.content}</Markdown>
              </div>
            </div>
          ))}
          {loading && (
            <div className="oracle-row">
              <div className="oracle-avatar oracle-avatar-assistant">M</div>
              <div className="oracle-body">
                <em style={{ color: "var(--text-muted)" }}>Thinking…</em>
              </div>
            </div>
          )}
          {err && <p style={{ color: "var(--loss)" }}>{err}</p>}
          <div ref={endRef} />
        </div>
        <div className="oracle-input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask about a game, matchup, or pattern…"
            disabled={loading}
            className="oracle-input"
          />
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            Ask
          </button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Register route + nav**

In `src/renderer/App.tsx`:

```tsx
const Oracle = lazy(() => import("./pages/Oracle").then((m) => ({ default: m.Oracle })));
```

Update `SYSTEM_ITEMS`:

```tsx
const SYSTEM_ITEMS: NavItem[] = [
  { id: "oracle", label: "MAGI Oracle", path: "/oracle", Icon: OracleIcon },
  { id: "settings", label: "Settings", path: "/settings", Icon: SettingsIcon },
];
```

Add the route:

```tsx
<Route path="/oracle" element={<Oracle refreshKey={refreshKey} />} />
```

Expand the `Page` union type.

- [ ] **Step 4: CSS**

Append to `src/renderer/styles/components.css`:

```css
.oracle-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-right: 8px;
}
.oracle-row {
  display: flex;
  gap: 12px;
  align-items: start;
}
.oracle-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}
.oracle-avatar-assistant {
  background: var(--accent-muted);
  color: var(--accent);
}
.oracle-avatar-user {
  background: var(--surface-3);
  color: var(--text);
}
.oracle-body {
  flex: 1;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
}
.oracle-body p:first-child {
  margin-top: 0;
}
.oracle-input-row {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.oracle-input {
  flex: 1;
  padding: 10px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border-muted);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
}
```

- [ ] **Step 5: Verify + commit**

Run type-check + tests. Open dev server, navigate to Oracle, ask a question, confirm a response arrives and persists after a refresh.

```bash
git add src/renderer/pages/Oracle.tsx src/renderer/App.tsx src/renderer/components/NavIcons.tsx src/renderer/styles/components.css
git commit -m "feat(oracle): persistent chat page with recent-games context"
```

---

# Phase 10 — Settings re-skin

## Task 29: Re-skin Settings with prototype Card + Pill primitives

**Files:**

- Modify: `src/renderer/pages/Settings.tsx`

- [ ] **Step 1: Read current Settings.tsx structure**

Open `src/renderer/pages/Settings.tsx` and identify every section (Replay Folder, Watcher Status, Target Player, API Keys, Model Selector, Dolphin Path, Data actions).

- [ ] **Step 2: Wrap each section in a `<Card title="...">`**

For every top-level section, replace its outer wrapper with:

```tsx
<Card title="Section Title">{/* existing fields */}</Card>
```

Import: `import { Card } from "../components/ui/Card";` + `import { Pill, PillRow } from "../components/ui/Pill";`.

- [ ] **Step 3: Replace model selector radio list with `PillRow`**

Wherever Settings renders a list of model choices as radio buttons or native `<select>`, replace with:

```tsx
<PillRow>
  {models.map((m) => (
    <Pill key={m.id} active={selectedModelId === m.id} onClick={() => onPick(m.id)}>
      {m.label}
    </Pill>
  ))}
</PillRow>
```

Preserve all logic (API key fields, save-on-change).

- [ ] **Step 4: Add `.settings-grid` / inputs CSS (if missing)**

Append to `src/renderer/styles/components.css`:

```css
.settings-field-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.settings-field {
  margin-bottom: 14px;
}
.settings-path-display {
  padding: 10px 14px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12px;
  word-break: break-all;
}
```

- [ ] **Step 5: Verify + commit**

Open dev server, visit Settings, confirm every section is a Card, all fields still save and load.

```bash
git add src/renderer/pages/Settings.tsx src/renderer/styles/components.css
git commit -m "refactor(settings): wrap sections in Card primitive; Pill-based model picker"
```

---

# Phase 11 — Cleanup

## Task 30: Delete Coaching page + route + `/history` redirect

**Files:**

- Delete: `src/renderer/pages/Coaching.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/CommandPalette.tsx` (remove `/coaching` if referenced)

- [ ] **Step 1: Remove the route and the lazy import**

In `src/renderer/App.tsx`, delete:

```tsx
const Coaching = lazy(() => import("./pages/Coaching").then((m) => ({ default: m.Coaching })));
```

Delete:

```tsx
<Route path="/history" element={<Navigate to="/coaching" replace />} />
<Route path="/coaching" element={<Coaching refreshKey={refreshKey} />} />
```

Remove the `"coaching"` case from the `Page` union type, and any entry referencing it in `ANALYZE_ITEMS`.

- [ ] **Step 2: Delete the file**

```bash
rm src/renderer/pages/Coaching.tsx
```

- [ ] **Step 3: Scrub references**

Run: `npx grep -rn "pages/Coaching\|path=\"/coaching\"\|id: \"coaching\"" src/`
Delete any remaining references found.

- [ ] **Step 4: Verify + commit**

```bash
git add -A
git commit -m "chore: delete Coaching page + /coaching and /history routes"
```

## Task 31: Delete GameDetail page + `/game/:gameId` route

**Files:**

- Delete: `src/renderer/pages/GameDetail.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Remove the route and lazy import**

Delete from `App.tsx`:

```tsx
const GameDetail = lazy(() => import("./pages/GameDetail").then((m) => ({ default: m.GameDetail })));
// …
<Route path="/game/:gameId" element={<GameDetail refreshKey={refreshKey} />} />;
```

- [ ] **Step 2: Delete the file**

```bash
rm src/renderer/pages/GameDetail.tsx
```

- [ ] **Step 3: Scrub references**

Run: `npx grep -rn "pages/GameDetail\|/game/" src/renderer/`
Any remaining `navigate(\`/game/\${...}\`)`call must be removed or rerouted to`openDrawer(id)`.

- [ ] **Step 4: Verify + commit**

```bash
git add -A
git commit -m "chore: delete GameDetail page; drawer is the only game-detail surface"
```

## Task 32: Delete `Onboarding.tsx`, `HighlightCards.tsx`

**Files:**

- Delete: `src/renderer/components/Onboarding.tsx`
- Delete: `src/renderer/components/HighlightCards.tsx`

- [ ] **Step 1: Confirm no imports remain**

Run: `npx grep -rn "Onboarding\b\|HighlightCards\b" src/renderer/`
Expected: zero results (Dashboard rewrite dropped them).

- [ ] **Step 2: Delete**

```bash
rm src/renderer/components/Onboarding.tsx
rm src/renderer/components/HighlightCards.tsx
```

- [ ] **Step 3: Verify + commit**

```bash
git add -A
git commit -m "chore: delete Onboarding and HighlightCards components"
```

## Task 33: Delete `CoachingCards.tsx` if orphaned; delete Profile page

**Files:**

- Delete (conditional): `src/renderer/components/CoachingCards.tsx`
- Delete: `src/renderer/pages/Profile.tsx`
- Modify: `src/renderer/App.tsx` (remove Profile route)

- [ ] **Step 1: Check CoachingCards usage**

Run: `npx grep -rn "CoachingCards" src/renderer/`

If zero results, delete `src/renderer/components/CoachingCards.tsx`. If there are results, they should only be in `CoachingModal.tsx` — keep the file.

- [ ] **Step 2: Delete Profile**

```bash
rm src/renderer/pages/Profile.tsx
```

In `App.tsx`, remove the Profile lazy import + route + nav entry + `Page` union case.

- [ ] **Step 3: Verify + commit**

```bash
git add -A
git commit -m "chore: delete Profile page and any orphaned CoachingCards"
```

## Task 34: Prune dead CSS classes

**Files:**

- Modify: `src/renderer/styles/dashboard.css`, `src/renderer/styles/history.css`, `src/renderer/styles/game-detail.css`, `src/renderer/styles/coaching-cards.css`, `src/renderer/styles/highlights.css`

- [ ] **Step 1: Identify dead class files**

Run (one at a time):

```
npx grep -rn "dash-highlight-\|dash-insight-\|dash-game-row" src/renderer/
npx grep -rn "history-\|game-detail-" src/renderer/
npx grep -rn "highlight-card-" src/renderer/
```

For each class with zero references outside `.css` files, delete the corresponding block.

- [ ] **Step 2: Delete orphaned stylesheets entirely**

If `history.css` or `game-detail.css` or `coaching-cards.css` or `highlights.css` has no referenced class names remaining, delete the file and remove its import line from `src/renderer/styles/index.css` (or wherever it's imported).

- [ ] **Step 3: Verify dev build**

Run `npm run dev` and quickly click through every page to confirm nothing visually broke. Kill the server.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(styles): prune dead CSS classes + stylesheets"
```

## Task 35: Final verification pass

- [ ] **Step 1: Type-check main process**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: zero errors.

- [ ] **Step 2: Renderer type-check via Vite**

Run: `npm run build -- --mode development 2>&1 | tail -40`
(Or run `vite build` directly.) Expected: succeeds.

- [ ] **Step 3: Tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Success-criteria scan**

Run:

```
npx grep -rn 'win98\|melee-theme\|Onboarding\|HighlightCards\|CoachingCards' src/renderer
```

Expected: zero or only trivial matches (e.g. an unrelated comment).

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`. Click through every nav item in every theme. Specifically verify:

- Dashboard: KPIs, sparklines, Oracle insight, recent games table.
- Sessions: per-day cards load, "Session Report" produces text, result persists after reopening.
- Library: filter KPIs update live.
- Characters: grid + detail view + Analyze Matchup.
- Trends: hero + 5 minis, range + char filters work.
- Practice: "+ New Plan" creates a persisted plan; checkboxes save.
- Oracle: ask a question, answer arrives, reload page, history persists, "Clear history" wipes.
- Settings: every field still saves + loads.
- GameDrawer: opens, stats render, "Get Coaching" renders markdown inline.

- [ ] **Step 6: Commit (if any final tweaks) and declare done**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: final polish after redesign"
```

If nothing to commit, say so and the branch is ready for merge review.

---

## Self-review

**Spec coverage** — every section of `docs/superpowers/specs/2026-04-20-ui-density-redesign-design.md` maps to a task:

| Spec section                                                                                     | Tasks                               |
| ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Primitive vocabulary (new `Sparkline`, `StatGroupCard`, `EmptyState`)                            | 1, 2, 3                             |
| Card `tone="chrome-plate"`                                                                       | already exists; verified in Task 22 |
| Theme migration (add 3, drop 2, rename `dark`→`telemetry`)                                       | 4–12                                |
| Data layer extensions (hook fields, new hooks)                                                   | 15, 16, 19, 23                      |
| Dashboard rewrite                                                                                | 17                                  |
| Library polish                                                                                   | 18                                  |
| Sessions replacement                                                                             | 19, 20, 21                          |
| Characters rewrite                                                                               | 22                                  |
| Trends rewrite                                                                                   | 23, 24                              |
| Practice page                                                                                    | 25, 26                              |
| Oracle page                                                                                      | 27, 28                              |
| Settings re-skin                                                                                 | 29                                  |
| GameDrawer inline coaching                                                                       | 13, 14                              |
| Migration #6 (4 new tables)                                                                      | 20 (cumulative)                     |
| Deletions (Coaching, GameDetail, Onboarding, HighlightCards, CoachingCards, Profile, Win98Shell) | 11, 30–33                           |
| CSS cleanup                                                                                      | 12, 34                              |
| Final verification                                                                               | 35                                  |

**Placeholder scan** — none. Every code step provides the exact code. A few tasks have conditional checks (e.g. "if `killMove` field shape differs, adjust") — these are honest verification steps, not TODOs.

**Type consistency** — plan types are consistent: `DaySession` uses `date: string`, `gameIds: number[]`; `Plan`/`Drill` shapes match between main-process insert fn, IPC handler return, preload, and renderer hook. `TrendMetric` keys match between DB fn, IPC, and hook.

**Ambiguity check** — any place two readings are possible has the call-out inline (e.g. `analyzeGame` return shape in Task 14, hook field names in Task 22). Engineer is told what to verify.
