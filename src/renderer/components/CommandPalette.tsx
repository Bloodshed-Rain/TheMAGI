import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ────────────────────────────────────────────────────────────

type Page = "dashboard" | "sessions" | "trends" | "profile" | "characters" | "settings";

interface CommandItem {
  id: string;
  label: string;
  category: "navigate" | "opponent" | "action";
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  navigateTo: (page: Page) => void;
  onToggleTheme: () => void;
  onImport: () => void;
}

// ── Icons (minimal tactical SVGs) ────────────────────────────────────

function NavIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

function ActionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// ── Fuzzy match scoring ──────────────────────────────────────────────

function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring match -- highest score
  if (t.includes(q)) {
    const idx = t.indexOf(q);
    // Boost for matches at start
    return { match: true, score: 100 - idx };
  }

  // Character-by-character fuzzy
  let qi = 0;
  let score = 0;
  let lastMatchIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Consecutive matches score higher
      score += lastMatchIdx === ti - 1 ? 8 : 3;
      // Word boundary bonus
      if (ti === 0 || t[ti - 1] === " " || t[ti - 1] === "-") {
        score += 5;
      }
      lastMatchIdx = ti;
      qi++;
    }
  }

  return { match: qi === q.length, score };
}

// ── Category labels ──────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  navigate: "NAVIGATE",
  action: "ACTIONS",
  opponent: "OPPONENTS",
};

// ── Component ────────────────────────────────────────────────────────

export function CommandPalette({ navigateTo, onToggleTheme, onImport }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [opponents, setOpponents] = useState<{ tag: string; code: string; games: number }[]>([]);
  const [opponentSearchPending, setOpponentSearchPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Open / close ─────────────────────────────────────────────────

  const open = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    setSelectedIndex(0);
    setOpponents([]);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  // ── Global keyboard shortcuts ────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+K toggles palette
      if (mod && e.key === "k") {
        e.preventDefault();
        if (isOpen) {
          close();
        } else {
          open();
        }
        return;
      }

      // Cmd/Ctrl+1-6 for page navigation (only when palette is NOT open,
      // to avoid conflict with typing)
      if (mod && !isOpen) {
        const pages: Page[] = ["dashboard", "sessions", "trends", "profile", "characters", "settings"];
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 6) {
          e.preventDefault();
          navigateTo(pages[num - 1]!);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, open, close, navigateTo]);

  // ── Focus input on open ──────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      // Slight delay to ensure the element is mounted
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // ── Search opponents with debounce ───────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length >= 2) {
      setOpponentSearchPending(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await window.clippi.getOpponents(query);
          setOpponents(results ?? []);
        } catch {
          setOpponents([]);
        }
        setOpponentSearchPending(false);
      }, 200);
    } else {
      setOpponents([]);
      setOpponentSearchPending(false);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen]);

  // ── Build command list ───────────────────────────────────────────

  const navCommands: CommandItem[] = useMemo(() => [
    { id: "nav-coaching", label: "Coaching", category: "navigate", shortcut: isMac() ? "\u2318 1" : "Ctrl+1", icon: <NavIcon />, action: () => { navigateTo("dashboard"); close(); } },
    { id: "nav-sessions", label: "Sessions", category: "navigate", shortcut: isMac() ? "\u2318 2" : "Ctrl+2", icon: <NavIcon />, action: () => { navigateTo("sessions"); close(); } },
    { id: "nav-trends", label: "Trends", category: "navigate", shortcut: isMac() ? "\u2318 3" : "Ctrl+3", icon: <NavIcon />, action: () => { navigateTo("trends"); close(); } },
    { id: "nav-profile", label: "Profile", category: "navigate", shortcut: isMac() ? "\u2318 4" : "Ctrl+4", icon: <NavIcon />, action: () => { navigateTo("profile"); close(); } },
    { id: "nav-characters", label: "Characters", category: "navigate", shortcut: isMac() ? "\u2318 5" : "Ctrl+5", icon: <NavIcon />, action: () => { navigateTo("characters"); close(); } },
    { id: "nav-settings", label: "Settings", category: "navigate", shortcut: isMac() ? "\u2318 6" : "Ctrl+6", icon: <NavIcon />, action: () => { navigateTo("settings"); close(); } },
  ], [navigateTo, close]);

  const actionCommands: CommandItem[] = useMemo(() => [
    { id: "action-import", label: "Import Replays", category: "action", icon: <ActionIcon />, action: () => { onImport(); close(); } },
    { id: "action-clear", label: "Clear All Data", category: "action", icon: <ActionIcon />, action: () => { if (confirm("This will delete all imported game data. Are you sure?")) { window.clippi.clearAllGames(); } close(); } },
    { id: "action-theme", label: "Toggle Theme", category: "action", icon: <ActionIcon />, action: () => { onToggleTheme(); close(); } },
  ], [onToggleTheme, onImport, close]);

  const opponentCommands: CommandItem[] = useMemo(() =>
    opponents.map((opp) => ({
      id: `opp-${opp.tag}-${opp.code}`,
      label: `${opp.tag}${opp.code ? ` (${opp.code})` : ""} — ${opp.games} game${opp.games === 1 ? "" : "s"}`,
      category: "opponent" as const,
      icon: <UserIcon />,
      action: () => {
        // Navigate to sessions to find this opponent
        navigateTo("sessions");
        close();
      },
    })),
  [opponents, navigateTo, close]);

  // ── Filter and sort by fuzzy score ───────────────────────────────

  const filteredItems = useMemo(() => {
    const all = [...navCommands, ...actionCommands, ...opponentCommands];

    if (!query.trim()) {
      // No query: show nav + actions, no opponents
      return [...navCommands, ...actionCommands];
    }

    const scored = all
      .map((item) => {
        const { match, score } = fuzzyMatch(query, item.label);
        // Also match against category
        const catMatch = fuzzyMatch(query, CATEGORY_LABELS[item.category] ?? "");
        return { item, match: match || catMatch.match, score: Math.max(score, catMatch.score) };
      })
      .filter((x) => x.match)
      .sort((a, b) => b.score - a.score);

    return scored.map((x) => x.item);
  }, [query, navCommands, actionCommands, opponentCommands]);

  // ── Group items by category for display ──────────────────────────

  const groupedItems = useMemo(() => {
    const groups: { category: string; items: CommandItem[] }[] = [];
    const seen = new Set<string>();

    for (const item of filteredItems) {
      if (!seen.has(item.category)) {
        seen.add(item.category);
        groups.push({ category: item.category, items: [] });
      }
      groups.find((g) => g.category === item.category)!.items.push(item);
    }

    return groups;
  }, [filteredItems]);

  // ── Reset selection when results change ──────────────────────────

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems.length, query]);

  // ── Keyboard navigation ──────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % Math.max(filteredItems.length, 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + filteredItems.length) % Math.max(filteredItems.length, 1));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const item = filteredItems[selectedIndex];
      if (item) item.action();
      return;
    }
  }, [filteredItems, selectedIndex, close]);

  // ── Scroll selected item into view ───────────────────────────────

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector("[data-selected='true']");
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // ── Compute flat index for selection highlighting ────────────────

  let flatIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="cmd-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <motion.div
            className="cmd-panel"
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            {/* ── Search input ─────────────────────────────── */}
            <div className="cmd-input-wrap">
              <div className="cmd-input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="16.5" y1="16.5" x2="21" y2="21" />
                </svg>
              </div>
              <input
                ref={inputRef}
                className="cmd-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or search..."
                spellCheck={false}
                autoComplete="off"
                aria-label="Search commands"
                aria-activedescendant={filteredItems[selectedIndex]?.id}
              />
              <kbd className="cmd-kbd">ESC</kbd>
            </div>

            {/* ── Results ──────────────────────────────────── */}
            <div className="cmd-results" ref={listRef} role="listbox">
              {groupedItems.length === 0 && (
                <div className="cmd-empty">
                  {opponentSearchPending ? (
                    <>
                      <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, marginRight: 8 }} />
                      SCANNING DATABASE...
                    </>
                  ) : (
                    "NO MATCHES FOUND"
                  )}
                </div>
              )}

              {groupedItems.map((group) => (
                <div key={group.category} className="cmd-group">
                  <div className="cmd-group-label">
                    <span className="cmd-group-dot" />
                    {CATEGORY_LABELS[group.category] ?? group.category.toUpperCase()}
                  </div>
                  {group.items.map((item) => {
                    const thisIndex = flatIndex++;
                    const isSelected = thisIndex === selectedIndex;

                    return (
                      <button
                        key={item.id}
                        id={item.id}
                        className={`cmd-item ${isSelected ? "cmd-item-selected" : ""}`}
                        data-selected={isSelected}
                        role="option"
                        aria-selected={isSelected}
                        onClick={item.action}
                        onMouseEnter={() => setSelectedIndex(thisIndex)}
                      >
                        <span className="cmd-item-icon">{item.icon}</span>
                        <span className="cmd-item-label">{item.label}</span>
                        {item.shortcut && (
                          <kbd className="cmd-item-shortcut">{item.shortcut}</kbd>
                        )}
                        {isSelected && (
                          <motion.div
                            className="cmd-item-highlight"
                            layoutId="cmd-highlight"
                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* ── Footer hint ─────────────────────────────── */}
            <div className="cmd-footer">
              <span><kbd className="cmd-kbd-sm">&uarr;</kbd><kbd className="cmd-kbd-sm">&darr;</kbd> navigate</span>
              <span><kbd className="cmd-kbd-sm">&crarr;</kbd> select</span>
              <span><kbd className="cmd-kbd-sm">esc</kbd> close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}
