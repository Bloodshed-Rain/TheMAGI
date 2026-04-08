import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import magiLogo from "../assets/magi-controller.png";
import { useGlobalStore } from "../stores/useGlobalStore";
import { ColorMode, THEMES, applyTheme } from "../themes";

/* ═══════════════════════════════════════════════════════════════════
   ONBOARDING — Setup wizard
   A clean multi-step wizard guiding the user through initial config.
   Left rail: step indicator. Right panel: active step content.
   ═══════════════════════════════════════════════════════════════════ */

interface OnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

type Step = 0 | 1 | 2 | 3 | 4;

const STEP_LABELS: string[] = [
  "Welcome",
  "Player",
  "Replays",
  "Import",
  "Theme",
];

const STEP_DESCRIPTIONS: string[] = [
  "Get started",
  "Your identity",
  "Replay folder",
  "Import games",
  "Personalize",
];

const CHARACTERS = [
  { id: "char-drmario", name: "Dr. Mario" },
  { id: "char-mario", name: "Mario" },
  { id: "char-luigi", name: "Luigi" },
  { id: "char-bowser", name: "Bowser" },
  { id: "char-peach", name: "Peach" },
  { id: "char-yoshi", name: "Yoshi" },
  { id: "char-dk", name: "Donkey Kong" },
  { id: "char-falcon", name: "Captain Falcon" },
  { id: "char-ganon", name: "Ganondorf" },
  { id: "char-falco", name: "Falco" },
  { id: "char-fox", name: "Fox" },
  { id: "char-ness", name: "Ness" },
  { id: "char-ics", name: "Ice Climbers" },
  { id: "char-kirby", name: "Kirby" },
  { id: "char-samus", name: "Samus" },
  { id: "char-zelda", name: "Zelda" },
  { id: "char-sheik", name: "Sheik" },
  { id: "char-link", name: "Link" },
  { id: "char-ylink", name: "Young Link" },
  { id: "char-pichu", name: "Pichu" },
  { id: "char-pikachu", name: "Pikachu" },
  { id: "char-puff", name: "Jigglypuff" },
  { id: "char-mewtwo", name: "Mewtwo" },
  { id: "char-gnw", name: "Mr. G&W" },
  { id: "char-marth", name: "Marth" },
  { id: "char-roy", name: "Roy" },
];

// ── Shared animation config ──────────────────────────────────────

const stepVariants = {
  initial: { opacity: 0, y: 20, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -12, scale: 0.99 },
};

const stepTransition = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1] as number[],
};

// ── Inline styles ────────────────────────────────────────────────

const styles = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg)",
    transition: "background 0.5s ease",
  },

  backdrop: {
    position: "absolute" as const,
    inset: 0,
    background:
      "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(var(--accent-rgb), 0.04) 0%, transparent 70%)",
    pointerEvents: "none" as const,
  },

  container: {
    position: "relative" as const,
    display: "flex",
    gap: 0,
    width: "min(820px, 90vw)",
    minHeight: 480,
    maxHeight: "85vh",
    background: "var(--bg-glass-strong)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden" as const,
    transition: "all 0.5s ease",
  },

  rail: {
    width: 200,
    flexShrink: 0,
    background: "var(--bg-card)",
    borderRight: "1px solid var(--border)",
    padding: "32px 0",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between",
    transition: "all 0.5s ease",
  },

  railHeader: {
    padding: "0 20px 24px",
    borderBottom: "1px solid var(--border-subtle)",
    marginBottom: 24,
  },

  railLogo: {
    width: 48,
    height: "auto",
    maxHeight: 36,
    marginBottom: 10,
    opacity: 0.9,
  },

  railTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--accent)",
  },

  railSubtitle: {
    fontSize: 11,
    color: "var(--text-dim)",
    marginTop: 4,
  },

  stepList: {
    listStyle: "none",
    padding: "0 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },

  stepItem: (active: boolean, done: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 8px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    color: active
      ? "var(--accent)"
      : done
        ? "var(--text)"
        : "var(--text-dim)",
    background: active ? "rgba(var(--accent-rgb), 0.06)" : "transparent",
    borderLeft: active
      ? "2px solid var(--accent)"
      : done
        ? "2px solid rgba(var(--accent-rgb), 0.2)"
        : "2px solid transparent",
    transition: "all 0.3s var(--ease-spring)",
  }),

  stepIndicator: (active: boolean, done: boolean) => ({
    width: 20,
    height: 20,
    borderRadius: 10,
    border: `1.5px solid ${active ? "var(--accent)" : done ? "rgba(var(--accent-rgb), 0.3)" : "var(--border)"}`,
    background: done
      ? "rgba(var(--accent-rgb), 0.15)"
      : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 9,
    fontWeight: 600,
    color: active ? "var(--accent)" : done ? "var(--accent)" : "var(--text-dim)",
    transition: "all 0.3s var(--ease-spring)",
  }),

  railSkip: {
    padding: "0 20px",
  },

  skipBtn: {
    background: "none",
    border: "none",
    color: "var(--text-dim)",
    fontSize: 12,
    cursor: "pointer",
    padding: "6px 0",
    transition: "color 0.2s",
  },

  panel: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    padding: "40px 48px",
    position: "relative" as const,
    overflow: "hidden" as const,
  },

  panelContent: {
    position: "relative" as const,
    zIndex: 1,
  },

  stepTag: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-dim)",
    marginBottom: 12,
  },

  heading: {
    fontSize: 22,
    fontWeight: 700,
    color: "var(--text)",
    lineHeight: 1.3,
    marginBottom: 12,
  },

  description: {
    fontSize: 13,
    lineHeight: 1.7,
    color: "var(--text-dim)",
    maxWidth: 440,
    marginBottom: 32,
  },

  fieldGroup: {
    marginBottom: 20,
  },

  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-dim)",
    marginBottom: 8,
  },

  input: {
    width: "100%",
    maxWidth: 360,
    padding: "11px 16px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },

  inputHint: {
    fontSize: 11,
    color: "var(--text-dim)",
    marginTop: 6,
  },

  folderDisplay: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    maxWidth: 420,
  },

  folderPath: {
    flex: 1,
    padding: "11px 16px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
    minWidth: 0,
  },

  actions: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginTop: 8,
  },

  importStatus: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
    maxWidth: 420,
  },

  progressContainer: {
    width: "100%",
    height: 4,
    background: "var(--bg-card)",
    borderRadius: 2,
    overflow: "hidden" as const,
    position: "relative" as const,
  },

  progressBar: {
    height: "100%",
    background: "var(--accent)",
    borderRadius: 2,
    transition: "width 0.4s var(--ease-spring)",
  },

  statusText: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-dim)",
  },

  resultText: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--accent)",
  },

  errorText: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--red)",
  },

  heroGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
    marginBottom: 32,
    maxWidth: 420,
  },

  heroStat: {
    padding: "14px 12px",
    background: "rgba(var(--accent-rgb), 0.04)",
    border: "1px solid rgba(var(--accent-rgb), 0.08)",
    borderRadius: 6,
    textAlign: "center" as const,
  },

  heroStatLabel: {
    fontSize: 10,
    fontWeight: 500,
    color: "var(--text-dim)",
    marginBottom: 4,
  },

  heroStatValue: {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent)",
  },

  // Theme selection
  charGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
    gap: 10,
    maxWidth: "100%",
    maxHeight: 280,
    overflowY: "auto" as const,
    padding: "4px",
    marginBottom: 24,
    paddingRight: 8,
  },

  charCard: (selected: boolean) => ({
    position: "relative" as const,
    aspectRatio: "1/1",
    borderRadius: 8,
    overflow: "hidden" as const,
    cursor: "pointer",
    border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
    transition: "all 0.3s var(--ease-spring)",
    background: "var(--bg-card)",
  }),

  charPlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    fontWeight: 700,
    color: "var(--text-dim)",
    background: "var(--surface-2)",
    fontFamily: "var(--font-display)",
  },

  charOverlay: (selected: boolean) => ({
    position: "absolute" as const,
    inset: 0,
    background: selected 
      ? "rgba(var(--accent-rgb), 0.2)" 
      : "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)",
    display: "flex",
    alignItems: "flex-end",
    padding: 8,
    transition: "all 0.3s ease",
  }),

  charName: {
    fontSize: 11,
    fontWeight: 600,
    color: "#fff",
    textShadow: "0 1px 2px rgba(0,0,0,0.5)",
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────

function Check() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2 5 4.5 7.5 8 3" />
    </svg>
  );
}

function CharacterImage({ char }: { char: typeof CHARACTERS[0] }) {
  return <div style={styles.charPlaceholder}>{char.name.charAt(0)}</div>;
}

// ── Component ────────────────────────────────────────────────────

export function Onboarding({ onComplete, onSkip }: OnboardingProps) {
  const [step, setStep] = useState<Step>(0);
  const [tag, setTag] = useState("");
  const [connectCode, setConnectCode] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; importedSoFar: number; skippedSoFar: number; errorsSoFar: number } | null>(null);
  const [selectedChar, setSelectedChar] = useState<string | null>(null);

  const { setColorMode } = useGlobalStore();

  useEffect(() => {
    async function load() {
      try {
        const config = await window.clippi.loadConfig();
        if (config?.targetPlayer) setTag(config.targetPlayer);
        if (config?.connectCode) setConnectCode(config.connectCode);
        if (config?.replayFolder) setFolder(config.replayFolder);
      } catch {
        // ignore
      }
    }
    load();
  }, []);

  const advance = useCallback(() => {
    setStep((s) => Math.min(s + 1, 4) as Step);
  }, []);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0) as Step);
  }, []);

  const savePlayerAndAdvance = useCallback(async () => {
    try {
      const config = await window.clippi.loadConfig().catch(() => ({}));
      await window.clippi.saveConfig({
        ...config,
        targetPlayer: tag || null,
        connectCode: connectCode || null,
      });
    } catch {
      // ignore
    }
    advance();
  }, [tag, connectCode, advance]);

  const handleBrowse = useCallback(async () => {
    const selected = await window.clippi.openFolder();
    if (selected) setFolder(selected);
  }, []);

  const saveFolderAndAdvance = useCallback(async () => {
    if (!folder) return;
    try {
      const config = await window.clippi.loadConfig().catch(() => ({}));
      await window.clippi.saveConfig({
        ...config,
        replayFolder: folder,
      });
    } catch {
      // ignore
    }
    advance();
  }, [folder, advance]);

  const runImport = useCallback(async () => {
    if (!folder) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const identifier = connectCode || tag || "";
      const result = await window.clippi.importFolder(folder, identifier) as any;
      const parts: string[] = [`Imported ${result.imported} games`];
      if (result.skipped > 0) parts.push(`skipped ${result.skipped} duplicates`);
      if (result.errors > 0) parts.push(`${result.errors} files failed to parse`);
      parts.push(`${result.total} total files scanned`);
      setImportResult(parts.join(", ") + ".");
      setImportDone(true);
    } catch (err: any) {
      setImportError(err.message || String(err));
    }
    setImporting(false);
  }, [folder, connectCode, tag]);

  const handleCharSelect = useCallback((charId: string) => {
    setSelectedChar(charId);
    setColorMode(charId as ColorMode);
    const theme = THEMES[charId];
    if (theme) applyTheme(theme);
  }, [setColorMode]);

  const handleFinish = useCallback(async () => {
    if (selectedChar) {
      try {
        const config = await window.clippi.loadConfig().catch(() => ({}));
        await window.clippi.saveConfig({
          ...config,
          colorMode: selectedChar,
        });
      } catch {
        // ignore
      }
    }
    onComplete();
  }, [selectedChar, onComplete]);

  useEffect(() => {
    if (step === 3 && folder && !importing && !importDone && !importError) {
      runImport();
    }
  }, [step, folder, importing, importDone, importError, runImport]);

  // Subscribe to import progress events while importing
  useEffect(() => {
    if (!importing) return;
    const cleanup = window.clippi.onImportProgress((progress) => {
      setImportProgress({ current: progress.current, total: progress.total, importedSoFar: progress.importedSoFar, skippedSoFar: progress.skippedSoFar, errorsSoFar: progress.errorsSoFar });
    });
    return cleanup;
  }, [importing]);

  return (
    <div style={styles.overlay} role="dialog" aria-label="MAGI Setup Wizard" aria-modal="true">
      <div style={styles.backdrop} aria-hidden="true" />

      <motion.div
        style={styles.container}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div style={styles.rail}>
          <div>
            <div style={styles.railHeader}>
              <img src={magiLogo} alt="" style={styles.railLogo} />
              <div style={styles.railTitle}>MAGI</div>
              <div style={styles.railSubtitle}>Setup</div>
            </div>

            <ul style={styles.stepList}>
              {STEP_LABELS.map((label, i) => {
                const done = i < step;
                const active = i === step;
                return (
                  <motion.li
                    key={label}
                    style={styles.stepItem(active, done)}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.06, duration: 0.4 }}
                  >
                    <div style={styles.stepIndicator(active, done)}>
                      {done ? <Check /> : <span>{i + 1}</span>}
                    </div>
                    <div>
                      <div>{label}</div>
                      <div style={{ fontSize: 10, fontWeight: 400, color: "var(--text-dim)", marginTop: 1 }}>
                        {STEP_DESCRIPTIONS[i]}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </div>

          <div style={styles.railSkip}>
            <button style={styles.skipBtn} onClick={onSkip} type="button">
              Skip setup
            </button>
          </div>
        </div>

        <div style={styles.panel}>
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="step-0" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={stepTransition} style={styles.panelContent}>
                <div style={styles.stepTag}>Step 1 of 5</div>
                <h2 style={styles.heading}>Welcome to MAGI</h2>
                <p style={styles.description}>
                  MAGI is your AI-powered coaching system for Super Smash Bros. Melee.
                  Import your Slippi replays, and MAGI will analyze your gameplay,
                  track your habits, and deliver coaching feedback.
                </p>
                <div style={styles.heroGrid}>
                  <div style={styles.heroStat}><div style={styles.heroStatLabel}>Analyze</div><div style={styles.heroStatValue}>Replays</div></div>
                  <div style={styles.heroStat}><div style={styles.heroStatLabel}>Track</div><div style={styles.heroStatValue}>Habits</div></div>
                  <div style={styles.heroStat}><div style={styles.heroStatLabel}>Receive</div><div style={styles.heroStatValue}>Coaching</div></div>
                </div>
                <div style={styles.actions}>
                  <button className="btn btn-primary" onClick={advance} type="button">Begin Setup</button>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="step-1" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={stepTransition} style={styles.panelContent}>
                <div style={styles.stepTag}>Step 2 of 5</div>
                <h2 style={styles.heading}>Player Info</h2>
                <p style={styles.description}>
                  Enter your Slippi tag or connect code so MAGI can identify you in replays.
                </p>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Display Name / Tag</label>
                  <input style={styles.input} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="YourTag" autoFocus />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Connect Code</label>
                  <input style={styles.input} value={connectCode} onChange={(e) => setConnectCode(e.target.value)} placeholder="TAG#123" />
                </div>
                <div style={styles.actions}>
                  <button className="btn" onClick={goBack} type="button">Back</button>
                  <button className="btn btn-primary" onClick={savePlayerAndAdvance} disabled={!tag && !connectCode} type="button">Continue</button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step-2" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={stepTransition} style={styles.panelContent}>
                <div style={styles.stepTag}>Step 3 of 5</div>
                <h2 style={styles.heading}>Replay Folder</h2>
                <p style={styles.description}>Point MAGI to your Slippi replay folder.</p>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Replay Folder</label>
                  <div style={styles.folderDisplay}>
                    <div style={styles.folderPath}>{folder || "No folder selected"}</div>
                    <button className="btn" onClick={handleBrowse} type="button">Browse</button>
                  </div>
                </div>
                <div style={styles.actions}>
                  <button className="btn" onClick={goBack} type="button">Back</button>
                  <button className="btn btn-primary" onClick={saveFolderAndAdvance} disabled={!folder} type="button">Import Replays</button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step-3" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={stepTransition} style={styles.panelContent}>
                <div style={styles.stepTag}>Step 4 of 5</div>
                <h2 style={styles.heading}>{importDone ? "Import Complete" : "Importing..."}</h2>
                <div style={styles.importStatus}>
                  {importing && (
                    <>
                      <div className="spinner" />
                      {importProgress && importProgress.total > 0 && (
                        <div style={{ marginTop: 12, textAlign: "center" as const }}>
                          <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 8 }}>
                            {importProgress.current} / {importProgress.total} files processed
                          </div>
                          <div style={{ width: "100%", height: 6, borderRadius: 3, background: "var(--bg-hover)", overflow: "hidden" }}>
                            <div style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%`, height: "100%", borderRadius: 3, background: "var(--accent)", transition: "width 0.3s ease" }} />
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
                            {importProgress.importedSoFar} imported · {importProgress.skippedSoFar} skipped · {importProgress.errorsSoFar} errors
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {importResult && <p style={styles.resultText}>{importResult}</p>}
                  {importError && <p style={styles.errorText}>Error: {importError}</p>}
                  <div style={styles.actions}>
                    {!importing && !importDone && <button className="btn" onClick={goBack} type="button">Back</button>}
                    {importDone && <button className="btn btn-primary" onClick={advance} type="button">Next: Personalize</button>}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="step-4" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={stepTransition} style={styles.panelContent}>
                <div style={styles.stepTag}>Step 5 of 5</div>
                <h2 style={styles.heading}>Pick Your Main</h2>
                <p style={styles.description}>Select your character to apply a matching theme.</p>
                <div style={styles.charGrid} className="custom-scrollbar">
                  {CHARACTERS.map((char) => (
                    <div key={char.id} style={styles.charCard(selectedChar === char.id)} onClick={() => handleCharSelect(char.id)}>
                      <CharacterImage char={char} />
                      <div style={styles.charOverlay(selectedChar === char.id)}>
                        <div style={styles.charName}>{char.name}</div>
                      </div>
                      {selectedChar === char.id && (
                        <div style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                          <Check />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={styles.actions}>
                  <button className="btn" onClick={goBack} type="button">Back</button>
                  <button className="btn btn-primary" onClick={handleFinish} type="button">Finish Setup</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
