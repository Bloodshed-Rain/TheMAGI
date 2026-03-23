import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dashboard } from "./pages/Dashboard";
import { Sessions } from "./pages/Sessions";
import { Trends } from "./pages/Trends";
import { Profile } from "./pages/Profile";
import { Settings } from "./pages/Settings";
import { Characters } from "./pages/Characters";
import { applyTheme, getResolvedTheme, type ColorMode } from "./themes";
import { useUptime } from "./hooks";
import magiLogo from "./assets/magi-logo.png";

// Isolated component — setInterval only re-renders this tiny subtree, not the entire App
function SystemUptime() {
  const uptime = useUptime();
  return <div className="system-status" aria-hidden="true">SYS {uptime}</div>;
}
import {
  CoachingIcon, SessionsIcon, TrendsIcon, ProfileIcon, CharactersIcon, SettingsIcon,
} from "./components/NavIcons";
import { CommandPalette } from "./components/CommandPalette";

type Page = "dashboard" | "sessions" | "trends" | "profile" | "characters" | "settings";

const NAV_ITEMS: { id: Page; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: "dashboard", label: "Coaching", Icon: CoachingIcon },
  { id: "sessions", label: "Sessions", Icon: SessionsIcon },
  { id: "trends", label: "Trends", Icon: TrendsIcon },
  { id: "profile", label: "Profile", Icon: ProfileIcon },
  { id: "characters", label: "Characters", Icon: CharactersIcon },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

const PAGE_INDEX: Record<Page, number> = {
  dashboard: 0, sessions: 1, trends: 2, profile: 3, characters: 4, settings: 5,
};

const pageTransition = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1] as number[],
};

// Sun icon for light mode toggle
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" />
    </svg>
  );
}

// Moon icon for dark mode toggle
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8.5a5.5 5.5 0 1 1-7-7 4.5 4.5 0 0 0 7 7z" />
    </svg>
  );
}

// Neural mesh background -- living, breathing energy field
function NeuralMesh() {
  return (
    <>
      <div className="neural-mesh" aria-hidden="true" />
      <div className="hex-grid" aria-hidden="true" />
      <div className="scan-line" aria-hidden="true" />
    </>
  );
}

// Ambient particle field -- floating phosphor motes with glow
function ParticleField() {
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      size: Math.random() * 2.5 + 0.8,
      delay: Math.random() * 20,
      duration: Math.random() * 15 + 10,
      opacity: Math.random() * 0.35 + 0.1,
    })),
  []);

  return (
    <div className="particle-field" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: `${p.x}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  );
}

export function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [colorMode, setColorMode] = useState<ColorMode>("dark");
  const prevPageRef = useRef<number>(0);

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
  }, []);

  const handleModeChange = useCallback((mode: ColorMode) => {
    setColorMode(mode);
    applyTheme(getResolvedTheme(mode, mode));
    window.clippi.loadConfig().then((config: any) => {
      window.clippi.saveConfig({ ...config, colorMode: mode });
    });
  }, []);

  const handleImport = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleToggleTheme = useCallback(() => {
    const next: ColorMode = colorMode === "dark" ? "light" : "dark";
    handleModeChange(next);
  }, [colorMode, handleModeChange]);

  const navigateTo = useCallback((target: Page) => {
    prevPageRef.current = PAGE_INDEX[page];
    setPage(target);
  }, [page]);

  const handleCommandImport = useCallback(() => {
    navigateTo("settings");
  }, [navigateTo]);

  // Directional transitions
  const direction = PAGE_INDEX[page] >= prevPageRef.current ? 1 : -1;

  const pageVariants = {
    initial: { opacity: 0, y: direction * 24, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: direction * -12, scale: 0.995 },
  };

  return (
    <div className="app-layout">
      <NeuralMesh />
      <ParticleField />
      <CommandPalette
        navigateTo={navigateTo}
        onToggleTheme={handleToggleTheme}
        onImport={handleCommandImport}
      />
      <nav className="sidebar" role="tablist" aria-label="Main navigation">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <div className="logo-orbit logo-orbit-1" />
            <div className="logo-orbit logo-orbit-2" />
            <div className="logo-orbit logo-orbit-3" />
            <div className="logo-glow" />
            <img src={magiLogo} alt="MAGI" className="sidebar-logo-img" />
          </div>
          <span className="logo-wordmark">MAGI</span>
          <span className="logo-subtitle">MELEE INTELLIGENCE</span>
        </div>
        <div className="sidebar-nav">
          {NAV_ITEMS.map((item, i) => (
            <motion.button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => navigateTo(item.id)}
              role="tab"
              aria-selected={page === item.id}
              aria-label={item.label}
              whileTap={{ scale: 0.94, x: 2 }}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="nav-icon"><item.Icon size={20} /></span>
              {item.label}
            </motion.button>
          ))}
        </div>
        <div className="sidebar-footer">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div className="mode-toggle">
              <motion.button
                className={`mode-btn ${colorMode === "light" ? "active" : ""}`}
                onClick={() => handleModeChange("light")}
                aria-label="Light mode"
                whileTap={{ scale: 0.9, rotate: 15 }}
              >
                <SunIcon />
              </motion.button>
              <motion.button
                className={`mode-btn ${colorMode === "dark" ? "active" : ""}`}
                onClick={() => handleModeChange("dark")}
                aria-label="Dark mode"
                whileTap={{ scale: 0.9, rotate: -15 }}
              >
                <MoonIcon />
              </motion.button>
            </div>
            <SystemUptime />
          </div>
        </div>
      </nav>
      <main className="main-content" role="tabpanel">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
          >
            {page === "dashboard" && <Dashboard refreshKey={refreshKey} />}
            {page === "sessions" && <Sessions refreshKey={refreshKey} />}
            {page === "trends" && <Trends refreshKey={refreshKey} />}
            {page === "profile" && <Profile refreshKey={refreshKey} />}
            {page === "characters" && <Characters refreshKey={refreshKey} />}
            {page === "settings" && <Settings onImport={handleImport} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
