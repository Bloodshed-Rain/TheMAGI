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
  // Liquid-only optional tokens — other themes leave undefined.
  surfaceBlur?: string;
  chromeGlint?: string;
  radiusXs?: string;
  radiusSm?: string;
  radiusMd?: string;
}

/* ───────────────────────────────────────────────────────────────────────────
 * MAGI Theme Definitions — 6 curated themes
 *
 *   liquid      — default chrome/glass aesthetic
 *   telemetry   — dark blue data-forward mode
 *   tournament  — high-contrast black for tournament overlays
 *   crt         — green phosphor CRT look
 *   amber       — warm monochrome amber CRT variant
 *   light       — clean bright mode for daytime / well-lit rooms
 *
 * Extra per-theme visual treatment (bevels, sizing) is handled by
 * selectors in styles/tokens.css keyed off `[data-theme="<id>"]`.
 * ─────────────────────────────────────────────────────────────────────────── */

const FONT_SANS = "'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Fira Code', monospace";
const FONT_DISPLAY = "'Chakra Petch', 'DM Sans', -apple-system, sans-serif";
const EASE_SPRING = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_OUT = "cubic-bezier(0, 0, 0.2, 1)";

export const THEMES: Record<string, Theme> = {
  /* ─── Liquid Metal — default aesthetic ─────────────────────────────── */
  liquid: {
    id: "liquid",
    name: "Liquid Metal",
    bg: "#0a0d14",
    surface1: "rgba(255,255,255,0.04)",
    surface2: "rgba(255,255,255,0.08)",
    surface3: "rgba(255,255,255,0.12)",
    border: "rgba(255,255,255,0.1)",
    borderSubtle: "rgba(255,255,255,0.05)",
    borderMuted: "rgba(255,255,255,0.18)",
    text: "#f5f7fa",
    textSecondary: "#cfd4dc",
    textMuted: "#6a707b",
    accent: "#c7ccd6", // chrome
    accentHover: "#e8ebf0",
    accentMuted: "rgba(199,204,214,0.14)",
    win: "#7ee8c5",
    loss: "#ff8a9e",
    caution: "#ffd47a",
    sidebarBg: "rgba(10,13,20,0.65)",
    sidebarHover: "rgba(255,255,255,0.06)",
    sidebarActiveBg: "rgba(255,255,255,0.12)",
    sidebarAccent: "#f5f7fa",
    shadowSm: "0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
    shadowMd: "0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
    shadowLg: "0 40px 120px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.14)",
    fontMono: FONT_MONO,
    fontSans: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    fontDisplay: "'Inter', -apple-system, 'SF Pro Display', sans-serif",
    easeSpring: EASE_SPRING,
    easeOut: EASE_OUT,
    surfaceBlur: "28px",
    chromeGlint:
      "linear-gradient(145deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 20%, rgba(255,255,255,0) 45%, rgba(255,255,255,0.08) 70%, rgba(255,255,255,0.02) 100%)",
    radiusXs: "10px",
    radiusSm: "14px",
    radiusMd: "20px",
  },

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
};

export const THEME_ORDER = ["liquid", "telemetry", "tournament", "crt", "amber", "light"] as const;

export type ColorMode = "liquid" | "telemetry" | "tournament" | "crt" | "amber" | "light";

/**
 * Resolve a saved theme ID to an actual Theme, falling back to liquid for
 * unknown IDs (e.g. legacy character themes from a previous version).
 */
export function getResolvedTheme(themeId: string, _mode: ColorMode): Theme {
  return THEMES[themeId] ?? THEMES["liquid"]!;
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

  // Liquid-only tokens — use explicit fallbacks so other themes stay sane.
  root.style.setProperty("--surface-blur", theme.surfaceBlur ?? "0px");
  root.style.setProperty("--chrome-glint", theme.chromeGlint ?? "transparent");
  root.style.setProperty("--radius-xs", theme.radiusXs ?? "2px");
  root.style.setProperty("--radius-sm", theme.radiusSm ?? "4px");
  root.style.setProperty("--radius-md", theme.radiusMd ?? "6px");
}
