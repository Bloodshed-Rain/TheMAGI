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

export const PLAY_PANEL_CATEGORIES = {
  coaching: "Coaching",
  stats: "Stats",
  notes: "Notes",
} as const;
export type PlayPanelCategory = keyof typeof PLAY_PANEL_CATEGORIES;
export interface PlayPanelDef {
  id: PlayPanel;
  category: PlayPanelCategory;
  /** What the module shows, as the module tray describes it. */
  description: string;
  /** True when the module is empty until a live session is reading replays. */
  needsLive: boolean;
}
/** The module tray's catalog, in display order. Every PlayPanel has one entry. */
export const PLAY_PANEL_DEFS: readonly PlayPanelDef[] = [
  {
    id: "coaching",
    category: "coaching",
    description: "Live alerts during a game and one adjustment between games.",
    needsLive: true,
  },
  {
    id: "oracle",
    category: "coaching",
    description: "Ask MAGI a question about your recent games without leaving the game.",
    needsLive: false,
  },
  {
    id: "stats",
    category: "stats",
    description: "The stats you pick, read from the game in progress.",
    needsLive: true,
  },
  {
    id: "set",
    category: "stats",
    description: "Set score, opponent tag and both characters.",
    needsLive: true,
  },
  {
    id: "trends",
    category: "stats",
    description: "Your recent games against the games before them.",
    needsLive: false,
  },
  {
    id: "focus",
    category: "notes",
    description: "The one thing you are working on this session.",
    needsLive: false,
  },
  {
    id: "notes",
    category: "notes",
    description: "A notebook for what worked and what to review.",
    needsLive: false,
  },
];

export const MIN_PLAY_SIDEBAR_WIDTH = 200;
export const MAX_PLAY_SIDEBAR_WIDTH = 380;
export function clampPlaySidebarWidth(width: number): number {
  return Math.round(Math.min(MAX_PLAY_SIDEBAR_WIDTH, Math.max(MIN_PLAY_SIDEBAR_WIDTH, width)));
}

export type PlaySide = "left" | "right";
export interface PlaySidebar {
  panels: PlayPanel[];
  width: number;
  collapsed: boolean;
}
export type GameOnlyPanelMode = "visible" | "auto-hide";
/** Everything a scene remembers: which modules sit where, and how. A module
 *  belongs to at most one sidebar. */
export interface PlayArrangement {
  left: PlaySidebar;
  right: PlaySidebar;
  statIds: CornermanLiveStatId[];
  /** Modules folded down to their title bar. */
  collapsedPanels: PlayPanel[];
}
export interface PlayScene {
  /** Unique among saved scenes, compared case-insensitively. */
  name: string;
  arrangement: PlayArrangement;
}
export interface PlayLayout extends PlayArrangement {
  gameOnlyPanelMode: GameOnlyPanelMode;
  /** Arrangements the player saved by name. Built-in presets are not stored. */
  scenes: PlayScene[];
}
export const PLAY_PRESETS = {
  minimal: "Minimal",
  coaching: "Live Coaching",
  practice: "Practice",
} as const;
export type PlayPreset = keyof typeof PLAY_PRESETS;
export const MAX_PLAY_SCENES = 12;
export const MAX_PLAY_SCENE_NAME = 40;

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
    collapsedPanels: [],
    scenes: [],
  };
}

const isPlayPanel = (value: unknown): value is PlayPanel =>
  typeof value === "string" && Object.hasOwn(PLAY_PANELS, value);

function resolveArrangement(raw: Record<string, unknown>, fallback: PlayArrangement): PlayArrangement {
  const side = (input: unknown, defaults: PlaySidebar): PlaySidebar => {
    if (!input || typeof input !== "object") return defaults;
    const s = input as Partial<PlaySidebar>;
    return {
      panels: Array.isArray(s.panels) ? [...new Set(s.panels.filter(isPlayPanel))] : defaults.panels,
      width:
        typeof s.width === "number" && Number.isFinite(s.width)
          ? Math.min(MAX_PLAY_SIDEBAR_WIDTH, Math.max(MIN_PLAY_SIDEBAR_WIDTH, s.width))
          : defaults.width,
      collapsed: typeof s.collapsed === "boolean" ? s.collapsed : defaults.collapsed,
    };
  };
  const left = side(raw.left, fallback.left);
  const right = side(raw.right, fallback.right);
  return {
    left,
    // A module saved in both sidebars by an older version keeps its left slot.
    right: { ...right, panels: right.panels.filter((id) => !left.panels.includes(id)) },
    statIds: Array.isArray(raw.statIds)
      ? [...new Set(raw.statIds.filter((id): id is CornermanLiveStatId => LIVE_STAT_DEFS.some((def) => def.id === id)))]
      : fallback.statIds,
    collapsedPanels: Array.isArray(raw.collapsedPanels)
      ? [...new Set(raw.collapsedPanels.filter(isPlayPanel))]
      : fallback.collapsedPanels,
  };
}

/** A detached copy of the layout's arrangement, safe to store in a scene. */
export function playArrangement(layout: PlayArrangement): PlayArrangement {
  return {
    left: { ...layout.left, panels: [...layout.left.panels] },
    right: { ...layout.right, panels: [...layout.right.panels] },
    statIds: [...layout.statIds],
    collapsedPanels: [...layout.collapsedPanels],
  };
}
/** Replace the arrangement; saved scenes and the fullscreen preference stay. */
export function applyPlayArrangement(layout: PlayLayout, arrangement: PlayArrangement): PlayLayout {
  return { ...layout, ...playArrangement(arrangement) };
}
export function samePlayArrangement(a: PlayArrangement, b: PlayArrangement): boolean {
  const key = (value: PlayArrangement) => {
    const copy = playArrangement(value);
    copy.collapsedPanels.sort();
    return JSON.stringify(copy);
  };
  return key(a) === key(b);
}

const sceneKey = (name: string) => name.trim().toLowerCase();
/** Why `name` cannot be saved as a scene, or null when it can. Saving under an
 *  existing scene's name replaces that scene, so that is not an error. */
export function playSceneNameError(layout: PlayLayout, name: string): string | null {
  const key = sceneKey(name);
  if (!key) return "Name the scene first.";
  if (name.trim().length > MAX_PLAY_SCENE_NAME) return `Use ${MAX_PLAY_SCENE_NAME} characters or fewer.`;
  if (Object.values(PLAY_PRESETS).some((label) => sceneKey(label) === key))
    return "That name belongs to a built-in scene.";
  if (layout.scenes.length >= MAX_PLAY_SCENES && !layout.scenes.some((scene) => sceneKey(scene.name) === key))
    return `You can keep ${MAX_PLAY_SCENES} scenes. Delete one first.`;
  return null;
}
/** Save the current arrangement under `name`, replacing a scene of that name.
 *  Returns the layout unchanged when the name is not allowed. */
export function savePlayScene(layout: PlayLayout, name: string): PlayLayout {
  if (playSceneNameError(layout, name)) return layout;
  const scene: PlayScene = { name: name.trim(), arrangement: playArrangement(layout) };
  const index = layout.scenes.findIndex((item) => sceneKey(item.name) === sceneKey(name));
  const scenes = [...layout.scenes];
  if (index === -1) scenes.push(scene);
  else scenes[index] = scene;
  return { ...layout, scenes };
}
export function deletePlayScene(layout: PlayLayout, name: string): PlayLayout {
  return { ...layout, scenes: layout.scenes.filter((scene) => sceneKey(scene.name) !== sceneKey(name)) };
}

/** Which sidebar holds the module, or null when it is not placed. */
export function playPanelSide(layout: PlayArrangement, id: PlayPanel): PlaySide | null {
  return layout.left.panels.includes(id) ? "left" : layout.right.panels.includes(id) ? "right" : null;
}
/** Put a module in `side` at `index`, counted in that sidebar's list as it is
 *  now (before the module leaves its old slot). Omit `index` to append. The
 *  module leaves wherever it was, and a hidden target sidebar is shown. */
export function placePlayPanel<T extends PlayArrangement>(layout: T, id: PlayPanel, side: PlaySide, index?: number): T {
  const from = layout[side].panels.indexOf(id);
  const without = (panels: PlayPanel[]) => panels.filter((panel) => panel !== id);
  const target = without(layout[side].panels);
  const requested = index === undefined || !Number.isFinite(index) ? target.length : Math.trunc(index);
  const at = Math.min(target.length, Math.max(0, from !== -1 && from < requested ? requested - 1 : requested));
  target.splice(at, 0, id);
  const other: PlaySide = side === "left" ? "right" : "left";
  return {
    ...layout,
    [side]: { ...layout[side], panels: target, collapsed: false },
    [other]: { ...layout[other], panels: without(layout[other].panels) },
  };
}
/** Take a module out of both sidebars. Its folded state is forgotten. */
export function removePlayPanel<T extends PlayArrangement>(layout: T, id: PlayPanel): T {
  return {
    ...layout,
    left: { ...layout.left, panels: layout.left.panels.filter((panel) => panel !== id) },
    right: { ...layout.right, panels: layout.right.panels.filter((panel) => panel !== id) },
    collapsedPanels: layout.collapsedPanels.filter((panel) => panel !== id),
  };
}

export function resolvePlayLayout(value: unknown): PlayLayout {
  const fallback = playPreset("coaching");
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const scenes: PlayScene[] = [];
  for (const item of Array.isArray(raw.scenes) ? raw.scenes : []) {
    if (!item || typeof item !== "object") continue;
    const { name, arrangement } = item as Record<string, unknown>;
    if (typeof name !== "string" || !arrangement || typeof arrangement !== "object") continue;
    // The same checks a save makes: blank, long, reserved, over the limit.
    // A repeated name replaces the earlier scene, as saving would.
    const next = savePlayScene(
      { ...fallback, ...resolveArrangement(arrangement as Record<string, unknown>, fallback), scenes },
      name,
    );
    scenes.splice(0, scenes.length, ...next.scenes);
  }
  return {
    gameOnlyPanelMode: raw.gameOnlyPanelMode === "auto-hide" ? "auto-hide" : "visible",
    ...resolveArrangement(raw, fallback),
    scenes,
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
