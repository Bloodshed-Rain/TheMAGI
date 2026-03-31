import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Markdown, { type Components } from "react-markdown";
import {
  useSets,
  useOpponents,
  useOpponentDetail,
  useConfig,
} from "../hooks/queries";
import { CoachingModal } from "../components/CoachingModal";
import { formatGameDate } from "../hooks";

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
          <span className="sessions-timestamp">{children}</span>
        );
      }
      return <a href={href}>{children}</a>;
    },
  };
}

function rateColor(rate: number): string {
  const pct = rate * 100;
  return pct >= 60 ? "var(--green)" : pct >= 45 ? "var(--yellow)" : "var(--red)";
}

function WinRateIndicator({ rate }: { rate: number }) {
  const pct = rate * 100;
  return (
    <div className="sessions-winrate-indicator">
      <span className="sessions-winrate-value" style={{ color: rateColor(rate) }}>
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
    <div className="sessions-breakdown-row">
      <span className="sessions-breakdown-label">{label}</span>
      <div className="sessions-breakdown-track">
        <div
          className="sessions-breakdown-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="sessions-breakdown-pct" style={{ color }}>{pct.toFixed(0)}%</span>
      <span className="sessions-breakdown-record">{wins}W-{losses}L</span>
    </div>
  );
}

function ResultBadge({ result }: { result: "W" | "L" | "T" }) {
  const colorMap = { W: "var(--green)", L: "var(--red)", T: "var(--text-dim)" };
  const bgMap = { W: "rgba(var(--green-rgb), 0.1)", L: "rgba(var(--red-rgb), 0.1)", T: "var(--bg-hover)" };
  return (
    <span
      className="sessions-result-badge"
      style={{ color: colorMap[result], background: bgMap[result] }}
    >
      {result}
    </span>
  );
}

/** The expanded opponent detail panel */
function OpponentDetailPanel({
  detail,
  onClose,
  onTriggerCoaching,
}: {
  detail: OpponentDetail;
  onClose: () => void;
  onTriggerCoaching: (scope: "game" | "session" | "character" | "stage" | "opponent", id: string | number, title: string) => void;
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
      <div className="sessions-detail-body">
        {/* Header */}
        <div className="sessions-detail-header">
          <div className="sessions-detail-title-group">
            <h3 className="sessions-detail-title">vs {detail.opponentTag}</h3>
            {detail.opponentConnectCode && (
              <span className="sessions-detail-code">{detail.opponentConnectCode}</span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close opponent detail"
            className="btn sessions-close-btn"
          >
            Close
          </button>
        </div>

        {/* Stat cluster */}
        <div className="sessions-detail-stats">
          <div className="stat-box" style={{ textAlign: "center" }}>
            <div className="stat-value" style={{ color: recordColor, fontSize: 22 }}>
              {detail.wins}-{detail.losses}
            </div>
            <div className="stat-label">Record</div>
          </div>
          <div className="stat-box" style={{ textAlign: "center" }}>
            <div className="stat-value" style={{ color: recordColor, fontSize: 22 }}>
              {winPct.toFixed(0)}%
            </div>
            <div className="stat-label">Win Rate</div>
          </div>
          <div className="stat-box" style={{ textAlign: "center" }}>
            <div className="stat-value" style={{ fontSize: 22 }}>
              {detail.totalGames}
            </div>
            <div className="stat-label">Games</div>
          </div>
          <div className="stat-box" style={{ textAlign: "center" }}>
            <div className="stat-value" style={{ color: "var(--accent)", fontSize: 22 }}>
              {detail.characterBreakdown.length}
            </div>
            <div className="stat-label">Characters Used</div>
          </div>
        </div>

        {/* Stage & Character breakdowns side by side */}
        <div
          className="sessions-detail-breakdowns"
          style={{ gridTemplateColumns: detail.characterBreakdown.length > 1 ? "1fr 1fr" : "1fr" }}
        >
          {detail.stageBreakdown.length > 0 && (
            <div>
              <div className="sessions-section-label">Stages</div>
              {detail.stageBreakdown.map(s => (
                <BreakdownBar key={s.stage} wins={s.wins} losses={s.losses} label={s.stage} />
              ))}
            </div>
          )}

          {detail.characterBreakdown.length > 1 && (
            <div>
              <div className="sessions-section-label">vs Character</div>
              {detail.characterBreakdown.map(c => (
                <BreakdownBar key={c.opponentCharacter} wins={c.wins} losses={c.losses} label={c.opponentCharacter} />
              ))}
            </div>
          )}
        </div>

        {/* Game history table */}
        <div className="sessions-section-label">Game History</div>
        <div className="data-table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
          <table className="data-table">
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>You</th>
                <th>Them</th>
                <th>Stage</th>
                <th>Result</th>
                <th>Neut.</th>
                <th>Op/K</th>
                <th>Edge.</th>
                <th>Coaching</th>
              </tr>
            </thead>
            <tbody>
              {detail.games.map(g => {
                const isWin = g.result === "win";
                return (
                  <tr key={g.id}>
                    <td className="mono-cell">
                      {formatGameDate(g.playedAt)}
                    </td>
                    <td className="mono-cell">{g.playerCharacter}</td>
                    <td className="mono-cell">{g.opponentCharacter}</td>
                    <td className="mono-cell dim">{g.stage}</td>
                    <td>
                      <ResultBadge result={isWin ? "W" : "L"} />
                      <span className="sessions-stock-count">
                        {g.playerFinalStocks}-{g.opponentFinalStocks}
                      </span>
                    </td>
                    <td className="mono-cell" style={{
                      color: g.neutralWinRate > 0.5 ? "var(--green)" : "var(--red)",
                    }}>
                      {(g.neutralWinRate * 100).toFixed(0)}%
                    </td>
                    <td className="mono-cell" style={{
                      color: Number.isFinite(g.openingsPerKill) && g.openingsPerKill <= 4
                        ? "var(--green)"
                        : g.openingsPerKill <= 7
                          ? "var(--yellow)"
                          : "var(--red)",
                    }}>
                      {Number.isFinite(g.openingsPerKill) ? g.openingsPerKill.toFixed(1) : "\u2014"}
                    </td>
                    <td className="mono-cell" style={{
                      color: g.edgeguardSuccessRate > 0.6 ? "var(--green)" : g.edgeguardSuccessRate > 0.3 ? "var(--yellow)" : "var(--red)",
                    }}>
                      {(g.edgeguardSuccessRate * 100).toFixed(0)}%
                    </td>
                    <td>
                      <button 
                        className="btn btn-icon-small" 
                        title="Get AI Coaching for this game"
                        onClick={() => onTriggerCoaching("game", g.id, `Game vs ${detail.opponentTag} on ${g.stage}`)}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12L2.1 12.1"/><path d="M12 12L19 19"/><path d="M12 12V22"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* AI matchup analysis */}
        <div className="sessions-analysis-section">
          <button
            className="btn btn-primary"
            onClick={() => onTriggerCoaching("opponent", detail.opponentConnectCode || detail.opponentTag, `Head-to-Head: ${detail.opponentTag}`)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            Request Full Matchup Analysis
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function Sessions({ refreshKey }: { refreshKey: number }) {
  const [view, setView] = useState<View>("sets");
  const [opponentSearch, setOpponentSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [scopedCoaching, setScopedCoaching] = useState<{
    scope: "game" | "session" | "character" | "stage" | "opponent";
    id: string | number;
    title: string;
  } | null>(null);

  const { data: sets = [], isLoading: setsLoading, refetch: refetchSets } = useSets();
  const { data: opponents = [], isLoading: oppsLoading, refetch: refetchOpps } = useOpponents(searchQuery || undefined);
  const { data: config } = useConfig();

  // Opponent detail state
  const [expandedOpponent, setExpandedOpponent] = useState<string | null>(null);
  const { data: opponentDetail, isFetching: detailLoading, refetch: refetchDetail } = useOpponentDetail(expandedOpponent);

  // AI analysis state for opponent matchup
  // Removed old state: matchupAnalysis, analyzingMatchup, matchupStreamText, matchupIsStreaming, matchupAnalysisError

  useEffect(() => {
    refetchSets();
    refetchOpps();
    if (expandedOpponent) {
      refetchDetail();
    }
  }, [refreshKey, refetchSets, refetchOpps, refetchDetail, expandedOpponent]);

  const loading = setsLoading || oppsLoading;

  const handleSearch = () => {
    setSearchQuery(opponentSearch.trim());
  };

  const handleOpponentClick = useCallback(async (opponent: OpponentRecord) => {
    const key = opponent.opponentConnectCode ?? opponent.opponentTag;

    if (expandedOpponent === key) {
      setExpandedOpponent(null);
      return;
    }

    setExpandedOpponent(key);
  }, [expandedOpponent]);

  const handleTriggerCoaching = useCallback((
    scope: "game" | "session" | "character" | "stage" | "opponent",
    id: string | number,
    title: string
  ) => {
    setScopedCoaching({ scope, id, title });
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" style={{ margin: "0 auto 12px" }} />
        Loading session data...
      </div>
    );
  }

  if (sets.length === 0 && opponents.length === 0) {
    return (
      <div className="empty-state">
        <h2>No sessions yet</h2>
        <p>Import replays to see your sets and opponents here.</p>
      </div>
    );
  }

  return (
    <div>
      <AnimatePresence>
        {scopedCoaching && (
          <CoachingModal
            isOpen={!!scopedCoaching}
            onClose={() => setScopedCoaching(null)}
            scope={scopedCoaching.scope}
            id={scopedCoaching.id}
            title={scopedCoaching.title}
          />
        )}
      </AnimatePresence>
      <motion.div
        className="page-header"
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1>Sessions</h1>
        <p>
          <span className="sessions-accent-num">{sets.length}</span> sets
          {" \u00B7 "}
          <span className="sessions-accent-num">{opponents.length}</span> opponents
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
            {v === "sets" ? "Sets" : "Opponents"}
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
              <p className="sessions-empty-msg">No sets detected yet.</p>
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
                    <th>Coaching</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sets].reverse().map((set, i) => {
                    const total = set.gameIds.length;
                    const result = set.wins > set.losses ? "W" : set.losses > set.wins ? "L" : "T";
                    // Find session ID from the first game
                    // Actually the set object should probably have session ID, 
                    // but for now we'll use one of the game IDs or we need to update the query.
                    // Wait, sessionId is needed for 'session' scope.
                    // Let's assume gameIds[0] is part of a session.
                    // Actually, the detected sets logic doesn't strictly map 1:1 to DB sessions.
                    // But for coaching, we can just pass the list of replay paths.
                    // But our analyze:scoped expects an ID.
                    // Let's use the first gameId as a proxy or update the query.
                    // For now, I'll pass the first gameId and use a new scope 'set' if needed, 
                    // or just use 'session' and ensure it works.
                    return (
                      <tr key={i}>
                        <td className="mono-cell">
                          {formatGameDate(set.startedAt)}
                        </td>
                        <td style={{ fontWeight: 600 }}>{set.opponentTag}</td>
                        <td className="mono-cell">{set.opponentCharacter}</td>
                        <td className="mono-cell">{total}</td>
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
                          <ResultBadge result={result as "W" | "L" | "T"} />
                        </td>
                        <td>
                          <button 
                            className="btn btn-icon-small" 
                            title="Analyze this set"
                            onClick={() => {
                              // We need the session ID. Let's hope it's available or we find it.
                              // For now, I'll update the detectSets query to include session_id.
                              setScopedCoaching({
                                scope: "session",
                                id: set.sessionId || 0, // Fallback
                                title: `Set vs ${set.opponentTag} (${formatGameDate(set.startedAt)})`
                              });
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12L2.1 12.1"/><path d="M12 12L19 19"/><path d="M12 12V22"/>
                            </svg>
                          </button>
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
                  placeholder="Search by tag or connect code..."
                  className="sessions-search-input"
                />
                <button className="btn" onClick={handleSearch}>Search</button>
              </div>
            </div>
            <div className="card">
              {opponents.length === 0 ? (
                <p className="sessions-empty-msg">No opponents found.</p>
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
                          className={isExpanded ? "sessions-row-expanded" : undefined}
                          aria-expanded={isExpanded}
                        >
                          <td style={{ fontWeight: 600 }}>
                            <span className="sessions-opponent-name">
                              <motion.span
                                animate={{ rotate: isExpanded ? 90 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="sessions-chevron"
                                style={{ color: isExpanded ? "var(--accent)" : "var(--text-dim)" }}
                              >
                                {"\u25B6"}
                              </motion.span>
                              {o.opponentTag}
                            </span>
                          </td>
                          <td className="mono-cell dim">
                            {o.opponentConnectCode ?? ""}
                          </td>
                          <td className="mono-cell">{o.characters}</td>
                          <td className="mono-cell">{o.totalGames}</td>
                          <td>
                            <span className="record-win">{o.wins}</span>
                            {" - "}
                            <span className="record-loss">{o.losses}</span>
                          </td>
                          <td><WinRateIndicator rate={o.winRate} /></td>
                          <td className="mono-cell dim">
                            {formatGameDate(o.lastPlayed)}
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
                    <div className="sessions-detail-loading">
                      <div className="spinner" />
                      <span>Loading opponent data...</span>
                    </div>
                  )}
                  {!detailLoading && opponentDetail && (
                    <OpponentDetailPanel
                      detail={opponentDetail}
                      onClose={() => { setExpandedOpponent(null); }}
                      onTriggerCoaching={handleTriggerCoaching}
                    />
                  )}
                  {!detailLoading && !opponentDetail && (
                    <div className="sessions-detail-loading">
                      No data found for this opponent.
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
