import { useState, useCallback, useEffect } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Sessions } from "./pages/Sessions";
import { Trends } from "./pages/Trends";
import { Profile } from "./pages/Profile";
import { Settings } from "./pages/Settings";
import { THEMES, applyTheme, getResolvedTheme, type ColorMode } from "./themes";
import {
  CoachingIcon, SessionsIcon, TrendsIcon, ProfileIcon, SettingsIcon,
} from "./components/NavIcons";

type Page = "dashboard" | "sessions" | "trends" | "profile" | "settings";

const NAV_ITEMS: { id: Page; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: "dashboard", label: "Coaching", Icon: CoachingIcon },
  { id: "sessions", label: "Sessions", Icon: SessionsIcon },
  { id: "trends", label: "Trends", Icon: TrendsIcon },
  { id: "profile", label: "Profile", Icon: ProfileIcon },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

export function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [themeId, setThemeId] = useState("slippi");
  const [colorMode, setColorMode] = useState<ColorMode>("dark");

  useEffect(() => {
    async function loadTheme() {
      try {
        const config = await window.clippi.loadConfig();
        const savedTheme = config?.theme || "slippi";
        const savedMode = config?.colorMode || "dark";
        setThemeId(savedTheme);
        setColorMode(savedMode);
        applyTheme(getResolvedTheme(savedTheme, savedMode));
      } catch {
        applyTheme(getResolvedTheme("slippi", "dark"));
      }
    }
    loadTheme();
  }, []);

  const handleThemeChange = useCallback((id: string) => {
    setThemeId(id);
    applyTheme(getResolvedTheme(id, colorMode));
    window.clippi.loadConfig().then((config: any) => {
      window.clippi.saveConfig({ ...config, theme: id });
    });
  }, [colorMode]);

  const handleModeChange = useCallback((mode: ColorMode) => {
    setColorMode(mode);
    applyTheme(getResolvedTheme(themeId, mode));
    window.clippi.loadConfig().then((config: any) => {
      window.clippi.saveConfig({ ...config, colorMode: mode });
    });
  }, [themeId]);

  const handleImport = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent)" fillOpacity="0.15"/>
                <path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6z" stroke="var(--accent)" strokeWidth="1.5" fill="none"/>
                <path d="M12 20l4-8 4 8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="16" cy="13" r="2" fill="var(--accent)"/>
              </svg>
            </div>
            <div>
              <div className="sidebar-brand-name">Coach-Clippi</div>
              <div className="sidebar-brand-sub">Melee Coach</div>
            </div>
          </div>
        </div>
        <div className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon"><item.Icon size={18} /></span>
              {item.label}
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="mode-toggle">
            <button
              className={`mode-btn ${colorMode === "light" ? "active" : ""}`}
              onClick={() => handleModeChange("light")}
            >
              Light
            </button>
            <button
              className={`mode-btn ${colorMode === "dark" ? "active" : ""}`}
              onClick={() => handleModeChange("dark")}
            >
              Dark
            </button>
          </div>
        </div>
      </nav>
      <main className="main-content">
        <div className={page === "dashboard" ? "" : "page-hidden"}>
          <Dashboard refreshKey={refreshKey} />
        </div>
        <div className={page === "sessions" ? "" : "page-hidden"}>
          <Sessions refreshKey={refreshKey} />
        </div>
        <div className={page === "trends" ? "" : "page-hidden"}>
          <Trends refreshKey={refreshKey} />
        </div>
        <div className={page === "profile" ? "" : "page-hidden"}>
          <Profile refreshKey={refreshKey} />
        </div>
        <div className={page === "settings" ? "" : "page-hidden"}>
          <Settings onImport={handleImport} themeId={themeId} onThemeChange={handleThemeChange} />
        </div>
      </main>
    </div>
  );
}
