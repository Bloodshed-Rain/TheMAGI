import { useState, useCallback, useEffect } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Sessions } from "./pages/Sessions";
import { Trends } from "./pages/Trends";
import { Profile } from "./pages/Profile";
import { Settings } from "./pages/Settings";
import { Characters } from "./pages/Characters";
import { THEMES, applyTheme, getResolvedTheme, type ColorMode } from "./themes";
import magiLogo from "./assets/magi-logo.png";
import {
  CoachingIcon, SessionsIcon, TrendsIcon, ProfileIcon, CharactersIcon, SettingsIcon,
} from "./components/NavIcons";

type Page = "dashboard" | "sessions" | "trends" | "profile" | "characters" | "settings";

const NAV_ITEMS: { id: Page; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: "dashboard", label: "Coaching", Icon: CoachingIcon },
  { id: "sessions", label: "Sessions", Icon: SessionsIcon },
  { id: "trends", label: "Trends", Icon: TrendsIcon },
  { id: "profile", label: "Profile", Icon: ProfileIcon },
  { id: "characters", label: "Characters", Icon: CharactersIcon },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

export function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [themeId, setThemeId] = useState("dark");
  const [colorMode, setColorMode] = useState<ColorMode>("dark");

  useEffect(() => {
    async function loadTheme() {
      try {
        const config = await window.clippi.loadConfig();
        const savedMode: ColorMode = config?.colorMode || "dark";
        setThemeId(savedMode);
        setColorMode(savedMode);
        applyTheme(getResolvedTheme(savedMode, savedMode));
      } catch {
        applyTheme(getResolvedTheme("dark", "dark"));
      }
    }
    loadTheme();
  }, []);

  const handleThemeChange = useCallback((_id: string) => {
    // No-op — theme is controlled by mode toggle only
  }, []);

  const handleModeChange = useCallback((mode: ColorMode) => {
    setColorMode(mode);
    setThemeId(mode);
    applyTheme(getResolvedTheme(mode, mode));
    window.clippi.loadConfig().then((config: any) => {
      window.clippi.saveConfig({ ...config, colorMode: mode });
    });
  }, []);

  const handleImport = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <img src={magiLogo} alt="MAGI" className="sidebar-logo-img" />
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
        <div className={page === "characters" ? "" : "page-hidden"}>
          <Characters refreshKey={refreshKey} />
        </div>
        <div className={page === "settings" ? "" : "page-hidden"}>
          <Settings onImport={handleImport} themeId={themeId} onThemeChange={handleThemeChange} />
        </div>
      </main>
    </div>
  );
}
