import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import magiLogo from "../assets/magi-controller.png";

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
  watcherActive: boolean;
  gamesCount: number;
  children: ReactNode;
}

export function LiquidShell({
  analyzeItems,
  systemItems,
  onNavigate,
  watcherActive,
  gamesCount,
  children,
}: LiquidShellProps) {
  const location = useLocation();

  const renderItem = (item: NavItem) => {
    const isActive = location.pathname === item.path || (location.pathname === "/" && item.path === "/dashboard");
    return (
      <button
        key={item.id}
        className={`nav-item${isActive ? " active" : ""}`}
        onClick={() => onNavigate(item, isActive)}
        aria-current={isActive ? "page" : undefined}
        aria-label={item.label}
      >
        <span className="nav-icon">
          <item.Icon size={18} />
        </span>
        <span className="nav-label">{item.label}</span>
        {item.badge !== undefined && <span className="nav-badge">{item.badge}</span>}
      </button>
    );
  };

  return (
    <div className="app-layout liquid-shell">
      <img className="magi-brand-logo" src={magiLogo} alt="MAGI" draggable={false} />
      <nav className="sidebar" aria-label="Main navigation">
        <div className="brand" aria-hidden="true" />

        <div className="nav-section-label">Analyze</div>
        {analyzeItems.map(renderItem)}

        <div className="nav-section-label">System</div>
        {systemItems.map(renderItem)}

        <div className="sidebar-footer">
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
