import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Markdown, { type Components } from "react-markdown";
import { Onboarding } from "../components/Onboarding";
import { StockTimeline } from "../components/StockTimeline";
import { Tooltip } from "../components/Tooltip";
import { useRecentGames, useConfig } from "../hooks/queries";
import { formatGameDate } from "../hooks";

const FPS = 60;
const FIRST_PLAYABLE = -123; // Frames.FIRST_PLAYABLE from slippi-js

/** Convert a "M:SS" timestamp string back to a game frame number */
function timestampToFrame(ts: string): number {
  const parts = ts.split(":");
  if (parts.length !== 2) return 0;
  const minutes = parseInt(parts[0]!, 10);
  const seconds = parseInt(parts[1]!, 10);
  if (isNaN(minutes) || isNaN(seconds)) return 0;
  return (minutes * 60 + seconds) * FPS + FIRST_PLAYABLE;
}

/** Pre-process coaching markdown to convert [M:SS] timestamps into inline code spans */
function injectTimestampLinks(text: string): string {
  return text.replace(/\[(\d{1,2}:\d{2})\]/g, "`ts:$1`");
}

/** Create react-markdown components that render timestamp code spans as clickable buttons */
function makeTimestampComponents(replayPath: string): Components {
  return {
    code: ({ children }) => {
      const text = String(children);
      const match = text.match(/^ts:(\d{1,2}:\d{2})$/);
      if (match) {
        const ts = match[1]!;
        const frame = timestampToFrame(ts);
        const handleClick = async (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            await window.clippi.openInDolphinAtFrame(replayPath, frame);
          } catch (err) {
            console.error("Failed to open Dolphin at timestamp:", err);
          }
        };
        return (
          <button
            onClick={handleClick}
            className="timestamp-link"
            title={`Jump to ${ts} in replay`}
          >
            ▶ {ts}
          </button>
        );
      }
      return <code>{children}</code>;
    },
    a: ({ href, children }) => {
      // Prevent any remaining links from navigating the Electron renderer
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.preventDefault()}>
          {children}
        </a>
      );
    },
  };
}

interface RecentGame {
  id: number;
  playedAt: string | null;
  stage: string;
  playerCharacter: string;
  opponentCharacter: string;
  opponentTag: string;
  result: string;
  playerFinalStocks: number;
  opponentFinalStocks: number;
  neutralWinRate: number;
  lCancelRate: number;
  openingsPerKill: number;
  edgeguardSuccessRate: number;
  replayPath: string;
}

// Animated stat with count-up
function PulseStat({ value, label, color, index, tip }: {
  value: string;
  label: string;
  color: string;
  index: number;
  tip?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="stat-box"
    >
      <div className="stat-value" style={{ color }}>{value}</div>
      {tip ? (
        <Tooltip text={tip} position="bottom">
          <span className="stat-label">{label}</span>
        </Tooltip>
      ) : (
        <div className="stat-label">{label}</div>
      )}
    </motion.div>
  );
}

// Quick-glance stats from the last session
function SessionPulse({ games }: { games: RecentGame[] }) {
  if (games.length === 0) return null;

  const wins = games.filter((g) => g.result === "win").length;
  const losses = games.length - wins;
  const avgNeutral = games.reduce((s, g) => s + g.neutralWinRate, 0) / games.length;
  const avgLCancel = games.reduce((s, g) => s + g.lCancelRate, 0) / games.length;

  const stats = [
    { label: "Record", value: `${wins}W-${losses}L`, color: wins > losses ? "var(--green)" : wins < losses ? "var(--red)" : "var(--text)", tip: "Wins vs losses in your recent session" },
    { label: "Neutral WR", value: `${(avgNeutral * 100).toFixed(1)}%`, color: avgNeutral > 0.5 ? "var(--green)" : "var(--yellow)", tip: "How often you win the neutral game — first hit in an exchange. Above 50% means you're winning more openers than your opponent." },
    { label: "L-Cancel", value: `${(avgLCancel * 100).toFixed(1)}%`, color: avgLCancel > 0.85 ? "var(--green)" : "var(--yellow)", tip: "Percentage of aerial landings where you successfully L-cancelled. 85%+ is good, 95%+ is top-level." },
    { label: "Games", value: `${games.length}`, color: "var(--text)", tip: "Total games in this recent session" },
  ];

  return (
    <div className="session-pulse">
      {stats.map((s, i) => (
        <PulseStat key={s.label} value={s.value} label={s.label} color={s.color} index={i} tip={s.tip} />
      ))}
    </div>
  );
}

export function Dashboard({ refreshKey }: { refreshKey: number }) {
  const { data: games = [], isLoading: loading, refetch } = useRecentGames(20);
  const { data: config } = useConfig();
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Discovery / Oracle state
  const [discovery, setDiscovery] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryStream, setDiscoveryStream] = useState("");
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Per-game analysis state
  const [expandedGame, setExpandedGame] = useState<number | null>(null);
  const [analysisCache, setAnalysisCache] = useState<Record<number, string>>({});
  const [analyzingGame, setAnalyzingGame] = useState<number | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<{ pending: number; processing: boolean } | null>(null);
  const [dolphinError, setDolphinError] = useState<string | null>(null);
  const [launchingDolphin, setLaunchingDolphin] = useState<number | null>(null);
  // Streaming state: text accumulating in real-time
  const [streamingText, setStreamingText] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);

  const handleWatchReplay = async (e: React.MouseEvent, game: RecentGame) => {
    e.stopPropagation();
    setDolphinError(null);
    setLaunchingDolphin(game.id);
    try {
      await window.clippi.openInDolphin(game.replayPath);
    } catch (err: unknown) {
      setDolphinError(err instanceof Error ? err.message : String(err));
    }
    setLaunchingDolphin(null);
  };

  useEffect(() => {
    refetch();
  }, [refreshKey, refetch]);

  const handleGameClick = async (game: RecentGame) => {
    if (expandedGame === game.id) {
      setExpandedGame(null);
      return;
    }

    setExpandedGame(game.id);
    setAnalyzeError(null);
    setDolphinError(null);

    if (analysisCache[game.id]) return;

    setAnalyzingGame(game.id);
    setStreamingText("");
    setIsStreaming(false);
    setQueueStatus(null);

    // Fetch queue status for progress feedback
    window.clippi.getQueueStatus().then(setQueueStatus).catch(() => {});

    // Subscribe to streaming chunks
    const unsubStream = window.clippi.onAnalysisStream((chunk: string) => {
      setIsStreaming(true);
      setStreamingText((prev) => prev + chunk);
    });
    const unsubEnd = window.clippi.onAnalysisStreamEnd(() => {
      setIsStreaming(false);
    });

    try {
      const target = config?.connectCode || config?.targetPlayer || "";
      const result = await window.clippi.analyzeReplays([game.replayPath], target);
      // Cache the final complete text (from the invoke return value)
      setAnalysisCache((prev) => ({ ...prev, [game.id]: result }));
      setStreamingText("");
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : String(err));
      setStreamingText("");
    } finally {
      unsubStream();
      unsubEnd();
      setIsStreaming(false);
      setAnalyzingGame(null);
      setQueueStatus(null);
    }
  };

  const handleRunDiscovery = async () => {
    setIsDiscovering(true);
    setDiscoveryStream("");
    setDiscovery(null);
    setDiscoveryError(null);

    const unsubStream = window.clippi.onAnalysisStream((chunk: string) => {
      setDiscoveryStream((prev) => prev + chunk);
    });
    const unsubEnd = window.clippi.onAnalysisStreamEnd(() => {
      setIsDiscovering(false);
    });

    try {
      const result = await window.clippi.analyzeDiscovery();
      setDiscovery(result);
      setDiscoveryStream("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Discovery failed:", err);
      if (msg.includes("minimum 5 games")) {
        setDiscoveryError("Deep Discovery requires at least 5 imported games. Import more replays and try again.");
      } else {
        setDiscoveryError(msg);
      }
    } finally {
      unsubStream();
      unsubEnd();
      setIsDiscovering(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" style={{ margin: "0 auto 16px" }} />
        Loading...
      </div>
    );
  }

  if (games.length === 0 && !onboardingDismissed) {
    return (
      <Onboarding
        onComplete={() => {
          setOnboardingDismissed(true);
          refetch();
        }}
        onSkip={() => setOnboardingDismissed(true)}
      />
    );
  }

  if (games.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, color: "var(--accent)" }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <line x1="9" y1="8" x2="17" y2="8" />
            <line x1="9" y1="12" x2="14" y2="12" />
          </svg>
        </div>
        <h2>No replays found</h2>
        <p>Go to Settings to configure your replay folder and import your games.</p>
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
          <h1>Coaching</h1>
          <p>Select a game for AI coaching analysis</p>
        </div>
      </motion.div>

      <SessionPulse games={games} />

      {/* MAGI Discovery (The Oracle) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        style={{ marginBottom: 32 }}
      >
        <div className="card discovery-card" style={{ 
          background: 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.08) 0%, rgba(var(--accent-rgb), 0.02) 100%)',
          border: '1px solid rgba(var(--accent-rgb), 0.2)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ 
                width: '42px', 
                height: '42px', 
                borderRadius: '10px', 
                background: 'rgba(var(--accent-rgb), 0.1)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'var(--accent)',
                boxShadow: '0 0 20px rgba(var(--accent-rgb), 0.2)'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12L2.1 12.1"/><path d="M12 12L19 19"/><path d="M12 12V22"/>
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent)', marginBottom: '4px' }}>Deep Discovery</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '400px' }}>
                  MAGI is mining your entire career for hidden mathematical truths and non-obvious win conditions.
                </p>
              </div>
            </div>
            {!discovery && !isDiscovering && (
              <button 
                className="btn btn-primary" 
                onClick={handleRunDiscovery}
                style={{ 
                  padding: '10px 20px', 
                  fontSize: '13px', 
                  fontWeight: 700,
                  boxShadow: '0 0 15px rgba(var(--accent-rgb), 0.3)'
                }}
              >
                Synthesize Career Narrative
              </button>
            )}
          </div>

          {discoveryError && (
            <div style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(255,60,60,0.08)', border: '1px solid var(--red)', borderRadius: '6px', color: 'var(--red)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
              {discoveryError}
            </div>
          )}

          {(isDiscovering || discovery || discoveryStream) && (
            <div style={{ marginTop: '24px', padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(var(--accent-rgb), 0.1)' }}>
              {isDiscovering && !discoveryStream && (
                <div className="flex items-center gap-3">
                  <div className="spinner" />
                  <span className="text-sm text-dim animate-pulse">Running correlation matrix and situational anomaly filters...</span>
                </div>
              )}
              <div className="analysis-text prose prose-invert max-w-none" style={{ fontSize: '14px', lineHeight: '1.6' }}>
                <Markdown>{discovery || discoveryStream}</Markdown>
                {isDiscovering && <span className="streaming-cursor" />}
              </div>
              {discovery && !isDiscovering && (
                <button className="btn btn-sm mt-4" onClick={handleRunDiscovery}>Refresh Discovery</button>
              )}
            </div>
          )}
          
          {/* Decorative elements */}
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.05, pointerEvents: 'none' }}>
            <svg width="120" height="120" viewBox="0 0 24 24" fill="var(--accent)">
              <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
            </svg>
          </div>
        </div>
      </motion.div>

      <div className="game-list">
        {games.map((game, index) => {
          const isExpanded = expandedGame === game.id;
          const isAnalyzing = analyzingGame === game.id;
          const cached = analysisCache[game.id];

          return (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={`game-card ${isExpanded ? "expanded" : ""} ${game.result === "win" ? "game-card-win" : "game-card-loss"}`}>
                <div className="game-card-header" role="button" tabIndex={0} onClick={() => handleGameClick(game)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleGameClick(game); } }}>
                  <div className="game-card-result">
                    <span className={game.result === "win" ? "result-badge win" : "result-badge loss"}>
                      {game.result === "win" ? "W" : "L"}
                    </span>
                    <span className="stock-count">{game.playerFinalStocks}-{game.opponentFinalStocks}</span>
                  </div>
                  <div className="game-card-matchup">
                    <div className="game-card-chars">
                      {game.playerCharacter} vs {game.opponentCharacter}
                    </div>
                    <div className="game-card-opponent">
                      vs {game.opponentTag}
                    </div>
                  </div>
                  <div className="game-card-details">
                    <span className="game-card-stage">{game.stage}</span>
                    <span className="game-card-date">
                      {formatGameDate(game.playedAt)}
                    </span>
                  </div>
                  <div className="game-card-stats">
                    <div className="mini-stat">
                      <span className="mini-stat-value" style={{
                        color: game.neutralWinRate > 0.5 ? "var(--green)" : "var(--red)",
                      }}>
                        {(game.neutralWinRate * 100).toFixed(0)}%
                      </span>
                      <Tooltip text="Neutral win rate — how often you won the first hit in an exchange" position="top">
                        <span className="mini-stat-label">Neutral</span>
                      </Tooltip>
                    </div>
                    <div className="mini-stat">
                      <span className="mini-stat-value" style={{
                        color: Number.isFinite(game.openingsPerKill) && game.openingsPerKill <= 4 ? "var(--green)" : game.openingsPerKill <= 7 ? "var(--yellow)" : "var(--red)",
                      }}>
                        {Number.isFinite(game.openingsPerKill) ? game.openingsPerKill.toFixed(1) : "\u2014"}
                      </span>
                      <Tooltip text="Openings per kill — how many neutral wins it takes to get a stock. Lower is better (fewer openings needed)." position="top">
                        <span className="mini-stat-label">Op/Kill</span>
                      </Tooltip>
                    </div>
                    <div className="mini-stat">
                      <span className="mini-stat-value" style={{
                        color: game.lCancelRate > 0.85 ? "var(--green)" : game.lCancelRate > 0.7 ? "var(--yellow)" : "var(--red)",
                      }}>
                        {(game.lCancelRate * 100).toFixed(0)}%
                      </span>
                      <Tooltip text="L-cancel success rate — percentage of aerials landing with a successful L-cancel input" position="top">
                        <span className="mini-stat-label">L-Cancel</span>
                      </Tooltip>
                    </div>
                    <div className="mini-stat">
                      <span className="mini-stat-value" style={{
                        color: game.edgeguardSuccessRate > 0.6 ? "var(--green)" : game.edgeguardSuccessRate > 0.3 ? "var(--yellow)" : "var(--red)",
                      }}>
                        {(game.edgeguardSuccessRate * 100).toFixed(0)}%
                      </span>
                      <Tooltip text="Edgeguard success rate — how often your offstage attempts result in a stock taken" position="top">
                        <span className="mini-stat-label">Edgeguard</span>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="game-card-chevron">
                    <motion.span
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.25 }}
                      style={{ display: "inline-block" }}
                    >
                      {"\u25BC"}
                    </motion.span>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      className="game-card-analysis"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <button
                          className="btn"
                          onClick={(e) => handleWatchReplay(e, game)}
                          disabled={launchingDolphin === game.id}
                          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                          {launchingDolphin === game.id ? "Launching..." : "Watch Replay"}
                        </button>
                        {dolphinError && expandedGame === game.id && (
                          <span style={{ color: "var(--red)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{dolphinError}</span>
                        )}
                      </div>
                      <StockTimeline
                        replayPath={game.replayPath}
                        playerCharacter={game.playerCharacter}
                        opponentCharacter={game.opponentCharacter}
                      />
                      {analyzingGame === game.id && !isStreaming && !streamingText && !cached && (
                        <div className="analyze-loading">
                          <div className="spinner" />
                          <span>{queueStatus && queueStatus.pending > 0 ? `Queued (position ${queueStatus.pending})...` : "Starting analysis..."}</span>
                        </div>
                      )}
                      {analyzingGame === game.id && (isStreaming || streamingText) && !cached && (
                        <div className="analysis-text">
                          <Markdown components={makeTimestampComponents(game.replayPath)}>
                            {injectTimestampLinks(streamingText)}
                          </Markdown>
                          {isStreaming && (
                            <span className="streaming-cursor" />
                          )}
                        </div>
                      )}
                      {analyzeError && expandedGame === game.id && !cached && !streamingText && (
                        <p style={{ color: "var(--red)", fontSize: 13, fontFamily: "var(--font-mono)" }}>{analyzeError}</p>
                      )}
                      {cached && (
                        <div className="analysis-text">
                          <Markdown components={makeTimestampComponents(game.replayPath)}>
                            {injectTimestampLinks(cached)}
                          </Markdown>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
