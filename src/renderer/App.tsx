import { useCallback, useEffect, lazy, Suspense } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const Dashboard = lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })));
const Sessions = lazy(() => import("./pages/Sessions").then(m => ({ default: m.Sessions })));
const History = lazy(() => import("./pages/History").then(m => ({ default: m.History })));
const Trends = lazy(() => import("./pages/Trends").then(m => ({ default: m.Trends })));
const Profile = lazy(() => import("./pages/Profile").then(m => ({ default: m.Profile })));
const Settings = lazy(() => import("./pages/Settings").then(m => ({ default: m.Settings })));
const Characters = lazy(() => import("./pages/Characters").then(m => ({ default: m.Characters })));
const GameDetail = lazy(() => import("./pages/GameDetail").then(m => ({ default: m.GameDetail })));
import { applyTheme, getResolvedTheme, type ColorMode } from "./themes";
import magiController from "./assets/magi-controller.png";
import magiSword from "./assets/magi-sword.png";
import {
  CoachingIcon, SessionsIcon, HistoryIcon, TrendsIcon, ProfileIcon, CharactersIcon, SettingsIcon,
} from "./components/NavIcons";
import { CommandPalette } from "./components/CommandPalette";
import { useGlobalStore } from "./stores/useGlobalStore";

type Page = "dashboard" | "sessions" | "history" | "trends" | "profile" | "characters" | "settings";

const NAV_ITEMS: { id: Page; label: string; path: string; Icon: React.FC<{ size?: number }> }[] = [
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
  const setColorMode = useGlobalStore((state) => state.setColorMode);
  const refreshKey = useGlobalStore((state) => state.refreshKey);
  const triggerRefresh = useGlobalStore((state) => state.triggerRefresh);

  useEffect(() => {
    async function loadTheme() {
      try {
        const config = await window.clippi.loadConfig();
        const savedMode: ColorMode = config?.colorMode || "dark";
        setColorMode(savedMode);
        applyTheme(getResolvedTheme(savedMode, savedMode));
      } catch {
        applyTheme(getResolvedTheme("dark", "dark"));
      }
    }
    loadTheme();
  }, [setColorMode]);

  const handleCommandImport = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  return (
    <div className="app-layout">
      <CommandPalette
        navigateTo={(page) => navigate(`/${page}`)}
        onImport={handleCommandImport}
      />

      <nav className="sidebar" aria-label="Main navigation">
        <img src={magiSword} alt="" className="sidebar-sword" aria-hidden="true" />

        <div className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path || (location.pathname === "/" && item.path === "/dashboard");
            return (
              <button
                key={item.id}
                className={`nav-item${isActive ? " active" : ""}`}
                onClick={() => navigate(item.path)}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
              >
                <span className="nav-icon"><item.Icon size={50} /></span>
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <main className="main-content">
        <img src={magiController} alt="" className="main-watermark" aria-hidden="true" />
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
            <Suspense fallback={<div className="page-loading"><div className="spinner" /></div>}>
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
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
