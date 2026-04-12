export interface Theme {
  id: string;
  name: string;
  bg: string;
  surface1: string;
  surface2: string;
  surface3: string;
  border: string;
  borderSubtle: string;
  borderMuted: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  win: string;
  loss: string;
  caution: string;
  sidebarBg: string;
  sidebarHover: string;
  sidebarActiveBg: string;
  sidebarAccent: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  fontMono: string;
  fontSans: string;
  fontDisplay: string;
  easeSpring: string;
  easeOut: string;
}

/* ───────────────────────────────────────────────────────────────────────────
 * MAGI Theme Definitions — 3 curated themes
 *
 *   dark        — the everyday default
 *   light       — clean bright mode for daytime / well-lit rooms
 *   win98       — full-commit Windows 98 retro (beveled, silver, navy)
 *
 * Extra per-theme visual treatment (bevels, sizing) is handled by
 * selectors in styles/tokens.css keyed off `[data-theme="<id>"]`.
 * ─────────────────────────────────────────────────────────────────────────── */

const FONT_SANS = "'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Fira Code', monospace";
const FONT_DISPLAY = "'Chakra Petch', 'DM Sans', -apple-system, sans-serif";
const FONT_WIN98 = "'Tahoma', 'MS Sans Serif', 'Pixelated MS Sans Serif', Verdana, sans-serif";
const EASE_SPRING = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_OUT = "cubic-bezier(0, 0, 0.2, 1)";

export const THEMES: Record<string, Theme> = {
  dark: {
    id: "dark",
    name: "Dark",
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

  light: {
    id: "light",
    name: "Light",
    bg: "#ffffff",
    surface1: "#f8fafc",
    surface2: "#f1f5f9",
    surface3: "#e2e8f0",
    border: "rgba(15, 23, 42, 0.08)",
    borderSubtle: "rgba(15, 23, 42, 0.04)",
    borderMuted: "rgba(15, 23, 42, 0.14)",
    text: "#0f172a",
    textSecondary: "#475569",
    textMuted: "#94a3b8",
    accent: "#0ea5e9",
    accentHover: "#0284c7",
    accentMuted: "rgba(14, 165, 233, 0.1)",
    win: "#22c55e",
    loss: "#ef4444",
    caution: "#f59e0b",
    sidebarBg: "#0f172a",
    sidebarHover: "#1e293b",
    sidebarActiveBg: "rgba(34, 211, 238, 0.12)",
    sidebarAccent: "#22d3ee",
    shadowSm: "0 1px 2px rgba(0,0,0,0.05)",
    shadowMd: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)",
    shadowLg: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
    fontMono: FONT_MONO,
    fontSans: FONT_SANS,
    fontDisplay: FONT_DISPLAY,
    easeSpring: EASE_SPRING,
    easeOut: EASE_OUT,
  },

  /* ─── Windows 98 — full commit, beveled everything ──────────────────── */
  win98: {
    id: "win98",
    name: "Retro 98",
    bg: "#008080", // classic teal desktop
    surface1: "#c0c0c0", // silver
    surface2: "#d4d0c8", // light silver
    surface3: "#808080", // dark silver (shadow)
    border: "#000000",
    borderSubtle: "#808080",
    borderMuted: "#404040",
    text: "#000000",
    textSecondary: "#000000",
    textMuted: "#404040",
    accent: "#000080", // navy titlebar blue
    accentHover: "#1084d0", // brighter navy (hover gradient)
    accentMuted: "rgba(0, 0, 128, 0.2)",
    win: "#008000", // classic green
    loss: "#800000", // maroon
    caution: "#808000", // olive
    sidebarBg: "#c0c0c0",
    sidebarHover: "#d4d0c8",
    sidebarActiveBg: "#000080",
    sidebarAccent: "#ffffff",
    // Bevel shadows, not drop shadows — Win98 windows don't cast shadows
    shadowSm: "inset -1px -1px 0 #404040, inset 1px 1px 0 #ffffff",
    shadowMd: "inset -1px -1px 0 #404040, inset 1px 1px 0 #ffffff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf",
    shadowLg: "inset -1px -1px 0 #404040, inset 1px 1px 0 #ffffff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf",
    fontMono: "'Consolas', 'Courier New', monospace",
    fontSans: FONT_WIN98,
    fontDisplay: FONT_WIN98,
    easeSpring: "linear", // Win98 didn't animate
    easeOut: "linear",
  },
};

export const THEME_ORDER = ["dark", "light", "win98"] as const;

export type ColorMode = "dark" | "light" | "win98";

/**
 * Resolve a saved theme ID to an actual Theme, falling back to dark for
 * unknown IDs (e.g. legacy character themes from a previous version).
 */
export function getResolvedTheme(themeId: string, _mode: ColorMode): Theme {
  return THEMES[themeId] ?? THEMES["dark"]!;
}

/**
 * Applies theme tokens as CSS custom properties on :root.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  const hexToRgb = (hex: string): string => {
    if (hex.startsWith("rgba") || hex.startsWith("rgb")) {
      const parts = hex.match(/\d+/g);
      if (parts) return `${parts[0]},${parts[1]},${parts[2]}`;
    }
    if (hex.startsWith("#")) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `${r},${g},${b}`;
    }
    return "0,0,0";
  };

  root.setAttribute("data-theme", theme.id);

  root.style.setProperty("--bg", theme.bg);
  root.style.setProperty("--surface-1", theme.surface1);
  root.style.setProperty("--surface-2", theme.surface2);
  root.style.setProperty("--surface-3", theme.surface3);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--border-subtle", theme.borderSubtle);
  root.style.setProperty("--border-muted", theme.borderMuted);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--text-secondary", theme.textSecondary);
  root.style.setProperty("--text-muted", theme.textMuted);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-hover", theme.accentHover);
  root.style.setProperty("--accent-muted", theme.accentMuted);
  root.style.setProperty("--win", theme.win);
  root.style.setProperty("--loss", theme.loss);
  root.style.setProperty("--caution", theme.caution);
  root.style.setProperty("--sidebar-bg", theme.sidebarBg);
  root.style.setProperty("--sidebar-hover", theme.sidebarHover);
  root.style.setProperty("--sidebar-active-bg", theme.sidebarActiveBg);
  root.style.setProperty("--sidebar-accent", theme.sidebarAccent);
  root.style.setProperty("--shadow-sm", theme.shadowSm);
  root.style.setProperty("--shadow-md", theme.shadowMd);
  root.style.setProperty("--shadow-lg", theme.shadowLg);
  root.style.setProperty("--font-mono", theme.fontMono);
  root.style.setProperty("--font-sans", theme.fontSans);
  root.style.setProperty("--font-display", theme.fontDisplay);
  root.style.setProperty("--ease-spring", theme.easeSpring);
  root.style.setProperty("--ease-out", theme.easeOut);

  root.style.setProperty("--bg-card", theme.surface1);
  root.style.setProperty("--bg-elevated", theme.surface2);
  root.style.setProperty("--bg-hover", theme.surface3);
  root.style.setProperty("--text-dim", theme.textSecondary);
  root.style.setProperty("--text-title", theme.text);
  root.style.setProperty("--text-label", theme.textSecondary);
  root.style.setProperty("--accent-dim", theme.accentHover);
  root.style.setProperty("--accent-glow", theme.accentMuted);
  root.style.setProperty("--secondary", theme.accent);
  root.style.setProperty("--secondary-dim", theme.accentHover);
  root.style.setProperty("--green", theme.win);
  root.style.setProperty("--red", theme.loss);
  root.style.setProperty("--yellow", theme.caution);
  root.style.setProperty("--gradient-start", "transparent");
  root.style.setProperty("--gradient-end", "transparent");

  root.style.setProperty("--bg-glass", theme.surface1);
  root.style.setProperty("--bg-glass-strong", theme.surface2);
  root.style.setProperty("--border-glow", theme.borderMuted);
  root.style.setProperty("--shimmer", "transparent");
  root.style.setProperty("--plasma-a", theme.accent);
  root.style.setProperty("--plasma-b", theme.accent);
  root.style.setProperty("--plasma-c", theme.accent);
  root.style.setProperty("--surface-noise", "transparent");

  root.style.setProperty("--accent-rgb", hexToRgb(theme.accent));
  root.style.setProperty("--green-rgb", hexToRgb(theme.win));
  root.style.setProperty("--red-rgb", hexToRgb(theme.loss));
  root.style.setProperty("--yellow-rgb", hexToRgb(theme.caution));
}
