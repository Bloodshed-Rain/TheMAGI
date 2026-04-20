import { useCallback, useEffect, lazy, Suspense, useMemo } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";

const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Sessions = lazy(() => import("./pages/Sessions").then((m) => ({ default: m.Sessions })));
const Coaching = lazy(() => import("./pages/Coaching").then((m) => ({ default: m.Coaching })));
const Library = lazy(() => import("./pages/Library").then((m) => ({ default: m.Library })));
const Trends = lazy(() => import("./pages/Trends").then((m) => ({ default: m.Trends })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const Characters = lazy(() => import("./pages/Characters").then((m) => ({ default: m.Characters })));
const GameDetail = lazy(() => import("./pages/GameDetail").then((m) => ({ default: m.GameDetail })));

import { applyTheme, getResolvedTheme, THEMES, type ColorMode } from "./themes";
import {
  DashboardIcon,
  SessionsIcon,
  HistoryIcon,
  TrendsIcon,
  ProfileIcon,
  CharactersIcon,
  SettingsIcon,
  LibraryIcon,
} from "./components/NavIcons";
import { CommandPalette } from "./components/CommandPalette";
import { LiquidShell, type NavItem as LiquidNavItem } from "./components/LiquidShell";
import { TweaksPanel } from "./components/TweaksPanel";
import { GameDrawer } from "./components/GameDrawer";
import { useGlobalStore, type Density } from "./stores/useGlobalStore";

type Page = "dashboard" | "sessions" | "coaching" | "library" | "trends" | "profile" | "characters" | "settings";

interface NavItem extends LiquidNavItem {
  id: Page;
}

const ANALYZE_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", Icon: DashboardIcon },
  { id: "sessions", label: "Sessions", path: "/sessions", Icon: SessionsIcon },
  { id: "library", label: "Library", path: "/library", Icon: LibraryIcon },
  { id: "coaching", label: "Coaching", path: "/coaching", Icon: HistoryIcon },
  { id: "trends", label: "Trends", path: "/trends", Icon: TrendsIcon },
  { id: "characters", label: "Characters", path: "/characters", Icon: CharactersIcon },
  { id: "profile", label: "Profile", path: "/profile", Icon: ProfileIcon },
];

const SYSTEM_ITEMS: NavItem[] = [{ id: "settings", label: "Settings", path: "/settings", Icon: SettingsIcon }];

const ALL_NAV_ITEMS: NavItem[] = [...ANALYZE_ITEMS, ...SYSTEM_ITEMS];

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const colorMode = useGlobalStore((state) => state.colorMode);
  const setColorMode = useGlobalStore((state) => state.setColorMode);
  const density = useGlobalStore((state) => state.density);
  const setDensity = useGlobalStore((state) => state.setDensity);
  const refreshKey = useGlobalStore((state) => state.refreshKey);
  const triggerRefresh = useGlobalStore((state) => state.triggerRefresh);

  useEffect(() => {
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
    loadTheme();
  }, [setColorMode, setDensity]);

  useEffect(() => {
    document.body.setAttribute("data-density", density);
  }, [density]);

  const handleCommandImport = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  // Shared nav handler used by both shells.
  // Fires the nav:reactivate event if the user clicks a nav item that's
  // already the active page (Characters.tsx listens for this to reset
  // its character selection back to the grid).
  const handleNavigate = useCallback(
    (item: LiquidNavItem, isActive: boolean) => {
      if (isActive) {
        window.dispatchEvent(new CustomEvent("nav:reactivate", { detail: { page: item.id } }));
      } else {
        navigate(item.path);
      }
    },
    [navigate],
  );

  const routes = useMemo(
    () => (
      <Suspense
        fallback={
          <div className="page-loading">
            <div className="spinner" />
          </div>
        }
      >
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard refreshKey={refreshKey} />} />
          <Route path="/sessions" element={<Sessions refreshKey={refreshKey} />} />
          <Route path="/library" element={<Library refreshKey={refreshKey} />} />
          <Route path="/history" element={<Navigate to="/coaching" replace />} />
          <Route path="/coaching" element={<Coaching refreshKey={refreshKey} />} />
          <Route path="/trends" element={<Trends refreshKey={refreshKey} />} />
          <Route path="/profile" element={<Profile refreshKey={refreshKey} />} />
          <Route path="/characters" element={<Characters refreshKey={refreshKey} />} />
          <Route path="/settings" element={<Settings onImport={triggerRefresh} />} />
          <Route path="/game/:gameId" element={<GameDetail refreshKey={refreshKey} />} />
        </Routes>
      </Suspense>
    ),
    [location, refreshKey, triggerRefresh],
  );

  return (
    <>
      <CommandPalette navigateTo={(page) => navigate(`/${page}`)} onImport={handleCommandImport} />
      <LiquidShell
        analyzeItems={ANALYZE_ITEMS}
        systemItems={SYSTEM_ITEMS}
        onNavigate={handleNavigate}
        watcherActive={true /* TODO: no centralized watcher status surface yet; see Task 30. */}
        gamesCount={0 /* TODO: no cheap games-count hook yet; see Task 30. */}
      >
        {routes}
      </LiquidShell>
      <TweaksPanel />
      <GameDrawer />
    </>
  );
}
