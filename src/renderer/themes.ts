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
  appBackgroundImage: string;
  appBackgroundPosition: string;
  appBackgroundSize: string;
  appBackgroundRepeat: string;
  appBackgroundBlendMode: string;
  magiBackgroundOpacity: string;
  magiBackgroundFilter: string;
  magiBackgroundPosition: string;
  magiBackgroundSize: string;
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
 * MAGI Theme Definitions — 4 curated themes
 *
 *   liquid      — default chrome/glass aesthetic
 *   telemetry   — dark blue data-forward mode
 *   tournament  — high-contrast black for tournament overlays
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
    textMuted: "#9aa1ad", // raised to clear WCAG AA 4.5:1 on surface-1/2/3 (was #6a707b ≈ 3.3:1)
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
    appBackgroundImage:
      "radial-gradient(900px 620px at 14% 18%, rgba(160,168,255,0.18), transparent 62%), radial-gradient(880px 680px at 92% 82%, rgba(255,138,158,0.14), transparent 60%), linear-gradient(145deg, #0a0d14 0%, #171b28 54%, #070910 100%)",
    appBackgroundPosition: "center",
    appBackgroundSize: "cover",
    appBackgroundRepeat: "no-repeat",
    appBackgroundBlendMode: "normal",
    magiBackgroundOpacity: "0.14", // visible without bleeding through data-dense cards/charts
    magiBackgroundFilter: "drop-shadow(0 28px 70px rgba(0,0,0,0.5)) saturate(1.05)",
    magiBackgroundPosition: "center",
    magiBackgroundSize: "min(1180px, 78vw) auto",
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
    textMuted: "#a8b5c6", // raised to clear WCAG AA 4.5:1 on surface-1/2 (was #64748b ≈ 2.2:1 on surface-2)
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
    appBackgroundImage:
      "radial-gradient(760px 520px at 12% 18%, rgba(34,211,238,0.16), transparent 62%), radial-gradient(760px 540px at 88% 74%, rgba(129,140,248,0.12), transparent 64%), linear-gradient(135deg, #0f172a 0%, #08111f 48%, #101c2d 100%)",
    appBackgroundPosition: "center",
    appBackgroundSize: "cover",
    appBackgroundRepeat: "no-repeat",
    appBackgroundBlendMode: "normal",
    magiBackgroundOpacity: "0.14", // visible without bleeding behind charts/tables
    magiBackgroundFilter: "drop-shadow(0 24px 60px rgba(0,0,0,0.45)) hue-rotate(150deg) saturate(0.85)",
    magiBackgroundPosition: "center",
    magiBackgroundSize: "min(1120px, 76vw) auto",
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
    textMuted: "#a3a3a3", // raised to clear WCAG AA 4.5:1 (was #737373 ≈ 3.9:1)
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
    appBackgroundImage:
      "radial-gradient(680px 460px at 20% 16%, rgba(59,130,246,0.16), transparent 62%), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(180deg, #000000 0%, #05070b 52%, #000000 100%)",
    appBackgroundPosition: "center",
    appBackgroundSize: "cover, 44px 44px, cover",
    appBackgroundRepeat: "no-repeat, repeat, no-repeat",
    appBackgroundBlendMode: "normal",
    magiBackgroundOpacity: "0.22",
    magiBackgroundFilter: "drop-shadow(0 24px 60px rgba(0,0,0,0.75)) grayscale(0.2) contrast(1.1)",
    magiBackgroundPosition: "center",
    magiBackgroundSize: "min(1100px, 74vw) auto",
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
    textMuted: "#5b6675", // darkened to clear WCAG AA 4.5:1 on light surfaces (was #94a3b8 ≈ 2.4:1)
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
    appBackgroundImage:
      "radial-gradient(760px 520px at 10% 12%, rgba(14,165,233,0.14), transparent 66%), radial-gradient(720px 540px at 90% 78%, rgba(99,102,241,0.1), transparent 66%), linear-gradient(145deg, #ffffff 0%, #f8fafc 58%, #eef5ff 100%)",
    appBackgroundPosition: "center",
    appBackgroundSize: "cover",
    appBackgroundRepeat: "no-repeat",
    appBackgroundBlendMode: "normal",
    magiBackgroundOpacity: "0.14",
    magiBackgroundFilter: "drop-shadow(0 18px 46px rgba(15,23,42,0.12)) saturate(0.75) brightness(1.12)",
    magiBackgroundPosition: "center",
    magiBackgroundSize: "min(1120px, 76vw) auto",
    fontMono: FONT_MONO,
    fontSans: FONT_SANS,
    fontDisplay: FONT_DISPLAY,
    easeSpring: EASE_SPRING,
    easeOut: EASE_OUT,
  },
};

export const THEME_ORDER = ["liquid", "telemetry", "tournament", "light"] as const;

export type ColorMode = "liquid" | "telemetry" | "tournament" | "light";

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
  document.body?.setAttribute("data-theme", theme.id);

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
  root.style.setProperty("--app-bg-image", theme.appBackgroundImage);
  root.style.setProperty("--app-bg-position", theme.appBackgroundPosition);
  root.style.setProperty("--app-bg-size", theme.appBackgroundSize);
  root.style.setProperty("--app-bg-repeat", theme.appBackgroundRepeat);
  root.style.setProperty("--app-bg-blend-mode", theme.appBackgroundBlendMode);
  root.style.setProperty("--magi-bg-logo-opacity", theme.magiBackgroundOpacity);
  root.style.setProperty("--magi-bg-logo-filter", theme.magiBackgroundFilter);
  root.style.setProperty("--magi-bg-logo-position", theme.magiBackgroundPosition);
  root.style.setProperty("--magi-bg-logo-size", theme.magiBackgroundSize);
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
