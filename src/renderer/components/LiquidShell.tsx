import { useRouteScroll } from "../hooks/useRouteScroll";
import { useDialog } from "../hooks/useDialog";
import { ReactNode, useEffect, useMemo, useState, useRef } from "react";
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
  isWindows2000Theme: boolean;
  watcherActive: boolean;
  gamesCount: number;
  children: ReactNode;
}

export function LiquidShell({
  analyzeItems,
  systemItems,
  onNavigate,
  isLiquidTheme,
  isWindows2000Theme,
  watcherActive,
  gamesCount,
  children,
}: LiquidShellProps) {
  const location = useLocation();
  const contentRef = useRouteScroll(location.pathname + location.search);
  const [windowsMinimized, setWindowsMinimized] = useState(false);
  const [windowsMaximized, setWindowsMaximized] = useState(false);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const startRef = useRef<HTMLDivElement>(null);
  useDialog(startRef, startMenuOpen, () => setStartMenuOpen(false), undefined, false);
  useEffect(() => { setWindowsMinimized(false); setStartMenuOpen(false); }, [location.pathname, location.search]);
  useEffect(() => { const restore = () => setWindowsMinimized(false); window.addEventListener("magi:restore", restore); return () => window.removeEventListener("magi:restore", restore); }, []);
  useEffect(() => { if (!startMenuOpen) return; const dismiss = (e: PointerEvent) => { if (!startRef.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest(".windows-start-button")) setStartMenuOpen(false); }; document.addEventListener("pointerdown", dismiss); return () => document.removeEventListener("pointerdown", dismiss); }, [startMenuOpen]);
  const [clock, setClock] = useState(() => new Date());
  const allItems = useMemo(() => [...analyzeItems, ...systemItems], [analyzeItems, systemItems]);
  const activeItem = allItems.find(
    (item) => location.pathname === item.path || (location.pathname === "/" && item.path === "/dashboard"),
  );

  useEffect(() => {
    if (!isWindows2000Theme) return;
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [isWindows2000Theme]);

  // The Characters page already shows the full roster, so the drifting character
  // backdrop is redundant noise there.
  const showCharacterBackdrop = isLiquidTheme && !location.pathname.startsWith("/characters");

  const renderItem = (item: NavItem) => {
    const isActive = location.pathname === item.path || (location.pathname === "/" && item.path === "/dashboard");

    const handleClick = () => {
      if (isWindows2000Theme) {
        setStartMenuOpen(false);
        if (isActive) {
          setWindowsMinimized((minimized) => !minimized);
          return;
        }
        setWindowsMinimized(false);
      }
      onNavigate(item, isActive);
    };

    return (
      <motion.button
        key={item.id}
        className={`nav-item${isWindows2000Theme ? " windows-task-button" : ""}${isActive ? " active" : ""}${
          isActive && windowsMinimized ? " is-minimized" : ""
        }`}
        onClick={handleClick}
        aria-current={isActive ? "page" : undefined}
        aria-pressed={isWindows2000Theme ? isActive && !windowsMinimized : undefined}
        aria-label={item.label}
        whileHover={isWindows2000Theme ? {} : { scale: 1.02 }}
        whileTap={isWindows2000Theme ? {} : { scale: 0.98 }}
        style={{ position: "relative" }}
      >
        {isActive && !isWindows2000Theme && (
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
      const isActive = location.pathname === "/dashboard" || location.pathname === "/";
      if (isWindows2000Theme) {
        setStartMenuOpen(false);
        setWindowsMinimized(false);
        if (!isActive) onNavigate(home, false);
        return;
      }
      onNavigate(home, isActive);
    }
  };

  if (isWindows2000Theme) {
    const windowTitle = activeItem?.label ?? "MAGI";
    const formattedTime = clock.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    return (
      <div className="app-layout liquid-shell windows2000-shell">
        <button type="button" className="windows-desktop-shortcut" onDoubleClick={goHome} onClick={goHome}>
          <img src={magiLogo} alt="" draggable={false} />
          <span>MAGI</span>
        </button>

        <AnimatePresence>
          {(
            <motion.main
              hidden={windowsMinimized}
              inert={windowsMinimized}
              className={`main-content windows-app-window${windowsMaximized ? " is-maximized" : ""}`}
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 18 }}
              transition={{ duration: 0.1 }}
            >
              <div className="windows-titlebar" onDoubleClick={() => setWindowsMaximized((maximized) => !maximized)}>
                <div className="windows-titlebar-copy">
                  <img src={magiLogo} alt="" draggable={false} />
                  <span>{windowTitle} - MAGI</span>
                </div>
                <div className="windows-caption-buttons">
                  <button type="button" onClick={() => { setWindowsMinimized(true); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".windows-task-button.active")?.focus()); }} aria-label="Minimize window">
                    <span aria-hidden="true">_</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWindowsMaximized((maximized) => !maximized)}
                    aria-label={windowsMaximized ? "Restore window" : "Maximize window"}
                  >
                    <span aria-hidden="true">□</span>
                  </button>
                </div>
              </div>

              <div ref={contentRef} className="windows-window-content">
                <AnimatePresence mode="wait">
                  <motion.div
                    
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.06 }}
                    style={{ width: "100%", minHeight: "100%" }}
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="windows-statusbar">
                <span>{windowTitle}</span>
                <span>{watcherActive ? "Watcher active" : "Watcher idle"}</span>
                <span>{gamesCount} games</span>
              </div>
            </motion.main>
          )}
        </AnimatePresence>

        {startMenuOpen && (
          <div ref={startRef} className="windows-start-menu" role="dialog" aria-label="Start menu">
            <div className="windows-start-rail" aria-hidden="true">
              <strong>Windows</strong> 2000
            </div>
            <div className="windows-start-items">
              {allItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  
                  onClick={() => {
                    const isActive = location.pathname === item.path;
                    setStartMenuOpen(false);
                    setWindowsMinimized(false);
                    if (!isActive) onNavigate(item, false);
                  }}
                >
                  <item.Icon size={22} />
                  <span>{item.label}</span>
                </button>
              ))}
              <div className="windows-start-separator" />
              <button
                type="button"
                
                onClick={() => {
                  setStartMenuOpen(false);
                  window.dispatchEvent(new CustomEvent("magi:open-palette"));
                }}
              >
                <span className="windows-start-search-icon">⌕</span>
                <span>Find...</span>
              </button>
            </div>
          </div>
        )}

        <nav className="windows-taskbar" aria-label="Open MAGI windows">
          <button
            type="button"
            className={`windows-start-button${startMenuOpen ? " active" : ""}`}
            aria-expanded={startMenuOpen}
            onClick={() => setStartMenuOpen((open) => !open)}
          >
            <span className="windows-flag" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <strong>Start</strong>
          </button>
          <div className="windows-taskbar-divider" />
          <div className="windows-task-list">{allItems.map(renderItem)}</div>
          <div className="windows-system-tray">
            <span className={`windows-tray-status${watcherActive ? " is-active" : ""}`} aria-hidden="true" />
            <span>{formattedTime}</span>
          </div>
        </nav>
      </div>
    );
  }

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

        {[{label:"Overview",ids:["dashboard"]},{label:"Review",ids:["library","sessions","characters","rivals"]},{label:"Improve",ids:["performance","trends","practice"]},{label:"Coaching",ids:["cornerman","oracle"]}].map(group => <div key={group.label}><div className="nav-section-label">{group.label}</div>{analyzeItems.filter(item => group.ids.includes(item.id)).map(renderItem)}</div>)}

        <div className="nav-section-label">System</div>
        {systemItems.map(renderItem)}

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

      <main ref={contentRef} className="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            
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
