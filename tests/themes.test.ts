import { describe, it, expect, vi } from "vitest";
import { THEMES, THEME_ORDER, applyTheme, getResolvedTheme } from "../src/renderer/themes";

// ── WCAG contrast helpers (composite translucent surfaces over the theme bg) ──
function parseColor(c: string): [number, number, number, number] {
  if (c.startsWith("#")) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
  }
  const m = c.match(/[\d.]+/g)!.map(Number);
  return [m[0]!, m[1]!, m[2]!, m[3] ?? 1];
}
function composite(fg: string, bg: string): [number, number, number] {
  const f = parseColor(fg);
  const b = parseColor(bg);
  const a = f[3];
  return [f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a)];
}
function composite3(ground: string, bg: string): string {
  const [r, g, b] = composite(ground, bg);
  return `rgb(${r}, ${g}, ${b})`;
}
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("themes", () => {
  it("includes all four themes with stable ids", () => {
    expect(Object.keys(THEMES).sort()).toEqual(["light", "liquid", "telemetry", "tournament"].sort());
  });

  it("falls back from removed skins", () => {
    for (const id of ["crt", "amber"]) expect(getResolvedTheme(id, "liquid").id).toBe("liquid");
  });

  it("orders liquid first", () => {
    expect(THEME_ORDER[0]).toBe("liquid");
  });

  it("liquid theme declares optional liquid tokens", () => {
    const liquid = THEMES["liquid"]!;
    expect(liquid.surfaceBlur).toBe("28px");
    expect(liquid.radiusMd).toBe("20px");
  });

  it("uses a distinct app background for each theme", () => {
    const backgroundImages = THEME_ORDER.map((id) => THEMES[id]!.appBackgroundImage);
    expect(new Set(backgroundImages).size).toBe(THEME_ORDER.length);
  });

  it("non-liquid themes leave optional tokens undefined", () => {
    expect(THEMES["telemetry"]!.surfaceBlur).toBeUndefined();
    expect(THEMES["tournament"]!.radiusMd).toBeUndefined();
  });

  it("getResolvedTheme falls back to liquid for unknown ids", () => {
    const t = getResolvedTheme("does-not-exist", "liquid");
    expect(t.id).toBe("liquid");
  });

  it("applies data-theme to root and body selectors", () => {
    const setProperty = vi.fn();
    const rootSetAttribute = vi.fn();
    const bodySetAttribute = vi.fn();
    const originalDocument = globalThis.document;

    globalThis.document = {
      documentElement: {
        setAttribute: rootSetAttribute,
        style: { setProperty },
      },
      body: {
        setAttribute: bodySetAttribute,
      },
    } as unknown as Document;

    try {
      applyTheme(THEMES["telemetry"]!);
    } finally {
      globalThis.document = originalDocument;
    }

    expect(rootSetAttribute).toHaveBeenCalledWith("data-theme", "telemetry");
    expect(bodySetAttribute).toHaveBeenCalledWith("data-theme", "telemetry");
    expect(setProperty).toHaveBeenCalledWith("--app-bg-image", THEMES["telemetry"]!.appBackgroundImage);
  });
});

describe("theme contrast (WCAG AA)", () => {
  // --text-muted is the app's default small-text color (card titles, stat/KPI
  // labels, dates, placeholders). It must clear 4.5:1 against the card surfaces
  // it actually renders on. This encodes the requirement, not specific hexes —
  // change a muted token to anything below AA and this fails on purpose.
  for (const id of THEME_ORDER) {
    const t = THEMES[id]!;
    it(`${id}: --text-muted clears AA 4.5:1 on surface-1 and surface-2`, () => {
      const onS1 = contrastRatio(composite(t.textMuted, t.bg), composite(t.surface1, t.bg));
      const onS2 = contrastRatio(composite(t.textMuted, t.bg), composite(t.surface2, t.bg));
      expect(onS1).toBeGreaterThanOrEqual(4.5);
      expect(onS2).toBeGreaterThanOrEqual(4.5);
    });

    it(`${id}: --text-secondary clears AA 4.5:1 on surface-1`, () => {
      const onS1 = contrastRatio(composite(t.textSecondary, t.bg), composite(t.surface1, t.bg));
      expect(onS1).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("theme contrast: accent, status and filled controls (WCAG AA)", () => {
  // Accent and status colors are used as TEXT (active tabs, deltas, badges, error
  // copy), and on-accent is the label on primary buttons. Each must clear 4.5:1 on
  // the grounds it renders on. Encodes the requirement, not specific hexes.
  for (const id of THEME_ORDER) {
    const t = THEMES[id]!;
    const on = (fg: string, ground: string) =>
      contrastRatio(composite(fg, composite3(ground, t.bg)), composite(ground, t.bg));
    for (const key of ["accent", "win", "loss", "caution"] as const) {
      it(`${id}: --${key} clears AA 4.5:1 as text on bg, surface-1 and surface-2`, () => {
        expect(on(t[key], t.bg)).toBeGreaterThanOrEqual(4.5);
        expect(on(t[key], t.surface1)).toBeGreaterThanOrEqual(4.5);
        expect(on(t[key], t.surface2)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${id}: --on-accent clears AA 4.5:1 on accent-fill and accent-hover`, () => {
      expect(contrastRatio(composite(t.onAccent, t.accentFill), composite(t.accentFill, t.bg))).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrastRatio(composite(t.onAccent, t.accentHover), composite(t.accentHover, t.bg)),
      ).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("the check itself rejects the colors it replaced (negative control)", () => {
    const white: [number, number, number] = [255, 255, 255];
    // Former Light values as text on white, and white on the former Tournament button fill.
    for (const old of ["#0ea5e9", "#22c55e", "#ef4444", "#f59e0b", "#3b82f6"]) {
      expect(contrastRatio(composite(old, "#ffffff"), white)).toBeLessThan(4.5);
    }
  });

  it("applyTheme publishes the filled-control tokens", () => {
    const setProperty = vi.fn();
    const originalDocument = globalThis.document;
    globalThis.document = {
      documentElement: { setAttribute: vi.fn(), style: { setProperty } },
      body: { setAttribute: vi.fn() },
    } as unknown as Document;
    try {
      applyTheme(THEMES["tournament"]!);
    } finally {
      globalThis.document = originalDocument;
    }
    expect(setProperty).toHaveBeenCalledWith("--accent-fill", THEMES["tournament"]!.accentFill);
    expect(setProperty).toHaveBeenCalledWith("--on-accent", THEMES["tournament"]!.onAccent);
  });
});
