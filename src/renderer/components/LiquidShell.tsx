import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import magiLogo from "../assets/magi-controller.png";
import { LiquidCharacterBackdrop } from "./LiquidCharacterBackdrop";

export interface NavItem {
  id: string;
  label: string;
  path: string;
  Icon: React.FC<{ size?: number }>;
  badge?: number;
}

interface LiquidShellProps {
  analyzeItems: NavItem[];
  systemItems: NavItem[];
  onNavigate: (item: NavItem, isActive: boolean) => void;
  isLiquidTheme: boolean;
  watcherActive: boolean;
  gamesCount: number;
  children: ReactNode;
}

export function LiquidShell({
  analyzeItems,
  systemItems,
  onNavigate,
  isLiquidTheme,
  watcherActive,
  gamesCount,
  children,
}: LiquidShellProps) {
  const location = useLocation();

  // The Characters page already shows the full roster, so the drifting character
  // backdrop is redundant noise there.
  const showCharacterBackdrop = isLiquidTheme && !location.pathname.startsWith("/characters");

  const renderItem = (item: NavItem) => {
    const isActive = location.pathname === item.path || (location.pathname === "/" && item.path === "/dashboard");
    return (
      <motion.button
        key={item.id}
        className={`nav-item${item.id === "play" ? " nav-item-play" : ""}${isActive ? " active" : ""}`}
        onClick={() => onNavigate(item, isActive)}
        aria-current={isActive ? "page" : undefined}
        aria-label={item.label}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        style={{ position: "relative" }}
      >
        {isActive && (
          <motion.div
            layoutId="liquid-active-pill"
            initial={false}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            style={{
              position: "absolute",
              inset: 0,
              background: "var(--sidebar-active-bg)",
              boxShadow: "inset 0 0 12px -6px rgba(var(--accent-rgb), 0.15)",
              borderRadius: "inherit",
              zIndex: 0,
            }}
          />
        )}
        <span className="nav-icon" style={{ position: "relative", zIndex: 1 }}>
          <item.Icon size={18} />
        </span>
        <span className="nav-label" style={{ position: "relative", zIndex: 1 }}>
          {item.label}
        </span>
        {item.badge !== undefined && (
          <span className="nav-badge" style={{ position: "relative", zIndex: 1 }}>
            {item.badge}
          </span>
        )}
      </motion.button>
    );
  };

  const goHome = () => {
    const home = analyzeItems.find((i) => i.path === "/dashboard");
    if (home) {
      onNavigate(home, location.pathname === "/dashboard" || location.pathname === "/");
    }
  };

  return (
    <div className="app-layout liquid-shell">
      <LiquidCharacterBackdrop active={showCharacterBackdrop} />
      <button type="button" className="magi-brand-home" onClick={goHome} aria-label="Go to Dashboard">
        <motion.img
          className="magi-brand-logo"
          src={magiLogo}
          alt=""
          draggable={false}
          initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
        />
      </button>
      <nav className="sidebar" aria-label="Main navigation">
        <div className="brand" aria-hidden="true" />

        <div className="nav-play-feature">{systemItems.filter((item) => item.id === "play").map(renderItem)}</div>

        <div className="nav-section-label">Analyze</div>
        {analyzeItems.map(renderItem)}

        <div className="nav-section-label">System</div>
        {systemItems.filter((item) => item.id !== "play").map(renderItem)}

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-search-hint"
            onClick={() => window.dispatchEvent(new CustomEvent("magi:open-palette"))}
            aria-label="Open command palette"
          >
            <span className="sidebar-search-hint-label">Search</span>
            <kbd className="cmd-kbd">Ctrl K</kbd>
          </button>
          <div className="sidebar-footer-row">
            <span
              className="sidebar-status-dot"
              style={{ background: watcherActive ? "var(--win)" : "var(--text-muted)" }}
            />
            {watcherActive ? "Watcher active" : "Watcher idle"}
          </div>
          <div className="sidebar-footer-count">{gamesCount} games</div>
        </div>
      </nav>

      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            style={{ width: "100%", height: "100%" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
