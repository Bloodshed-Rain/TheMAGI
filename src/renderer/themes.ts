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
  // Optional material and geometry tokens.
  surfaceBlur?: string;
  chromeGlint?: string;
  radiusXs?: string;
  radiusSm?: string;
  radiusMd?: string;
}

/* ───────────────────────────────────────────────────────────────────────────
 * MAGI Theme Definitions — 3 distinct themes
 *
 *   liquid      — default chrome/glass aesthetic
 *   indigo      — molded GameCube-inspired console hardware
 *   windows2000 — classic Windows 2000 desktop chrome
 *
 * Extra per-theme visual treatment (bevels, sizing) is handled by
 * selectors in styles/tokens.css keyed off `[data-theme="<id>"]`.
 * ─────────────────────────────────────────────────────────────────────────── */

const FONT_MONO = "'JetBrains Mono', 'Fira Code', monospace";
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

  /* ─── GameCube Indigo — molded console hardware ───────────────── */
  indigo: {
    id: "indigo",
    name: "GameCube Indigo",
    bg: "#17132d",
    surface1: "#2d2554",
    surface2: "#3d326d",
    surface3: "#504383",
    border: "rgba(222,216,255,0.24)",
    borderSubtle: "rgba(222,216,255,0.1)",
    borderMuted: "rgba(222,216,255,0.42)",
    text: "#fbf9ff",
    textSecondary: "#ded8f0",
    textMuted: "#bdb4d4",
    accent: "#79d6a3",
    accentHover: "#9aebba",
    accentMuted: "rgba(121,214,163,0.2)",
    win: "#79d6a3",
    loss: "#ef6a7a",
    caution: "#f2c94c",
    sidebarBg: "#211a43",
    sidebarHover: "#352b61",
    sidebarActiveBg: "#443875",
    sidebarAccent: "#9aebba",
    shadowSm:
      "inset 0 2px 1px rgba(255,255,255,0.12), inset 0 -3px 5px rgba(10,6,28,0.28), 0 5px 12px rgba(8,5,24,0.3)",
    shadowMd:
      "inset 0 3px 2px rgba(255,255,255,0.14), inset 0 -5px 8px rgba(10,6,28,0.32), 0 14px 28px rgba(8,5,24,0.38)",
    shadowLg:
      "inset 0 3px 2px rgba(255,255,255,0.16), inset 0 -7px 12px rgba(10,6,28,0.36), 0 24px 52px rgba(8,5,24,0.48)",
    appBackgroundImage:
      "radial-gradient(circle at 86% 16%, rgba(242,201,76,0.17) 0 28px, transparent 29px), radial-gradient(circle at 78% 22%, rgba(239,106,122,0.15) 0 18px, transparent 19px), radial-gradient(900px 620px at 12% 14%, rgba(134,111,218,0.42), transparent 62%), linear-gradient(145deg, #211945 0%, #17132d 50%, #0f0b23 100%)",
    appBackgroundPosition: "center",
    appBackgroundSize: "cover",
    appBackgroundRepeat: "no-repeat",
    appBackgroundBlendMode: "normal",
    magiBackgroundOpacity: "0.12",
    magiBackgroundFilter: "drop-shadow(0 22px 54px rgba(7,4,22,0.55)) hue-rotate(225deg) saturate(0.8)",
    magiBackgroundPosition: "center right 4vw",
    magiBackgroundSize: "min(980px, 68vw) auto",
    fontMono: "'Trebuchet MS', 'Arial Rounded MT Bold', Arial, sans-serif",
    fontSans: "'Trebuchet MS', 'Arial Rounded MT Bold', Arial, sans-serif",
    fontDisplay: "'Trebuchet MS', 'Arial Rounded MT Bold', Arial, sans-serif",
    easeSpring: "cubic-bezier(0.18, 1.38, 0.42, 1)",
    easeOut: EASE_OUT,
    radiusXs: "8px",
    radiusSm: "14px",
    radiusMd: "22px",
  },

  /* ─── Windows 2000 — classic desktop chrome ──────────────────── */
  windows2000: {
    id: "windows2000",
    name: "Windows 2000",
    bg: "#008080",
    surface1: "#d4d0c8",
    surface2: "#ece9d8",
    surface3: "#b8b4ac",
    border: "#808080",
    borderSubtle: "#b0b0b0",
    borderMuted: "#404040",
    text: "#000000",
    textSecondary: "#202020",
    textMuted: "#4b4b4b",
    accent: "#000080",
    accentHover: "#0000a8",
    accentMuted: "#b8b8d8",
    win: "#008000",
    loss: "#c00000",
    caution: "#806000",
    sidebarBg: "#d4d0c8",
    sidebarHover: "#ece9d8",
    sidebarActiveBg: "#000080",
    sidebarAccent: "#ffffff",
    shadowSm: "inset 1px 1px 0 #ffffff, inset -1px -1px 0 #404040",
    shadowMd: "inset 1px 1px 0 #ffffff, inset -2px -2px 0 #404040, 2px 2px 0 rgba(0,0,0,0.28)",
    shadowLg: "inset 2px 2px 0 #ffffff, inset -2px -2px 0 #404040, 5px 5px 0 rgba(0,0,0,0.32)",
    appBackgroundImage: "linear-gradient(#008080, #008080)",
    appBackgroundPosition: "center",
    appBackgroundSize: "cover",
    appBackgroundRepeat: "no-repeat",
    appBackgroundBlendMode: "normal",
    magiBackgroundOpacity: "0.035",
    magiBackgroundFilter: "grayscale(1) contrast(1.5)",
    magiBackgroundPosition: "center",
    magiBackgroundSize: "min(900px, 64vw) auto",
    fontMono: "Tahoma, 'MS Sans Serif', Arial, sans-serif",
    fontSans: "Tahoma, 'MS Sans Serif', Arial, sans-serif",
    fontDisplay: "Tahoma, 'MS Sans Serif', Arial, sans-serif",
    easeSpring: "linear",
    easeOut: "linear",
    radiusXs: "0px",
    radiusSm: "0px",
    radiusMd: "0px",
  },
};

export const THEME_ORDER = ["liquid", "indigo", "windows2000"] as const;

export type ColorMode = "liquid" | "indigo" | "windows2000";

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

  // Optional tokens use explicit fallbacks for themes that do not define them.
  root.style.setProperty("--surface-blur", theme.surfaceBlur ?? "0px");
  root.style.setProperty("--chrome-glint", theme.chromeGlint ?? "transparent");
  root.style.setProperty("--radius-xs", theme.radiusXs ?? "2px");
  root.style.setProperty("--radius-sm", theme.radiusSm ?? "4px");
  root.style.setProperty("--radius-md", theme.radiusMd ?? "6px");
}
