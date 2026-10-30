import { LIVE_STAT_DEFS, type CornermanLiveStatId } from "./cornermanLiveStats";

export const PLAY_PANELS = {
  stats: "Live stats",
  set: "Opponent & set",
  coaching: "Cornerman",
  oracle: "MAGI Oracle",
  trends: "Recent form",
  focus: "Practice focus",
  notes: "Notes",
} as const;
export type PlayPanel = keyof typeof PLAY_PANELS;
export interface PlaySidebar {
  panels: PlayPanel[];
  width: number;
  collapsed: boolean;
}
export type GameOnlyPanelMode = "visible" | "auto-hide";
export interface PlayLayout {
  gameOnlyPanelMode: GameOnlyPanelMode;
  left: PlaySidebar;
  right: PlaySidebar;
  statIds: CornermanLiveStatId[];
}
export type PlayPreset = "coaching" | "minimal" | "practice";
export function playPreset(preset: PlayPreset): PlayLayout {
  return {
    gameOnlyPanelMode: "visible",
    left: { panels: ["set", "stats"], width: 250, collapsed: preset === "minimal" },
    right: {
      panels: preset === "practice" ? ["focus", "notes", "coaching"] : ["coaching", "focus"],
      width: 290,
      collapsed: preset === "minimal",
    },
    statIds: ["lCancelRate", "neutralWins", "damagePerOpening", "openingsPerKill"],
  };
}
export function resolvePlayLayout(value: unknown): PlayLayout {
  const fallback = playPreset("coaching");
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const side = (input: unknown, defaults: PlaySidebar): PlaySidebar => {
    if (!input || typeof input !== "object") return defaults;
    const s = input as Partial<PlaySidebar>;
    return {
      panels: Array.isArray(s.panels)
        ? [...new Set(s.panels.filter((p) => typeof p === "string" && Object.hasOwn(PLAY_PANELS, p)))]
        : defaults.panels,
      width:
        typeof s.width === "number" && Number.isFinite(s.width)
          ? Math.min(380, Math.max(200, s.width))
          : defaults.width,
      collapsed: typeof s.collapsed === "boolean" ? s.collapsed : defaults.collapsed,
    };
  };
  return {
    gameOnlyPanelMode: raw.gameOnlyPanelMode === "auto-hide" ? "auto-hide" : "visible",
    left: side(raw.left, fallback.left),
    right: side(raw.right, fallback.right),
    statIds: Array.isArray(raw.statIds)
      ? [...new Set(raw.statIds.filter((id): id is CornermanLiveStatId => LIVE_STAT_DEFS.some((def) => def.id === id)))]
      : fallback.statIds,
  };
}
export interface PlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function validatePlayBounds(value: PlayBounds): PlayBounds {
  if (
    !value ||
    ![value.x, value.y, value.width, value.height].every(Number.isFinite) ||
    value.width < 1 ||
    value.height < 1 ||
    value.width > 20000 ||
    value.height > 20000
  ) {
    throw new Error("Invalid game window bounds");
  }
  return value;
}
export interface PlayStatus {
  phase: "stopped" | "launching" | "running" | "error";
  visible: boolean;
  error: string | null;
}
export interface PlayCoachingSetup {
  replayFolder: string | null;
  targetPlayer: string | null;
  aiReady: boolean;
  aiMessage: string;
  issue: string | null;
}
