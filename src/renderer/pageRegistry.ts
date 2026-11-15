import { lazyPage } from "./lazyPage";

// Every routed page is its own chunk. They are preloaded (the landing page before the
// first render, the rest while idle) so opening one never waits on a Suspense fallback.
export const Dashboard = lazyPage(() => import("./pages/Dashboard").then((m) => m.Dashboard));
export const PlayMode = lazyPage(() => import("./pages/PlayMode").then((m) => m.PlayMode));
export const PerformanceLab = lazyPage(() => import("./pages/PerformanceLab").then((m) => m.PerformanceLab));
export const Sessions = lazyPage(() => import("./pages/Sessions").then((m) => m.Sessions));
export const Library = lazyPage(() => import("./pages/Library").then((m) => m.Library));
export const Trends = lazyPage(() => import("./pages/Trends").then((m) => m.Trends));
export const Settings = lazyPage(() => import("./pages/Settings").then((m) => m.Settings));
export const Characters = lazyPage(() => import("./pages/Characters").then((m) => m.Characters));
export const Rivals = lazyPage(() => import("./pages/Rivals").then((m) => m.Rivals));
export const Practice = lazyPage(() => import("./pages/Practice").then((m) => m.Practice));
export const Oracle = lazyPage(() => import("./pages/Oracle").then((m) => m.Oracle));
export const GameTheater = lazyPage(() => import("./pages/GameTheater").then((m) => m.GameTheater));
export const Cornerman = lazyPage(() => import("./pages/Cornerman").then((m) => m.Cornerman));
export const SetupWizard = lazyPage(() => import("./pages/SetupWizard").then((m) => m.SetupWizard));

interface Preloadable {
  preload: () => Promise<void>;
}

const PAGE_BY_PATH: Record<string, Preloadable> = {
  "/": Dashboard,
  "/dashboard": Dashboard,
  "/performance": PerformanceLab,
  "/sessions": Sessions,
  "/library": Library,
  "/trends": Trends,
  "/characters": Characters,
  "/rivals": Rivals,
  "/cornerman": Cornerman,
  "/practice": Practice,
  "/oracle": Oracle,
  "/play": PlayMode,
  "/overlay": PlayMode,
  "/setup": SetupWizard,
  "/settings": Settings,
};

/** The page a HashRouter location (`#/library`, `#/game/12`, empty) will render first. */
export function pageForHash(hash: string): Preloadable {
  const path = hash.replace(/^#/, "").split("?")[0] || "/";
  if (path.startsWith("/game/")) return GameTheater;
  return PAGE_BY_PATH[path] ?? Dashboard;
}

/** Idle-preload order: the pages reachable from the sidebar first, in sidebar order. */
export const IDLE_PRELOAD_ORDER: readonly Preloadable[] = [
  Dashboard,
  PerformanceLab,
  Sessions,
  Library,
  Trends,
  Characters,
  Rivals,
  Cornerman,
  Practice,
  Oracle,
  Settings,
  GameTheater,
  PlayMode,
  SetupWizard,
];
