import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useOverallRecord } from "../hooks/queries";

// ── Types ────────────────────────────────────────────────────────────

export interface Win98NavItem {
  id: string;
  label: string;
  path: string;
  Icon: React.FC<{ size?: number }>;
}

interface Win98ShellProps {
  navItems: Win98NavItem[];
  currentPath: string;
  onNavigate: (item: Win98NavItem, isActive: boolean) => void;
  onImport: () => void;
  onClearAll: () => void;
  onRefresh: () => void;
  children: ReactNode;
}

interface MenuItemDef {
  label: string;
  accessKey?: string; // underlined letter
  action?: () => void;
  separator?: boolean;
}

interface MenuDef {
  id: string;
  label: string;
  accessKey: string; // the Alt+key letter, lowercase
  items: MenuItemDef[];
}

// ── Component ────────────────────────────────────────────────────────

/**
 * Win98Shell — a faithful reconstruction of Windows 98 application chrome:
 * menu bar at top, Outlook-2000-style shortcut bar on the left, status
 * bar at bottom, and page content filling the remaining rectangle.
 *
 * Every surface uses the classic 4-shadow bevel recipe. Colors are
 * hardcoded to the Win98 palette — this shell only runs under
 * [data-theme="win98"], so there is no theme drift to worry about.
 */
export function Win98Shell({
  navItems,
  currentPath,
  onNavigate,
  onImport,
  onClearAll,
  onRefresh,
  children,
}: Win98ShellProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [targetPlayer, setTargetPlayer] = useState<string | null>(null);
  const [version, setVersion] = useState<string>("");
  const menuBarRef = useRef<HTMLDivElement | null>(null);

  const overallRecord = useOverallRecord();
  const totalGames = overallRecord.data?.totalGames ?? 0;

  // Load player tag + version once
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = await window.clippi.loadConfig();
        if (alive) setTargetPlayer(cfg?.targetPlayer ?? null);
      } catch {
        /* ignore */
      }
      try {
        // Read from package.json via import.meta — safe fallback if missing
        const meta = (import.meta as unknown as { env?: Record<string, string> }).env;
        if (alive && meta?.["VITE_APP_VERSION"]) {
          setVersion(meta["VITE_APP_VERSION"]!);
        } else if (alive) {
          setVersion("1.5.1");
        }
      } catch {
        if (alive) setVersion("1.5.1");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── Menu definitions ────────────────────────────────────────────
  const menus = useMemo<MenuDef[]>(
    () => [
      {
        id: "file",
        label: "File",
        accessKey: "f",
        items: [
          {
            label: "Import Replays...",
            accessKey: "i",
            action: () => {
              onImport();
              setOpenMenu(null);
            },
          },
          { label: "", separator: true },
          {
            label: "Quit",
            accessKey: "q",
            action: () => {
              setOpenMenu(null);
              window.close();
            },
          },
        ],
      },
      {
        id: "edit",
        label: "Edit",
        accessKey: "e",
        items: [
          {
            label: "Settings...",
            accessKey: "s",
            action: () => {
              const settingsItem = navItems.find((n) => n.id === "settings");
              if (settingsItem) onNavigate(settingsItem, currentPath === settingsItem.path);
              setOpenMenu(null);
            },
          },
        ],
      },
      {
        id: "view",
        label: "View",
        accessKey: "v",
        items: [
          {
            label: "Refresh",
            accessKey: "r",
            action: () => {
              onRefresh();
              setOpenMenu(null);
            },
          },
        ],
      },
      {
        id: "tools",
        label: "Tools",
        accessKey: "t",
        items: [
          {
            label: "Clear All Games...",
            accessKey: "c",
            action: () => {
              onClearAll();
              setOpenMenu(null);
            },
          },
        ],
      },
      {
        id: "help",
        label: "Help",
        accessKey: "h",
        items: [
          {
            label: "About MAGI",
            accessKey: "a",
            action: () => {
              setAboutOpen(true);
              setOpenMenu(null);
            },
          },
        ],
      },
    ],
    [navItems, currentPath, onNavigate, onImport, onClearAll, onRefresh],
  );

  // ── Menu keyboard handling ──────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Close any open menu on Escape
      if (e.key === "Escape" && openMenu !== null) {
        e.preventDefault();
        setOpenMenu(null);
        return;
      }
      // Alt+letter opens the matching menu
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
        const letter = e.key.toLowerCase();
        const menu = menus.find((m) => m.accessKey === letter);
        if (menu) {
          // Only intercept if we're not typing in a field
          const target = e.target as HTMLElement | null;
          if (target) {
            const tag = target.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            if (target.isContentEditable) return;
          }
          e.preventDefault();
          setOpenMenu((cur) => (cur === menu.id ? null : menu.id));
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menus, openMenu]);

  // Click outside closes open menu
  useEffect(() => {
    if (openMenu === null) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuBarRef.current && !menuBarRef.current.contains(target)) {
        setOpenMenu(null);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [openMenu]);

  // Helper: render a label with the access-key letter underlined.
  // e.g. label="File", accessKey="f" → F<u>ile</u> equivalent as "F".
  // The label is normal-case; accessKey letter matches the first
  // occurrence (case-insensitive) and is wrapped in a <u> tag.
  const renderAccessLabel = (label: string, accessKey?: string): ReactNode => {
    if (!accessKey) return label;
    const lower = label.toLowerCase();
    const idx = lower.indexOf(accessKey.toLowerCase());
    if (idx === -1) return label;
    return (
      <>
        {label.slice(0, idx)}
        <u>{label[idx]}</u>
        {label.slice(idx + 1)}
      </>
    );
  };

  // ── Menu bar click handling ─────────────────────────────────────
  const handleMenuClick = useCallback((menuId: string) => {
    setOpenMenu((cur) => (cur === menuId ? null : menuId));
  }, []);

  const handleMenuHover = useCallback(
    (menuId: string) => {
      // Once any menu is open, hovering another switches to it — classic Win98
      if (openMenu !== null && openMenu !== menuId) {
        setOpenMenu(menuId);
      }
    },
    [openMenu],
  );

  return (
    <div className="win98-shell">
      {/* ── Menu bar ───────────────────────────────────────────── */}
      <div className="win98-menubar" role="menubar" ref={menuBarRef}>
        {menus.map((menu) => (
          <div key={menu.id} className="win98-menubar__item-wrap">
            <button
              type="button"
              role="menuitem"
              className={`win98-menubar__item${openMenu === menu.id ? " win98-menubar__item--open" : ""}`}
              onClick={() => handleMenuClick(menu.id)}
              onMouseEnter={() => handleMenuHover(menu.id)}
              aria-haspopup="menu"
              aria-expanded={openMenu === menu.id}
            >
              {renderAccessLabel(menu.label, menu.accessKey)}
            </button>
            {openMenu === menu.id && (
              <div className="win98-menu" role="menu">
                {menu.items.map((item, i) => {
                  if (item.separator) {
                    return <div key={`sep-${i}`} className="win98-menu__separator" role="separator" />;
                  }
                  return (
                    <button
                      type="button"
                      role="menuitem"
                      key={item.label}
                      className="win98-menu__item"
                      onClick={item.action}
                    >
                      {renderAccessLabel(item.label, item.accessKey)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Body: shortcut bar + page content ─────────────────── */}
      <div className="win98-body">
        {/* Outlook 2000-style shortcut bar */}
        <aside className="win98-shortcuts" aria-label="Main navigation">
          <div className="win98-shortcuts__inner">
            {navItems.map((item, idx) => {
              const isActive =
                currentPath === item.path ||
                (currentPath === "/" && item.path === "/dashboard");
              return (
                <div key={item.id} className="win98-shortcuts__cell">
                  <button
                    type="button"
                    className={`win98-shortcut${isActive ? " win98-shortcut--active" : ""}`}
                    onClick={() => onNavigate(item, isActive)}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={item.label}
                  >
                    <span className="win98-shortcut__icon" aria-hidden="true">
                      <item.Icon size={32} />
                    </span>
                    <span className="win98-shortcut__label">{item.label}</span>
                  </button>
                  {idx < navItems.length - 1 && <div className="win98-shortcuts__sep" aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main page area — no transitions, Win98 didn't animate */}
        <main className="win98-page">{children}</main>
      </div>

      {/* ── Status bar ────────────────────────────────────────── */}
      <div className="win98-statusbar" role="status">
        <div className="win98-statusbar__cell win98-statusbar__cell--grow">
          {totalGames.toLocaleString()} games
        </div>
        <div className="win98-statusbar__cell">{targetPlayer || "\u2014"}</div>
        <div className="win98-statusbar__cell">Ready</div>
      </div>

      {/* ── About modal ───────────────────────────────────────── */}
      {aboutOpen && (
        <Win98AboutModal version={version} onClose={() => setAboutOpen(false)} />
      )}
    </div>
  );
}

// ── About modal ──────────────────────────────────────────────────────

interface Win98AboutModalProps {
  version: string;
  onClose: () => void;
}

function Win98AboutModal({ version, onClose }: Win98AboutModalProps) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openGithub = useCallback(() => {
    const url = "https://github.com/Bloodshed-Rain/TheMAGI";
    try {
      // Electron: prefer shell.openExternal via an injected opener if present
      window.open(url, "_blank", "noopener");
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="win98-modal-backdrop" onMouseDown={onClose}>
      <div
        className="win98-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="win98-about-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="win98-modal__titlebar">
          <span id="win98-about-title" className="win98-modal__title">
            About MAGI
          </span>
          <button
            type="button"
            className="win98-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            &#x2715;
          </button>
        </div>
        <div className="win98-modal__body">
          <div className="win98-about__row">
            <strong>MAGI</strong> &mdash; Melee Analysis through Generative Intelligence
          </div>
          <div className="win98-about__row">Version {version}</div>
          <div className="win98-about__row">
            <button
              type="button"
              className="win98-link-button"
              onClick={openGithub}
            >
              github.com/Bloodshed-Rain/TheMAGI
            </button>
          </div>
          <div className="win98-about__row win98-about__credits">
            Built on slippi-js. Coaching powered by LLM providers.
          </div>
          <div className="win98-modal__buttons">
            <button type="button" className="win98-modal__ok" onClick={onClose}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
