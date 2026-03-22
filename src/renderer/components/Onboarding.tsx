import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGlitchText } from "../hooks";
import magiLogo from "../assets/magi-logo.png";

/* ═══════════════════════════════════════════════════════════════════
   ONBOARDING — System initialization sequence
   A multi-step wizard styled as a subsystem boot process.
   Left rail: diagnostic log showing boot progress.
   Right panel: active step content.
   ═══════════════════════════════════════════════════════════════════ */

interface OnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

type Step = 0 | 1 | 2 | 3;

const STEP_LABELS: string[] = [
  "SYS.INIT",
  "PILOT.ID",
  "DATA.LINK",
  "IMPORT.SEQ",
];

const STEP_DESCRIPTIONS: string[] = [
  "System initialization",
  "Pilot identification",
  "Data source link",
  "Import sequence",
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
// Kept inline to avoid polluting the global stylesheet with
// one-time-use wizard styles. Uses CSS custom properties from :root.

const styles = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg)",
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
    minHeight: 460,
    maxHeight: "85vh",
    background: "var(--bg-glass-strong)",
    border: "1px solid var(--border)",
    clipPath: "var(--clip-corner)",
    overflow: "hidden" as const,
  },

  // Left diagnostic rail
  rail: {
    width: 200,
    flexShrink: 0,
    background: "var(--bg-card)",
    borderRight: "1px solid var(--border)",
    padding: "32px 0",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between",
  },

  railHeader: {
    padding: "0 20px 24px",
    borderBottom: "1px solid var(--border-subtle)",
    marginBottom: 24,
  },

  railLogo: {
    width: 36,
    height: 36,
    marginBottom: 10,
    opacity: 0.9,
  },

  railTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.15em",
    color: "var(--accent)",
    textTransform: "uppercase" as const,
  },

  railSubtitle: {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    color: "var(--text-dim)",
    letterSpacing: "0.08em",
    marginTop: 4,
    textTransform: "uppercase" as const,
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
    borderRadius: 2,
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: active ? 600 : 400,
    letterSpacing: "0.06em",
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
    textTransform: "uppercase" as const,
  }),

  stepIndicator: (active: boolean, done: boolean) => ({
    width: 16,
    height: 16,
    borderRadius: 2,
    border: `1px solid ${active ? "var(--accent)" : done ? "rgba(var(--accent-rgb), 0.3)" : "var(--border)"}`,
    background: done
      ? "rgba(var(--accent-rgb), 0.15)"
      : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 8,
    color: "var(--accent)",
    clipPath: "var(--clip-corner-sm)",
    transition: "all 0.3s var(--ease-spring)",
  }),

  railSkip: {
    padding: "0 20px",
  },

  skipBtn: {
    background: "none",
    border: "none",
    color: "var(--text-dim)",
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    padding: "6px 0",
    transition: "color 0.2s",
  },

  // Right content panel
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
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.12em",
    color: "var(--text-dim)",
    textTransform: "uppercase" as const,
    marginBottom: 12,
  },

  heading: {
    fontFamily: "var(--font-display)",
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text)",
    lineHeight: 1.3,
    marginBottom: 12,
  },

  description: {
    fontFamily: "var(--font-sans)",
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
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.1em",
    color: "var(--text-label)",
    textTransform: "uppercase" as const,
    marginBottom: 8,
  },

  input: {
    width: "100%",
    maxWidth: 360,
    padding: "11px 16px",
    borderRadius: 2,
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    clipPath: "var(--clip-corner-sm)",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },

  inputHint: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-dim)",
    marginTop: 6,
    letterSpacing: "0.02em",
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
    borderRadius: 2,
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    clipPath: "var(--clip-corner-sm)",
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

  // Import step
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
    background: "linear-gradient(90deg, var(--accent), var(--secondary))",
    borderRadius: 2,
    transition: "width 0.4s var(--ease-spring)",
    boxShadow: "0 0 12px rgba(var(--accent-rgb), 0.4)",
  },

  statusText: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-dim)",
    letterSpacing: "0.04em",
  },

  resultText: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--accent)",
    letterSpacing: "0.02em",
  },

  errorText: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--red)",
    letterSpacing: "0.02em",
  },

  // Welcome step hero
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
    clipPath: "var(--clip-corner-sm)",
    textAlign: "center" as const,
  },

  heroStatLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 600,
    letterSpacing: "0.1em",
    color: "var(--text-dim)",
    textTransform: "uppercase" as const,
    marginBottom: 4,
  },

  heroStatValue: {
    fontFamily: "var(--font-display)",
    fontSize: 13,
    fontWeight: 700,
    color: "var(--accent)",
    letterSpacing: "0.04em",
  },
} as const;

// ── Checkmark SVG ────────────────────────────────────────────────

function Check() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1.5 4 3.5 6 6.5 2" />
    </svg>
  );
}

// ── Folder icon ──────────────────────────────────────────────────

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
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

  const title = useGlitchText("SYSTEM INITIALIZATION", 700);

  // Preload existing config in case user has partial setup
  useEffect(() => {
    async function load() {
      try {
        const config = await window.clippi.loadConfig();
        if (config?.targetPlayer) setTag(config.targetPlayer);
        if (config?.connectCode) setConnectCode(config.connectCode);
        if (config?.replayFolder) setFolder(config.replayFolder);
      } catch {
        // No config yet -- expected for first run
      }
    }
    load();
  }, []);

  const advance = useCallback(() => {
    setStep((s) => Math.min(s + 1, 3) as Step);
  }, []);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0) as Step);
  }, []);

  // Save player info and advance
  const savePlayerAndAdvance = useCallback(async () => {
    try {
      const config = await window.clippi.loadConfig().catch(() => ({})) as Record<string, unknown>;
      await window.clippi.saveConfig({
        ...config,
        targetPlayer: tag || null,
        connectCode: connectCode || null,
      });
    } catch {
      // Non-critical -- continue anyway
    }
    advance();
  }, [tag, connectCode, advance]);

  // Browse for folder
  const handleBrowse = useCallback(async () => {
    const selected = await window.clippi.openFolder();
    if (selected) setFolder(selected);
  }, []);

  // Save folder and advance to import
  const saveFolderAndAdvance = useCallback(async () => {
    if (!folder) return;
    try {
      const config = await window.clippi.loadConfig().catch(() => ({})) as Record<string, unknown>;
      await window.clippi.saveConfig({
        ...config,
        replayFolder: folder,
      });
    } catch {
      // Non-critical
    }
    advance();
  }, [folder, advance]);

  // Run import
  const runImport = useCallback(async () => {
    if (!folder) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const identifier = connectCode || tag || "";
      const result = await window.clippi.importFolder(folder, identifier) as {
        imported: number;
        skipped: number;
        total: number;
      };
      setImportResult(
        `Imported ${result.imported} games, skipped ${result.skipped} duplicates (${result.total} total files scanned).`
      );
      setImportDone(true);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
    setImporting(false);
  }, [folder, connectCode, tag]);

  // Auto-trigger import when arriving at step 3
  useEffect(() => {
    if (step === 3 && folder && !importing && !importDone && !importError) {
      runImport();
    }
  }, [step, folder, importing, importDone, importError, runImport]);

  return (
    <div style={styles.overlay} role="dialog" aria-label="MAGI Setup Wizard" aria-modal="true">
      <div style={styles.backdrop} aria-hidden="true" />

      <motion.div
        style={styles.container}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* ── Diagnostic rail ─────────────────────────────────── */}
        <div style={styles.rail}>
          <div>
            <div style={styles.railHeader}>
              <img src={magiLogo} alt="" style={styles.railLogo} />
              <div style={styles.railTitle}>MAGI</div>
              <div style={styles.railSubtitle}>// Boot sequence</div>
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
                      {done ? <Check /> : active ? <span style={{ fontSize: 6 }}>&#9654;</span> : null}
                    </div>
                    <div>
                      <div>{label}</div>
                      <div style={{ fontSize: 8, fontWeight: 400, color: "var(--text-dim)", letterSpacing: "0.02em", marginTop: 1 }}>
                        {STEP_DESCRIPTIONS[i]}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </div>

          <div style={styles.railSkip}>
            <button
              style={styles.skipBtn}
              onClick={onSkip}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
              type="button"
            >
              // skip setup &gt;
            </button>
          </div>
        </div>

        {/* ── Content panel ───────────────────────────────────── */}
        <div style={styles.panel}>
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="step-0"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
                style={styles.panelContent}
              >
                <div style={styles.stepTag}>Step 01 / 04</div>
                <h2 style={styles.heading}>{title}</h2>
                <p style={styles.description}>
                  MAGI is your AI-powered coaching system for Super Smash Bros. Melee.
                  Import your Slippi replays, and MAGI will analyze your gameplay,
                  track your habits, and deliver tactical coaching feedback.
                </p>

                <div style={styles.heroGrid}>
                  <div style={styles.heroStat}>
                    <div style={styles.heroStatLabel}>Analyze</div>
                    <div style={styles.heroStatValue}>REPLAYS</div>
                  </div>
                  <div style={styles.heroStat}>
                    <div style={styles.heroStatLabel}>Track</div>
                    <div style={styles.heroStatValue}>HABITS</div>
                  </div>
                  <div style={styles.heroStat}>
                    <div style={styles.heroStatLabel}>Receive</div>
                    <div style={styles.heroStatValue}>COACHING</div>
                  </div>
                </div>

                <div style={styles.actions}>
                  <button className="btn btn-primary" onClick={advance} type="button">
                    Begin Setup
                  </button>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="step-1"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
                style={styles.panelContent}
              >
                <div style={styles.stepTag}>Step 02 / 04</div>
                <h2 style={styles.heading}>PILOT IDENTIFICATION</h2>
                <p style={styles.description}>
                  Enter your Slippi tag or connect code so MAGI can identify you in replays
                  and track your performance across sessions.
                </p>

                <div style={styles.fieldGroup}>
                  <label style={styles.label} htmlFor="onboard-tag">Display Name / Tag</label>
                  <input
                    id="onboard-tag"
                    style={styles.input}
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="YourTag"
                    autoFocus
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(var(--accent-rgb), 0.12)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.label} htmlFor="onboard-code">Connect Code</label>
                  <input
                    id="onboard-code"
                    style={styles.input}
                    value={connectCode}
                    onChange={(e) => setConnectCode(e.target.value)}
                    placeholder="TAG#123"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(var(--accent-rgb), 0.12)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  <div style={styles.inputHint}>
                    Your Slippi Online connect code for accurate player matching
                  </div>
                </div>

                <div style={styles.actions}>
                  <button className="btn" onClick={goBack} type="button">
                    Back
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={savePlayerAndAdvance}
                    disabled={!tag && !connectCode}
                    type="button"
                  >
                    Continue
                  </button>
                  {!tag && !connectCode && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)" }}>
                      Enter at least one identifier
                    </span>
                  )}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
                style={styles.panelContent}
              >
                <div style={styles.stepTag}>Step 03 / 04</div>
                <h2 style={styles.heading}>DATA SOURCE LINK</h2>
                <p style={styles.description}>
                  Point MAGI to your Slippi replay folder. This is typically located in
                  your Slippi launcher's output directory.
                </p>

                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Replay Folder</label>
                  <div style={styles.folderDisplay}>
                    {folder ? (
                      <div style={styles.folderPath} title={folder}>
                        {folder}
                      </div>
                    ) : (
                      <div style={{ ...styles.folderPath, color: "var(--text-dim)" }}>
                        No folder selected
                      </div>
                    )}
                    <button className="btn" onClick={handleBrowse} type="button" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <FolderIcon />
                      Browse
                    </button>
                  </div>
                  <div style={styles.inputHint}>
                    Common locations: ~/Slippi or Documents/Slippi
                  </div>
                </div>

                <div style={styles.actions}>
                  <button className="btn" onClick={goBack} type="button">
                    Back
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={saveFolderAndAdvance}
                    disabled={!folder}
                    type="button"
                  >
                    Import Replays
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step-3"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
                style={styles.panelContent}
              >
                <div style={styles.stepTag}>Step 04 / 04</div>
                <h2 style={styles.heading}>
                  {importDone ? "SYSTEMS ONLINE" : importing ? "IMPORTING..." : "IMPORT SEQUENCE"}
                </h2>

                <div style={styles.importStatus}>
                  {importing && (
                    <>
                      <p style={styles.description}>
                        Scanning replay folder and importing game data.
                        This may take a moment depending on your library size.
                      </p>
                      <div style={styles.progressContainer}>
                        <motion.div
                          style={{
                            ...styles.progressBar,
                            width: "70%",
                          }}
                          animate={{ width: ["10%", "45%", "70%", "85%"] }}
                          transition={{ duration: 8, ease: "linear" }}
                        />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="spinner" />
                        <span style={styles.statusText}>
                          Processing replays...
                        </span>
                      </div>
                    </>
                  )}

                  {importResult && (
                    <>
                      <p style={styles.resultText}>{importResult}</p>
                      <p style={styles.description}>
                        Your replay data has been loaded. MAGI is ready to provide
                        tactical analysis and coaching feedback.
                      </p>
                    </>
                  )}

                  {importError && (
                    <>
                      <p style={styles.errorText}>Error: {importError}</p>
                      <p style={styles.description}>
                        The import encountered an issue. You can retry or configure
                        settings manually later.
                      </p>
                    </>
                  )}

                  <div style={{ ...styles.actions, marginTop: 16 }}>
                    {!importing && !importDone && (
                      <button className="btn" onClick={goBack} type="button">
                        Back
                      </button>
                    )}
                    {importDone && (
                      <button className="btn btn-primary" onClick={onComplete} type="button">
                        Launch Dashboard
                      </button>
                    )}
                    {importError && !importing && (
                      <>
                        <button className="btn" onClick={runImport} type="button">
                          Retry Import
                        </button>
                        <button className="btn" onClick={onSkip} type="button">
                          Configure Later
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Top-edge gleam -- same visual language as .card::before */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(var(--accent-rgb), 0.15) 30%, rgba(var(--accent-rgb), 0.3) 50%, rgba(var(--accent-rgb), 0.15) 70%, transparent)",
          }}
        />
      </motion.div>
    </div>
  );
}
