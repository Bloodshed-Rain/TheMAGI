import { useCallback, useEffect, lazy, Suspense, useMemo } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Sessions = lazy(() => import("./pages/Sessions").then((m) => ({ default: m.Sessions })));
const History = lazy(() => import("./pages/History").then((m) => ({ default: m.History })));
const Trends = lazy(() => import("./pages/Trends").then((m) => ({ default: m.Trends })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const Characters = lazy(() => import("./pages/Characters").then((m) => ({ default: m.Characters })));
const GameDetail = lazy(() => import("./pages/GameDetail").then((m) => ({ default: m.GameDetail })));

import { applyTheme, getResolvedTheme, THEMES, type ColorMode } from "./themes";
import {
  CoachingIcon,
  SessionsIcon,
  HistoryIcon,
  TrendsIcon,
  ProfileIcon,
  CharactersIcon,
  SettingsIcon,
} from "./components/NavIcons";
import { CommandPalette } from "./components/CommandPalette";
import { Win98Shell } from "./components/Win98Shell";
import { useGlobalStore } from "./stores/useGlobalStore";

type Page = "dashboard" | "sessions" | "history" | "trends" | "profile" | "characters" | "settings";

interface NavItem {
  id: Page;
  label: string;
  path: string;
  Icon: React.FC<{ size?: number }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", Icon: CoachingIcon },
  { id: "sessions", label: "Sessions", path: "/sessions", Icon: SessionsIcon },
  { id: "history", label: "History", path: "/history", Icon: HistoryIcon },
  { id: "trends", label: "Trends", path: "/trends", Icon: TrendsIcon },
  { id: "profile", label: "Profile", path: "/profile", Icon: ProfileIcon },
  { id: "characters", label: "Characters", path: "/characters", Icon: CharactersIcon },
  { id: "settings", label: "Settings", path: "/settings", Icon: SettingsIcon },
];

const pageTransition = {
  duration: 0.15,
  ease: [0.22, 1, 0.36, 1] as number[],
};

const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const colorMode = useGlobalStore((state) => state.colorMode);
  const setColorMode = useGlobalStore((state) => state.setColorMode);
  const refreshKey = useGlobalStore((state) => state.refreshKey);
  const triggerRefresh = useGlobalStore((state) => state.triggerRefresh);

  useEffect(() => {
    async function loadTheme() {
      try {
        const config = await window.clippi.loadConfig();
        // Fresh installs default to "liquid". Legacy/removed theme IDs
        // (e.g. "char-fox", "crt", "glass", "controller") migrate to "liquid".
        const raw = config?.colorMode || "liquid";
        const isValid = raw in THEMES;
        const savedMode: ColorMode = (isValid ? raw : "liquid") as ColorMode;
        setColorMode(savedMode);
        applyTheme(getResolvedTheme(savedMode, savedMode));
        if (!isValid) {
          window.clippi.saveConfig({ colorMode: "liquid" }).catch(() => {});
        }
      } catch {
        applyTheme(getResolvedTheme("liquid", "liquid"));
      }
    }
    loadTheme();
  }, [setColorMode]);

  const handleCommandImport = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  // Shared nav handler used by both the sidebar and Win98Shell.
  // Fires the nav:reactivate event if the user clicks a nav item that's
  // already the active page (Characters.tsx listens for this to reset
  // its character selection back to the grid).
  const handleNavigate = useCallback(
    (item: NavItem, isActive: boolean) => {
      if (isActive) {
        window.dispatchEvent(new CustomEvent("nav:reactivate", { detail: { page: item.id } }));
      } else {
        navigate(item.path);
      }
    },
    [navigate],
  );

  // Win98 menu actions — the File menu's "Import Replays..." and Tools menu's
  // "Clear All Games..." entries route to the Settings page where those
  // flows live.
  const handleWin98Import = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const handleWin98ClearAll = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  // The routes are the same in both shells — hoist them so each shell
  // just renders them as its `children`.
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
          <Route path="/history" element={<History refreshKey={refreshKey} />} />
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

  const isWin98 = colorMode === "win98";

  // Win98 theme gets its own full chrome (menu bar + shortcut bar + status bar).
  // Everything else uses the standard vertical sidebar.
  if (isWin98) {
    return (
      <div className="app-layout">
        <Win98Shell
          navItems={NAV_ITEMS}
          currentPath={location.pathname}
          onNavigate={handleNavigate}
          onImport={handleWin98Import}
          onClearAll={handleWin98ClearAll}
          onRefresh={triggerRefresh}
        >
          {routes}
        </Win98Shell>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <CommandPalette navigateTo={(page) => navigate(`/${page}`)} onImport={handleCommandImport} />

      <nav className="sidebar" aria-label="Main navigation">
        <div className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive =
              location.pathname === item.path || (location.pathname === "/" && item.path === "/dashboard");
            return (
              <button
                key={item.id}
                className={`nav-item${isActive ? " active" : ""}`}
                onClick={() => handleNavigate(item, isActive)}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
              >
                <span className="nav-icon">
                  <item.Icon size={22} />
                </span>
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
            style={{ width: "100%", height: "100%" }}
          >
            {routes}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
