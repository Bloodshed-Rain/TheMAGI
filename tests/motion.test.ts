import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DURATION_MS, EASE, STAGGER_MS, seconds } from "../src/renderer/motion";
import { THEMES, THEME_ORDER } from "../src/renderer/themes";
import { easeOutQuart, formatCountFrame, kpiFlashTone, parseCountTarget } from "../src/renderer/components/ui/countUp";
import {
  SPECULAR_FULL_TILT_SIZE_PX,
  SPECULAR_MAX_TILT_DEG,
  specularFromPointer,
  tiltLimitForSize,
} from "../src/renderer/components/ui/specular";
import { revealOriginFromClick, revealRadius } from "../src/renderer/themeReveal";

const styles = join(__dirname, "..", "src", "renderer", "styles");
const css = (file: string) => readFileSync(join(styles, file), "utf8").replace(/\r\n/g, "\n");
const tokensCss = css("tokens.css");
const motionCss = css("motion.css");
const componentsCss = css("components.css");

/** Value of a custom property as declared in the first (:root) block of tokens.css. */
function token(name: string): string | undefined {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(tokensCss)?.[1]?.trim();
}
const bezier = (points: readonly number[]) => `cubic-bezier(${points.join(", ")})`;

describe("motion tokens: tokens.css and motion.ts agree", () => {
  for (const [key, ms] of Object.entries(DURATION_MS)) {
    it(`--duration-${key} is ${ms}ms in both`, () => {
      expect(token(`duration-${key}`)).toBe(`${ms}ms`);
    });
  }

  it("--stagger matches STAGGER_MS", () => {
    expect(token("stagger")).toBe(`${STAGGER_MS}ms`);
  });

  for (const [key, points] of Object.entries(EASE)) {
    it(`--ease-${key} matches EASE.${key}`, () => {
      expect(token(`ease-${key}`)).toBe(bezier(points));
    });
  }

  it("every theme applies the same spring and ease-out the tokens declare", () => {
    for (const id of THEME_ORDER) {
      expect(THEMES[id]!.easeSpring).toBe(bezier(EASE.spring));
      expect(THEMES[id]!.easeOut).toBe(bezier(EASE.out));
    }
  });

  it("only the impact curve overshoots", () => {
    for (const [key, points] of Object.entries(EASE)) {
      const overshoots = points[1] > 1 || points[3] > 1;
      expect(overshoots).toBe(key === "impact");
    }
  });

  it("converts milliseconds to framer seconds", () => {
    expect(seconds(DURATION_MS.impact)).toBe(0.52);
  });
});

describe("motion.css", () => {
  it("uses only duration and easing tokens that tokens.css defines", () => {
    const used = new Set([...motionCss.matchAll(/var\(--((?:duration|ease)-[a-z-]+|stagger)\b/g)].map((m) => m[1]!));
    expect(used.size).toBeGreaterThan(5);
    for (const name of used) expect(token(name), `--${name} is not defined in tokens.css`).toBeDefined();
  });

  it("keeps every animation inside prefers-reduced-motion: no-preference", () => {
    const start = motionCss.indexOf("@media (prefers-reduced-motion: no-preference)");
    expect(start).toBeGreaterThan(0);
    const outside = motionCss.slice(0, start);
    // Nothing before the media block may animate; the block runs to the end of the file.
    expect(outside).not.toMatch(/\banimation(-name|-delay|-duration)?\s*:/);
    expect(outside).not.toMatch(/@keyframes/);
    const depthAtEnd = [...motionCss.slice(start)].reduce((d, ch) => d + (ch === "{" ? 1 : ch === "}" ? -1 : 0), 0);
    expect(depthAtEnd).toBe(0);
    expect(motionCss.trimEnd().endsWith("}")).toBe(true);
  });

  it("allows exactly the four sanctioned loops", () => {
    const infinite = new Set([...motionCss.matchAll(/animation:\s*([a-z-]+)[^;]*\binfinite\b/g)].map((m) => m[1]));
    // Live-status ring, streaming orbit, and the two halves of the wireframe idle (float + light).
    expect([...infinite].sort()).toEqual(["magi-live", "magi-orbit", "magi-wire-float", "magi-wire-scan"]);
    // The fourth, the Liquid backdrop drift, lives with the theme and runs on the ambient token.
    expect(css("theme-liquid.css")).toMatch(/animation:\s*liquid-float var\(--duration-ambient\)[^;]*infinite/);
  });

  it("runs the wireframe idle on the hero always and on a tile only under pointer or focus", () => {
    const scanRules = [...motionCss.matchAll(/([^{}]+)\{[^{}]*animation:\s*magi-wire-scan[^{}]*\}/g)].map((m) =>
      m[1]!
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .trim()
        .replace(/\s+/g, " "),
    );
    expect(scanRules).toEqual([
      ".wire-scan-mask--portrait .wire-scan",
      ".character-tile:hover .wire-scan, .character-tile:focus-visible .wire-scan",
    ]);
    // A bare tile rule would start 26 loops at once on the Characters grid.
    expect(motionCss).not.toMatch(/\.character-tile \.wire-scan\s*\{[^}]*animation/);
  });

  it("reserves the impact curve for the kill stamp", () => {
    const rules = [...motionCss.matchAll(/([^{}]+)\{[^{}]*var\(--ease-impact\)[^{}]*\}/g)].map((m) => m[1]!.trim());
    expect(rules.map((r) => r.split("\n").pop()!.trim())).toEqual([".stock-kill-icon"]);
  });
});

describe("data table hover sweep", () => {
  // A pseudo-element on a <tr> is laid out as a table cell. Under table-layout:
  // fixed that added a phantom column to every DataTable and narrowed each
  // auto-width column by its share.
  it("is not drawn with a pseudo-element on the row", () => {
    expect(componentsCss).not.toMatch(/\.data-table[^{},]*\btr[^{},]*::(?:after|before)/);
  });

  it("is drawn as a background on the row", () => {
    expect(componentsCss).toMatch(/\.data-table tbody tr \{[^}]*background-size: 0% 100%/);
    expect(componentsCss).toMatch(/\.data-table tbody tr:hover,[^{]*\{[^}]*background-size: 100% 100%/);
  });
});

describe("KPI count-up", () => {
  it("parses plain figures with their decimals, grouping and suffix", () => {
    expect(parseCountTarget("54.2%")).toEqual({ value: 54.2, decimals: 1, grouped: false, suffix: "%" });
    expect(parseCountTarget("87%")).toEqual({ value: 87, decimals: 0, grouped: false, suffix: "%" });
    expect(parseCountTarget("4.80")).toEqual({ value: 4.8, decimals: 2, grouped: false, suffix: "" });
    expect(parseCountTarget("1,204")).toEqual({ value: 1204, decimals: 0, grouped: true, suffix: "" });
    expect(parseCountTarget("2.5x")).toEqual({ value: 2.5, decimals: 1, grouped: false, suffix: "x" });
    expect(parseCountTarget(" 12 ")).toEqual({ value: 12, decimals: 0, grouped: false, suffix: "" });
    expect(parseCountTarget("0")).toEqual({ value: 0, decimals: 0, grouped: false, suffix: "" });
  });

  it("refuses anything that is not a single plain figure", () => {
    // Records, times, ratios, compound strings and signed values must render as written.
    for (const text of [
      "12-4",
      "3:42",
      "7/9",
      "taken 2 · missed 1",
      "n/a",
      "",
      "-3",
      "+2.2",
      "12W",
      "1,20",
      "5 %",
      "—",
    ]) {
      expect(parseCountTarget(text), text).toBeNull();
    }
  });

  it("formats interim frames like the target", () => {
    const pct = parseCountTarget("54.2%")!;
    expect(formatCountFrame(pct, 0, 0)).toBe("0.0%");
    expect(formatCountFrame(pct, 0, 1)).toBe("54.2%");
    const big = parseCountTarget("1,204")!;
    expect(formatCountFrame(big, 0, 0)).toBe("0");
    expect(formatCountFrame(big, 0, 1)).toBe("1,204");
    expect(formatCountFrame(big, 1000, 0)).toBe("1,000");
  });

  it("ends exactly on the stated figure for the shapes KPIs use", () => {
    for (const text of ["0%", "54%", "54.2%", "100.0%", "31.4", "4.8", "248", "1,204", "12,345.6"]) {
      expect(formatCountFrame(parseCountTarget(text)!, 0, 1), text).toBe(text);
    }
  });

  it("never passes the target on the way, counting up or down", () => {
    const up = parseCountTarget("54.2%")!;
    const down = parseCountTarget("48.0%")!;
    let last = -Infinity;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const v = parseFloat(formatCountFrame(up, 0, p));
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v).toBeLessThanOrEqual(54.2);
      last = v;
      expect(parseFloat(formatCountFrame(down, 54.2, p))).toBeGreaterThanOrEqual(48);
    }
  });

  it("clamps the easing to 0..1", () => {
    expect(easeOutQuart(-1)).toBe(0);
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
    expect(easeOutQuart(5)).toBe(1);
    expect(easeOutQuart(0.5)).toBeCloseTo(0.9375, 10);
  });
});

describe("KPI live-change flash", () => {
  it("flashes in the tone's color when a figure already on screen changes", () => {
    expect(kpiFlashTone("54.2%", "55.1%", "good")).toBe("win");
    expect(kpiFlashTone("87%", "83%", "bad")).toBe("loss");
  });

  it("does not flash on first reveal, on an unchanged figure, or for a neutral figure", () => {
    expect(kpiFlashTone(null, "54.2%", "good")).toBeNull();
    expect(kpiFlashTone("54.2%", null, "good")).toBeNull();
    expect(kpiFlashTone("54.2%", "54.2%", "bad")).toBeNull();
    // No stated direction: a bigger number must not be painted as good, nor a smaller one as bad.
    expect(kpiFlashTone("900", "2339", "neutral")).toBeNull();
    expect(kpiFlashTone("2339", "900", "neutral")).toBeNull();
  });

  it("has a flash animation for each tone and nothing for neutral", () => {
    expect(motionCss).toMatch(/\.kpi\.kpi-flash-win \{\s*animation: magi-flash-win/);
    expect(motionCss).toMatch(/\.kpi\.kpi-flash-loss \{\s*animation: magi-flash-loss/);
    expect(motionCss).not.toMatch(/kpi-flash-neutral/);
  });
});

describe("win-rate bar marker", () => {
  it("sits at exactly half the track", () => {
    const rule = /\.winrate-bar--marked::after \{([^}]*)\}/.exec(motionCss)?.[1] ?? "";
    expect(rule).toMatch(/left: 50%;/);
    expect(rule).toMatch(/width: 2px;/);
    expect(rule).toMatch(/margin-left: -1px;/);
  });

  it("is opt-in, so a bar that is not a win rate carries no midpoint", () => {
    const practice = readFileSync(join(__dirname, "..", "src", "renderer", "pages", "Practice.tsx"), "utf8");
    expect(practice).toMatch(/<WinrateBar value=\{pct\} \/>/);
    expect(componentsCss).not.toMatch(/\.winrate-bar::after/);
  });
});

describe("specular card", () => {
  it("does not tilt with the pointer at the center", () => {
    const s = specularFromPointer(400, 200, 200, 100);
    expect(s).toEqual({ mx: 200, my: 100, rotateX: 0, rotateY: 0 });
  });

  it("tilts toward the pointer, up to the maximum at the edges", () => {
    const topRight = specularFromPointer(400, 200, 400, 0);
    expect(topRight.rotateX).toBe(SPECULAR_MAX_TILT_DEG);
    expect(topRight.rotateY).toBe(SPECULAR_MAX_TILT_DEG);
    const bottomLeft = specularFromPointer(400, 200, 0, 200);
    expect(bottomLeft.rotateX).toBe(-SPECULAR_MAX_TILT_DEG);
    expect(bottomLeft.rotateY).toBe(-SPECULAR_MAX_TILT_DEG);
  });

  it("clamps a pointer outside the card to its edge", () => {
    const s = specularFromPointer(400, 200, 900, -50);
    expect(s.mx).toBe(400);
    expect(s.my).toBe(0);
    expect(Math.abs(s.rotateX)).toBeLessThanOrEqual(SPECULAR_MAX_TILT_DEG);
    expect(Math.abs(s.rotateY)).toBeLessThanOrEqual(SPECULAR_MAX_TILT_DEG);
  });

  it("tilts large cards less, so their edges do not travel farther than a small card's", () => {
    expect(tiltLimitForSize(320, 200)).toBe(SPECULAR_MAX_TILT_DEG);
    expect(tiltLimitForSize(SPECULAR_FULL_TILT_SIZE_PX, 100)).toBe(SPECULAR_MAX_TILT_DEG);
    expect(tiltLimitForSize(960, 300)).toBe(SPECULAR_MAX_TILT_DEG / 2);
    expect(tiltLimitForSize(300, 1440)).toBe(SPECULAR_MAX_TILT_DEG / 3);
    expect(tiltLimitForSize(0, 0)).toBe(0);
    const wide = specularFromPointer(960, 300, 960, 0, tiltLimitForSize(960, 300));
    expect(wide.rotateY).toBe(SPECULAR_MAX_TILT_DEG / 2);
  });

  it("does not tilt a card with no area", () => {
    expect(specularFromPointer(0, 200, 10, 10)).toEqual({ mx: 0, my: 0, rotateX: 0, rotateY: 0 });
    expect(specularFromPointer(400, Number.NaN, 10, 10)).toEqual({ mx: 0, my: 0, rotateX: 0, rotateY: 0 });
  });
});

describe("theme reveal", () => {
  it("reaches the farthest corner from any origin", () => {
    expect(revealRadius(0, 0, 300, 400)).toBe(500);
    expect(revealRadius(300, 400, 300, 400)).toBe(500);
    expect(revealRadius(150, 200, 300, 400)).toBe(250);
    expect(revealRadius(100, 50, 1280, 720)).toBeCloseTo(Math.hypot(1180, 670), 10);
  });

  it("covers every corner of the viewport", () => {
    const [w, h, x, y] = [1280, 720, 940, 610];
    const r = revealRadius(x, y, w, h);
    for (const [cx, cy] of [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ] as const) {
      expect(Math.hypot(cx - x, cy - y)).toBeLessThanOrEqual(r);
    }
  });

  it("uses the pointer position for a click and the control's center for a keyboard activation", () => {
    const rect = { left: 100, top: 40, width: 80, height: 36 };
    expect(revealOriginFromClick({ clientX: 131, clientY: 52, detail: 1 }, rect)).toEqual({ x: 131, y: 52 });
    expect(revealOriginFromClick({ clientX: 0, clientY: 0, detail: 0 }, rect)).toEqual({ x: 140, y: 58 });
  });
});
