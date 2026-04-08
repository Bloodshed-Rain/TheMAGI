import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, Clock, ExternalLink } from "lucide-react";
import { CoachingCards } from "../components/CoachingCards";
import { useAnalysisHistory } from "../hooks/queries";
import { formatGameDate } from "../hooks";

const SCOPES = [
  { value: undefined, label: "All" },
  { value: "game", label: "Game" },
  { value: "session", label: "Session" },
  { value: "character", label: "Character" },
  { value: "stage", label: "Stage" },
  { value: "opponent", label: "Opponent" },
  { value: "discovery", label: "Discovery" },
  { value: "recent", label: "Recent" },
] as const;

const SCOPE_COLORS: Record<string, string> = {
  game: "var(--accent)",
  session: "var(--secondary)",
  character: "var(--green)",
  stage: "var(--secondary-dim)",
  opponent: "var(--yellow)",
  discovery: "var(--accent)",
  recent: "var(--yellow)",
  career: "var(--red)",
};

function ScopeBadge({ scope }: { scope: string }) {
  const color = SCOPE_COLORS[scope] ?? "var(--text-dim)";
  return (
    <span
      className="history-scope-badge"
      style={{ color, borderColor: color }}
    >
      {scope}
    </span>
  );
}

interface AnalysisEntry {
  id: number;
  gameId: number | null;
  sessionId: number | null;
  scope: string;
  scopeIdentifier: string | null;
  title: string | null;
  modelUsed: string;
  analysisText: string;
  createdAt: string;
  playerCharacter: string | null;
  opponentCharacter: string | null;
  opponentTag: string | null;
  stage: string | null;
  result: string | null;
}

function getDisplayTitle(entry: AnalysisEntry): string {
  if (entry.title) return entry.title;
  if (entry.playerCharacter && entry.opponentCharacter) {
    return `${entry.playerCharacter} vs ${entry.opponentCharacter}${entry.stage ? ` on ${entry.stage}` : ""}`;
  }
  if (entry.scopeIdentifier) return entry.scopeIdentifier;
  return `${entry.scope} analysis`;
}

function getPreview(text: string, maxLen: number = 120): string {
  const clean = text.replace(/[#*_[\]]/g, "").replace(/\n/g, " ").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) + "..." : clean;
}

export function History({ refreshKey: _refreshKey }: { refreshKey: number }) {
  const navigate = useNavigate();
  const [scopeFilter, setScopeFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const PAGE_SIZE = 20;

  // Deep Discovery state
  const [discovery, setDiscovery] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryStream, setDiscoveryStream] = useState("");
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const handleRunDiscovery = async () => {
    setIsDiscovering(true);
    setDiscoveryStream("");
    setDiscovery(null);
    setDiscoveryError(null);

    const streamId = crypto.randomUUID();
    const unsubStream = window.clippi.onAnalysisStream((chunk: string, sid?: string) => {
      if (sid !== undefined && sid !== streamId) return;
      setDiscoveryStream((prev) => prev + chunk);
    });
    const unsubEnd = window.clippi.onAnalysisStreamEnd((sid?: string) => {
      if (sid !== undefined && sid !== streamId) return;
      setIsDiscovering(false);
    });

    try {
      const result = await window.clippi.analyzeDiscovery(streamId);
      setDiscovery(result);
      setDiscoveryStream("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("minimum 5 games")) {
        setDiscoveryError("Deep Discovery requires at least 5 imported games.");
      } else {
        setDiscoveryError(msg);
      }
    } finally {
      unsubStream();
      unsubEnd();
      setIsDiscovering(false);
    }
  };

  const { data: analyses = [], isLoading } = useAnalysisHistory(
    PAGE_SIZE,
    page * PAGE_SIZE,
    scopeFilter,
  );

  const handleToggle = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner" style={{ margin: "0 auto 12px" }} />
        Loading analysis history...
      </div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="page-header">
          <h1>Analysis History</h1>
          <p>Browse past MAGI coaching analyses</p>
        </div>
      </motion.div>

      {/* Scope filter pills */}
      <div className="history-filters">
        {SCOPES.map((s) => (
          <button
            key={s.label}
            className={`history-filter-pill ${scopeFilter === s.value ? "active" : ""} ${s.value === undefined && scopeFilter === undefined ? "active" : ""}`}
            onClick={() => {
              setScopeFilter(s.value);
              setPage(0);
              setExpandedId(null);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Deep Discovery */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <div className="card discovery-card" style={{ marginBottom: 16 }}>
          <div className="discovery-header">
            <div className="discovery-title-row">
              <div className="discovery-icon">
                <Compass size={22} strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="discovery-heading">Deep Discovery</h2>
                <p className="discovery-desc">
                  MAGI mines your entire career for hidden patterns and non-obvious win conditions.
                </p>
              </div>
            </div>
            {!discovery && !isDiscovering && !discoveryStream && (
              <button className="btn btn-primary discovery-btn" onClick={handleRunDiscovery}>
                Synthesize Career Narrative
              </button>
            )}
          </div>

          {discoveryError && (
            <div className="discovery-error">{discoveryError}</div>
          )}

          {(isDiscovering || discovery || discoveryStream) && (
            <div className="discovery-body">
              {isDiscovering && !discoveryStream && (
                <div className="analyze-loading">
                  <div className="spinner" />
                  <span>Running correlation matrix and situational anomaly filters...</span>
                </div>
              )}
              <div className="analysis-text">
                <CoachingCards
                  text={discovery || discoveryStream}
                  isStreaming={isDiscovering && !!discoveryStream}
                />
              </div>
              {discovery && !isDiscovering && (
                <button className="btn" style={{ marginTop: 12 }} onClick={handleRunDiscovery}>Refresh Discovery</button>
              )}
            </div>
          )}

          <div className="discovery-watermark">MAGI</div>
        </div>
      </motion.div>

      {analyses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Clock size={64} strokeWidth={1.2} stroke="var(--accent)" />
          </div>
          <h2>No analyses yet</h2>
          <p>Run an AI analysis from the Dashboard or any page to see it here.</p>
        </div>
      ) : (
        <div className="history-list">
          {analyses.map((entry: AnalysisEntry, index: number) => {
            const isExpanded = expandedId === entry.id;
            const title = getDisplayTitle(entry);

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.1), duration: 0.2 }}
              >
                <div className={`history-entry ${isExpanded ? "history-entry-expanded" : ""}`}>
                  <button
                    className="history-entry-header"
                    onClick={() => handleToggle(entry.id)}
                  >
                    <div className="history-entry-left">
                      <ScopeBadge scope={entry.scope} />
                      <div className="history-entry-info">
                        <div className="history-entry-title">{title}</div>
                        {!isExpanded && (
                          <div className="history-entry-preview">{getPreview(entry.analysisText)}</div>
                        )}
                      </div>
                    </div>
                    <div className="history-entry-right">
                      {entry.gameId && (
                        <button
                          className="btn btn-icon-small"
                          title="View game detail"
                          onClick={(e) => { e.stopPropagation(); navigate(`/game/${entry.gameId}`); }}
                        >
                          <ExternalLink size={12} />
                        </button>
                      )}
                      {entry.result && (
                        <span className={`result-badge ${entry.result === "win" ? "win" : entry.result === "loss" ? "loss" : "draw"}`}>
                          {entry.result === "win" ? "W" : entry.result === "loss" ? "L" : "D"}
                        </span>
                      )}
                      <span className="history-entry-model">{entry.modelUsed.split("/").pop()}</span>
                      <span className="history-entry-date">{formatGameDate(entry.createdAt)}</span>
                      <motion.span
                        className="history-entry-chevron"
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {"\u25BC"}
                      </motion.span>
                    </div>
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        className="history-entry-body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <CoachingCards text={entry.analysisText} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {analyses.length >= PAGE_SIZE && (
        <div className="history-pagination">
          <button
            className="btn"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span className="history-page-num">Page {page + 1}</span>
          <button
            className="btn"
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
