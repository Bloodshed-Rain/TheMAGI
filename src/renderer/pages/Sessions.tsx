import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Markdown, { type Components } from "react-markdown";
import { useGlitchText } from "../hooks";

interface DetectedSet {
  opponentTag: string;
  opponentCharacter: string;
  gameIds: number[];
  startedAt: string;
  wins: number;
  losses: number;
  draws: number;
}

type View = "sets" | "opponents";

interface OpponentRecord {
  opponentTag: string;
  opponentConnectCode: string | null;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
  characters: string;
  lastPlayed: string | null;
}

interface OpponentDetailGame {
  id: number;
  playedAt: string | null;
  playerCharacter: string;
  opponentCharacter: string;
  stage: string;
  result: string;
  playerFinalStocks: number;
  opponentFinalStocks: number;
  neutralWinRate: number;
  lCancelRate: number;
  openingsPerKill: number;
  edgeguardSuccessRate: number;
  replayPath: string;
}

interface OpponentStageBreakdown {
  stage: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

interface OpponentCharacterBreakdown {
  opponentCharacter: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

interface OpponentDetail {
  opponentTag: string;
  opponentConnectCode: string | null;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
  games: OpponentDetailGame[];
  stageBreakdown: OpponentStageBreakdown[];
  characterBreakdown: OpponentCharacterBreakdown[];
}

/** Pre-process coaching markdown to convert [M:SS] timestamps into clickable links */
function injectTimestampLinks(text: string): string {
  return text.replace(/\[(\d{1,2}:\d{2})\]/g, "[$1](timestamp:$1)");
}

function makeTimestampComponents(): Components {
  return {
    a: ({ href, children }) => {
      if (href?.startsWith("timestamp:")) {
        return (
          <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
            {children}
          </span>
        );
      }
      return <a href={href}>{children}</a>;
    },
  };
}

function WinRateIndicator({ rate }: { rate: number }) {
  const pct = rate * 100;
  const color = pct >= 60 ? "var(--green)" : pct >= 45 ? "var(--yellow)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color }}>
        {pct.toFixed(0)}%
      </span>
      <div className="winrate-bar">
        <div className="winrate-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Compact horizontal bar for stage/character breakdowns */
function BreakdownBar({ wins, losses, label }: { wins: number; losses: number; label: string }) {
  const total = wins + losses;
  const pct = total > 0 ? (wins / total) * 100 : 0;
  const color = pct >= 60 ? "var(--green)" : pct >= 45 ? "var(--yellow)" : "var(--red)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--text)",
        width: 120,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1,
        height: 6,
        background: "var(--bg)",
        borderRadius: 1,
        overflow: "hidden",
        position: "relative",
      }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 1,
          transition: "width 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: `0 0 8px ${color}40`,
        }} />
      </div>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color,
        fontWeight: 700,
        width: 36,
        textAlign: "right",
        flexShrink: 0,
      }}>
        {pct.toFixed(0)}%
      </span>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text-dim)",
        width: 48,
        textAlign: "right",
        flexShrink: 0,
      }}>
        {wins}W-{losses}L
      </span>
    </div>
  );
}

/** The expanded opponent dossier panel */
function OpponentDossier({
  detail,
  onClose,
  onRequestAnalysis,
  analysisText,
  isAnalyzing,
  isStreaming,
  streamingText,
  analysisError,
}: {
  detail: OpponentDetail;
  onClose: () => void;
  onRequestAnalysis: () => void;
  analysisText: string | null;
  isAnalyzing: boolean;
  isStreaming: boolean;
  streamingText: string;
  analysisError: string | null;
}) {
  const winPct = detail.winRate * 100;
  const recordColor = winPct >= 60 ? "var(--green)" : winPct >= 45 ? "var(--yellow)" : "var(--red)";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{ overflow: "hidden" }}
    >
      <div style={{
        padding: "20px 24px",
        borderTop: "1px solid var(--border)",
        background: "linear-gradient(180deg, rgba(var(--accent-rgb), 0.02) 0%, transparent 40%)",
      }}>
        {/* ── Rivalry header ── */}
        <div style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{
              fontFamily: "var(--font-display, var(--font-mono))",
              fontSize: 10,
              letterSpacing: "3px",
              color: "var(--text-dim)",
              textTransform: "uppercase",
            }}>
              RIVALRY DOSSIER
            </span>
            <h3 style={{
              fontFamily: "var(--font-display, var(--font-mono))",
              fontSize: 20,
              fontWeight: 800,
              color: "var(--text)",
              letterSpacing: "1px",
              margin: 0,
            }}>
              vs {detail.opponentTag}
            </h3>
            {detail.opponentConnectCode && (
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-dim)",
              }}>
                {detail.opponentConnectCode}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close opponent detail"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              color: "var(--text-dim)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              padding: "4px 10px",
              letterSpacing: "1px",
              clipPath: "var(--clip-corner-sm)",
              transition: "color 0.2s, border-color 0.2s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = "var(--text)";
              e.currentTarget.style.borderColor = "var(--text-dim)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = "var(--text-dim)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            CLOSE
          </button>
        </div>

        {/* ── Stat cluster ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}>
          <div className="stat-box" style={{ textAlign: "center" }}>
            <div className="stat-value" style={{ color: recordColor, fontSize: 22 }}>
              {detail.wins}-{detail.losses}
            </div>
            <div className="stat-label">RECORD</div>
          </div>
          <div className="stat-box" style={{ textAlign: "center" }}>
            <div className="stat-value" style={{ color: recordColor, fontSize: 22 }}>
              {winPct.toFixed(0)}%
            </div>
            <div className="stat-label">WIN RATE</div>
          </div>
          <div className="stat-box" style={{ textAlign: "center" }}>
            <div className="stat-value" style={{ color: "var(--text)", fontSize: 22 }}>
              {detail.totalGames}
            </div>
            <div className="stat-label">GAMES</div>
          </div>
          <div className="stat-box" style={{ textAlign: "center" }}>
            <div className="stat-value" style={{ color: "var(--accent)", fontSize: 22 }}>
              {detail.characterBreakdown.length}
            </div>
            <div className="stat-label">CHARS USED</div>
          </div>
        </div>

        {/* ── Stage & Character breakdowns side by side ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: detail.characterBreakdown.length > 1 ? "1fr 1fr" : "1fr",
          gap: 16,
          marginBottom: 24,
        }}>
          {/* Stage breakdown */}
          {detail.stageBreakdown.length > 0 && (
            <div>
              <div style={{
                fontFamily: "var(--font-display, var(--font-mono))",
                fontSize: 10,
                letterSpacing: "2px",
                color: "var(--text-dim)",
                marginBottom: 10,
                textTransform: "uppercase",
              }}>
                STAGE BREAKDOWN
              </div>
              {detail.stageBreakdown.map(s => (
                <BreakdownBar key={s.stage} wins={s.wins} losses={s.losses} label={s.stage} />
              ))}
            </div>
          )}

          {/* Character breakdown -- only show if opponent uses multiple characters */}
          {detail.characterBreakdown.length > 1 && (
            <div>
              <div style={{
                fontFamily: "var(--font-display, var(--font-mono))",
                fontSize: 10,
                letterSpacing: "2px",
                color: "var(--text-dim)",
                marginBottom: 10,
                textTransform: "uppercase",
              }}>
                VS CHARACTER
              </div>
              {detail.characterBreakdown.map(c => (
                <BreakdownBar key={c.opponentCharacter} wins={c.wins} losses={c.losses} label={c.opponentCharacter} />
              ))}
            </div>
          )}
        </div>

        {/* ── Game history table ── */}
        <div style={{
          fontFamily: "var(--font-display, var(--font-mono))",
          fontSize: 10,
          letterSpacing: "2px",
          color: "var(--text-dim)",
          marginBottom: 10,
          textTransform: "uppercase",
        }}>
          ENGAGEMENT HISTORY
        </div>
        <div className="data-table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
          <table className="data-table">
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>You</th>
                <th>Them</th>
                <th>Stage</th>
                <th>Result</th>
                <th>Neutral</th>
                <th>Op/Kill</th>
                <th>Edgeguard</th>
              </tr>
            </thead>
            <tbody>
              {detail.games.map(g => {
                const isWin = g.result === "win";
                return (
                  <tr key={g.id}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      {g.playedAt ? new Date(g.playedAt).toLocaleDateString() : ""}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      {g.playerCharacter}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      {g.opponentCharacter}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)" }}>
                      {g.stage}
                    </td>
                    <td>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 24,
                        height: 24,
                        fontSize: 10,
                        fontWeight: 900,
                        fontFamily: "var(--font-display, var(--font-mono))",
                        letterSpacing: "1px",
                        background: isWin ? "rgba(var(--green-rgb), 0.12)" : "rgba(var(--red-rgb), 0.12)",
                        color: isWin ? "var(--green)" : "var(--red)",
                        border: `1px solid ${isWin ? "rgba(var(--green-rgb), 0.25)" : "rgba(var(--red-rgb), 0.25)"}`,
                        clipPath: "polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 3px 100%, 0 calc(100% - 3px))",
                      }}>
                        {isWin ? "W" : "L"}
                      </span>
                      <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--text-dim)",
                        marginLeft: 6,
                      }}>
                        {g.playerFinalStocks}-{g.opponentFinalStocks}
                      </span>
                    </td>
                    <td style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: g.neutralWinRate > 0.5 ? "var(--green)" : "var(--red)",
                    }}>
                      {(g.neutralWinRate * 100).toFixed(0)}%
                    </td>
                    <td style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: Number.isFinite(g.openingsPerKill) && g.openingsPerKill <= 4
                        ? "var(--green)"
                        : g.openingsPerKill <= 7
                          ? "var(--yellow)"
                          : "var(--red)",
                    }}>
                      {Number.isFinite(g.openingsPerKill) ? g.openingsPerKill.toFixed(1) : "\u2014"}
                    </td>
                    <td style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: g.edgeguardSuccessRate > 0.6 ? "var(--green)" : g.edgeguardSuccessRate > 0.3 ? "var(--yellow)" : "var(--red)",
                    }}>
                      {(g.edgeguardSuccessRate * 100).toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── AI matchup analysis ── */}
        <div style={{ marginTop: 20 }}>
          <button
            className="btn"
            onClick={onRequestAnalysis}
            disabled={isAnalyzing}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            {isAnalyzing ? "ANALYZING RIVALRY..." : "REQUEST MATCHUP ANALYSIS"}
          </button>

          {isAnalyzing && !isStreaming && !streamingText && (
            <div className="analyze-loading" style={{ marginTop: 12 }}>
              <div className="spinner" />
              <span>MAGI COMPILING RIVALRY INTELLIGENCE...</span>
            </div>
          )}

          {(isStreaming || streamingText) && !analysisText && (
            <div className="analysis-text" style={{ marginTop: 12 }}>
              <Markdown components={makeTimestampComponents()}>
                {injectTimestampLinks(streamingText)}
              </Markdown>
              {isStreaming && <span className="streaming-cursor" />}
            </div>
          )}

          {analysisError && !analysisText && !streamingText && (
            <p style={{ color: "var(--red)", fontSize: 13, fontFamily: "var(--font-mono)", marginTop: 12 }}>
              {analysisError}
            </p>
          )}

          {analysisText && (
            <div className="analysis-text" style={{ marginTop: 12 }}>
              <Markdown components={makeTimestampComponents()}>
                {injectTimestampLinks(analysisText)}
              </Markdown>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function Sessions({ refreshKey }: { refreshKey: number }) {
  const [view, setView] = useState<View>("sets");
  const [sets, setSets] = useState<DetectedSet[]>([]);
  const [opponents, setOpponents] = useState<OpponentRecord[]>([]);
  const [opponentSearch, setOpponentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const title = useGlitchText("SESSIONS", 500);

  // Opponent detail state
  const [expandedOpponent, setExpandedOpponent] = useState<string | null>(null);
  const [opponentDetail, setOpponentDetail] = useState<OpponentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // AI analysis state for opponent matchup
  const [matchupAnalysis, setMatchupAnalysis] = useState<Record<string, string>>({});
  const [analyzingMatchup, setAnalyzingMatchup] = useState<string | null>(null);
  const [matchupStreamText, setMatchupStreamText] = useState("");
  const [matchupIsStreaming, setMatchupIsStreaming] = useState(false);
  const [matchupAnalysisError, setMatchupAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [s, o] = await Promise.all([
          window.clippi.getSets(),
          window.clippi.getOpponents(),
        ]);
        setSets(s);
        setOpponents(o);
      } catch (err) {
        console.error("Failed to load sessions:", err);
      }
      setLoading(false);
    }
    load();
  }, [refreshKey]);

  const handleSearch = async () => {
    try {
      if (!opponentSearch.trim()) {
        const o = await window.clippi.getOpponents();
        setOpponents(o);
      } else {
        const o = await window.clippi.getOpponents(opponentSearch.trim());
        setOpponents(o);
      }
    } catch (err) {
      console.error("Opponent search failed:", err);
    }
  };

  const handleOpponentClick = useCallback(async (opponent: OpponentRecord) => {
    const key = opponent.opponentConnectCode ?? opponent.opponentTag;

    if (expandedOpponent === key) {
      setExpandedOpponent(null);
      setOpponentDetail(null);
      return;
    }

    setExpandedOpponent(key);
    setDetailLoading(true);
    setMatchupAnalysisError(null);

    try {
      const detail = await window.clippi.getOpponentDetail(key);
      setOpponentDetail(detail);
    } catch (err) {
      console.error("Failed to load opponent detail:", err);
      setOpponentDetail(null);
    }
    setDetailLoading(false);
  }, [expandedOpponent]);

  const handleRequestMatchupAnalysis = useCallback(async () => {
    if (!opponentDetail || !expandedOpponent) return;

    const key = expandedOpponent;
    if (matchupAnalysis[key]) return; // already cached

    setAnalyzingMatchup(key);
    setMatchupStreamText("");
    setMatchupIsStreaming(true);
    setMatchupAnalysisError(null);

    const unsubStream = window.clippi.onAnalysisStream((chunk: string) => {
      setMatchupStreamText(prev => prev + chunk);
    });
    const unsubEnd = window.clippi.onAnalysisStreamEnd(() => {
      setMatchupIsStreaming(false);
    });

    try {
      // Analyze the most recent games against this opponent (up to 5)
      const replayPaths = opponentDetail.games.slice(0, 5).map(g => g.replayPath);
      const config = await window.clippi.loadConfig();
      const target = config?.connectCode || config?.targetPlayer || "";
      const result = await window.clippi.analyzeReplays(replayPaths, target);
      setMatchupAnalysis(prev => ({ ...prev, [key]: result }));
      setMatchupStreamText("");
    } catch (err: unknown) {
      setMatchupAnalysisError(err instanceof Error ? err.message : String(err));
      setMatchupStreamText("");
    } finally {
      unsubStream();
      unsubEnd();
      setMatchupIsStreaming(false);
      setAnalyzingMatchup(null);
    }
  }, [opponentDetail, expandedOpponent, matchupAnalysis]);

  if (loading) return <div className="loading"><div className="spinner" style={{ margin: "0 auto 12px" }} />LOADING SESSION DATA...</div>;

  if (sets.length === 0 && opponents.length === 0) {
    return (
      <div className="empty-state">
        <h2>NO SESSIONS DETECTED</h2>
        <p>Import replays to populate your engagement history.</p>
      </div>
    );
  }

  return (
    <div>
      <motion.div
        className="page-header"
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1>{title}</h1>
        <p>
          // <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent)" }}>{sets.length}</span> SETS DETECTED |{" "}
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent)" }}>{opponents.length}</span> UNIQUE TARGETS
        </p>
      </motion.div>

      <div className="tab-bar" role="tablist">
        {(["sets", "opponents"] as View[]).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            className={`tab ${view === v ? "active" : ""}`}
            onClick={() => setView(v)}
          >
            {v === "sets" ? "SETS" : "OPPONENTS"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {view === "sets" && (
          <motion.div
            key="sets"
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {sets.length === 0 ? (
              <p style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 12 }}>No sets detected yet.</p>
            ) : (
              <div className="data-table-wrap">
              <table className="data-table">
                <colgroup>
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Opponent</th>
                    <th>Character</th>
                    <th>Games</th>
                    <th>Score</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sets].reverse().map((set, i) => {
                    const total = set.gameIds.length;
                    const result = set.wins > set.losses ? "W" : set.losses > set.wins ? "L" : "T";
                    return (
                      <tr key={i}>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                          {new Date(set.startedAt).toLocaleDateString()}
                        </td>
                        <td style={{ fontWeight: 700 }}>{set.opponentTag}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{set.opponentCharacter}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{total}</td>
                        <td>
                          <span className="record-win">{set.wins}</span>
                          {" - "}
                          <span className="record-loss">{set.losses}</span>
                          {set.draws > 0 && (
                            <>
                              {" - "}
                              <span style={{ color: "var(--text-dim)" }}>{set.draws}</span>
                            </>
                          )}
                        </td>
                        <td>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 28,
                            height: 28,
                            fontSize: 11,
                            fontWeight: 900,
                            fontFamily: "var(--font-display, var(--font-mono))",
                            letterSpacing: "1px",
                            background: result === "W" ? "rgba(var(--green-rgb), 0.12)" : result === "L" ? "rgba(var(--red-rgb), 0.12)" : "var(--bg-hover)",
                            color: result === "W" ? "var(--green)" : result === "L" ? "var(--red)" : "var(--text-dim)",
                            border: `1px solid ${result === "W" ? "rgba(var(--green-rgb), 0.25)" : result === "L" ? "rgba(var(--red-rgb), 0.25)" : "var(--border)"}`,
                            boxShadow: result === "W" ? "0 0 12px rgba(var(--green-rgb), 0.15)" : result === "L" ? "0 0 12px rgba(var(--red-rgb), 0.15)" : "none",
                            clipPath: "polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px))",
                          }}>
                            {result}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </motion.div>
        )}

        {view === "opponents" && (
          <motion.div
            key="opponents"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="settings-row">
                <input
                  value={opponentSearch}
                  onChange={(e) => setOpponentSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="SEARCH BY TAG OR CONNECT CODE..."
                  style={{
                    flex: 1,
                    padding: "10px 16px",
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "1px",
                    clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
                  }}
                />
                <button className="btn" onClick={handleSearch}>SEARCH</button>
              </div>
            </div>
            <div className="card">
              {opponents.length === 0 ? (
                <p style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 12 }}>No targets found.</p>
              ) : (
                <div className="data-table-wrap">
                <table className="data-table">
                  <colgroup>
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Opponent</th>
                      <th>Code</th>
                      <th>Characters</th>
                      <th>Games</th>
                      <th>Record</th>
                      <th>Win Rate</th>
                      <th>Last Played</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opponents.map((o, i) => {
                      const key = o.opponentConnectCode ?? o.opponentTag;
                      const isExpanded = expandedOpponent === key;
                      return (
                        <tr
                          key={i}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleOpponentClick(o)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpponentClick(o); } }}
                          style={{
                            cursor: "pointer",
                            background: isExpanded ? "rgba(var(--accent-rgb), 0.04)" : undefined,
                          }}
                          aria-expanded={isExpanded}
                        >
                          <td style={{ fontWeight: 700 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <motion.span
                                animate={{ rotate: isExpanded ? 90 : 0 }}
                                transition={{ duration: 0.2 }}
                                style={{
                                  display: "inline-block",
                                  fontSize: 8,
                                  color: isExpanded ? "var(--accent)" : "var(--text-dim)",
                                  lineHeight: 1,
                                }}
                              >
                                {"\u25B6"}
                              </motion.span>
                              {o.opponentTag}
                            </span>
                          </td>
                          <td style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                            {o.opponentConnectCode ?? ""}
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{o.characters}</td>
                          <td style={{ fontFamily: "var(--font-mono)" }}>{o.totalGames}</td>
                          <td>
                            <span className="record-win">{o.wins}</span>
                            {" - "}
                            <span className="record-loss">{o.losses}</span>
                          </td>
                          <td><WinRateIndicator rate={o.winRate} /></td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
                            {o.lastPlayed ? new Date(o.lastPlayed).toLocaleDateString() : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* Opponent detail panel -- rendered outside the table for proper layout */}
            <AnimatePresence>
              {expandedOpponent && (
                <motion.div
                  key={expandedOpponent}
                  className="card"
                  style={{ marginTop: 12 }}
                  initial={{ opacity: 0, y: 16, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.99 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  {detailLoading && (
                    <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 12 }}>
                      <div className="spinner" />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)" }}>
                        LOADING RIVAL INTELLIGENCE...
                      </span>
                    </div>
                  )}
                  {!detailLoading && opponentDetail && (
                    <OpponentDossier
                      detail={opponentDetail}
                      onClose={() => { setExpandedOpponent(null); setOpponentDetail(null); }}
                      onRequestAnalysis={handleRequestMatchupAnalysis}
                      analysisText={matchupAnalysis[expandedOpponent] ?? null}
                      isAnalyzing={analyzingMatchup === expandedOpponent}
                      isStreaming={matchupIsStreaming}
                      streamingText={matchupStreamText}
                      analysisError={matchupAnalysisError}
                    />
                  )}
                  {!detailLoading && !opponentDetail && (
                    <div style={{ padding: 24, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)" }}>
                      NO DATA FOUND FOR THIS OPPONENT.
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
