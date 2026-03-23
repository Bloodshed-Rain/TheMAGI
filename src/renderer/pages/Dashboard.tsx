import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Markdown, { type Components } from "react-markdown";
import { useStagger, useGlitchText } from "../hooks";
import { Onboarding } from "../components/Onboarding";
import { StockTimeline } from "../components/StockTimeline";

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

/** Pre-process coaching markdown to convert [M:SS] timestamps into clickable links */
function injectTimestampLinks(text: string): string {
  // Convert [M:SS] patterns into markdown links: [▶ M:SS](timestamp:M:SS)
  return text.replace(/\[(\d{1,2}:\d{2})\]/g, "[▶ $1](timestamp:$1)");
}

/** Create react-markdown components that render timestamp links as clickable buttons */
function makeTimestampComponents(replayPath: string): Components {
  return {
    a: ({ href, children }) => {
      if (href?.startsWith("timestamp:")) {
        const ts = href.slice("timestamp:".length);
        const frame = timestampToFrame(ts);
        const handleClick = async (e: React.MouseEvent) => {
          e.preventDefault();
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
            {children}
          </button>
        );
      }
      return <a href={href}>{children}</a>;
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
function PulseStat({ value, label, color, index }: {
  value: string;
  label: string;
  color: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="stat-box"
      style={{ textAlign: "center", position: "relative" }}
    >
      <div className="stat-value" style={{ color, fontSize: 24 }}>{value}</div>
      <div className="stat-label">{label}</div>
    </motion.div>
  );
}

// Quick-glance stats from the last session -- asymmetric bento
function SessionPulse({ games }: { games: RecentGame[] }) {
  if (games.length === 0) return null;

  const wins = games.filter((g) => g.result === "win").length;
  const losses = games.length - wins;
  const avgNeutral = games.reduce((s, g) => s + g.neutralWinRate, 0) / games.length;
  const avgLCancel = games.reduce((s, g) => s + g.lCancelRate, 0) / games.length;

  const stats = [
    { label: "Record", value: `${wins}W-${losses}L`, color: wins > losses ? "var(--green)" : wins < losses ? "var(--red)" : "var(--text)" },
    { label: "Neutral WR", value: `${(avgNeutral * 100).toFixed(1)}%`, color: avgNeutral > 0.5 ? "var(--green)" : "var(--yellow)" },
    { label: "L-Cancel", value: `${(avgLCancel * 100).toFixed(1)}%`, color: avgLCancel > 0.85 ? "var(--green)" : "var(--yellow)" },
    { label: "Games", value: `${games.length}`, color: "var(--text)" },
  ];

  return (
    <div className="session-pulse">
      {stats.map((s, i) => (
        <PulseStat key={s.label} value={s.value} label={s.label} color={s.color} index={i} />
      ))}
    </div>
  );
}

export function Dashboard({ refreshKey }: { refreshKey: number }) {
  const [games, setGames] = useState<RecentGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const title = useGlitchText("COACHING", 500);

  // Per-game analysis state
  const [expandedGame, setExpandedGame] = useState<number | null>(null);
  const [analysisCache, setAnalysisCache] = useState<Record<number, string>>({});
  const [analyzingGame, setAnalyzingGame] = useState<number | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
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

  const stagger = useStagger(50);

  const load = useCallback(async () => {
    try {
      const g = await window.clippi.getRecentGames(20);
      setGames(g);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

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
    setIsStreaming(true);

    // Subscribe to streaming chunks
    const unsubStream = window.clippi.onAnalysisStream((chunk: string) => {
      setStreamingText((prev) => prev + chunk);
    });
    const unsubEnd = window.clippi.onAnalysisStreamEnd(() => {
      setIsStreaming(false);
    });

    try {
      const config = await window.clippi.loadConfig();
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
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" style={{ margin: "0 auto 16px" }} />
        INITIALIZING MAGI SYSTEMS...
      </div>
    );
  }

  if (games.length === 0 && !onboardingDismissed) {
    return (
      <Onboarding
        onComplete={() => {
          setOnboardingDismissed(true);
          load();
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
        <h2>NO REPLAYS DETECTED</h2>
        <p>Navigate to Settings to configure your replay folder and begin import sequence.</p>
      </div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="page-header">
          <h1>{title}</h1>
          <p>// SELECT ANY ENGAGEMENT FOR AI TACTICAL ANALYSIS</p>
        </div>
      </motion.div>

      <SessionPulse games={games} />

      <div className="game-list">
        {games.map((game, index) => {
          const isExpanded = expandedGame === game.id;
          const isAnalyzing = analyzingGame === game.id;
          const cached = analysisCache[game.id];

          return (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
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
                      {game.playedAt ? new Date(game.playedAt).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <div className="game-card-stats">
                    <div className="mini-stat">
                      <span className="mini-stat-value" style={{
                        color: game.neutralWinRate > 0.5 ? "var(--green)" : "var(--red)",
                      }}>
                        {(game.neutralWinRate * 100).toFixed(0)}%
                      </span>
                      <span className="mini-stat-label">Neutral</span>
                    </div>
                    <div className="mini-stat">
                      <span className="mini-stat-value" style={{
                        color: Number.isFinite(game.openingsPerKill) && game.openingsPerKill <= 4 ? "var(--green)" : game.openingsPerKill <= 7 ? "var(--yellow)" : "var(--red)",
                      }}>
                        {Number.isFinite(game.openingsPerKill) ? game.openingsPerKill.toFixed(1) : "—"}
                      </span>
                      <span className="mini-stat-label">Op/Kill</span>
                    </div>
                    <div className="mini-stat">
                      <span className="mini-stat-value" style={{
                        color: game.lCancelRate > 0.85 ? "var(--green)" : game.lCancelRate > 0.7 ? "var(--yellow)" : "var(--red)",
                      }}>
                        {(game.lCancelRate * 100).toFixed(0)}%
                      </span>
                      <span className="mini-stat-label">L-Cancel</span>
                    </div>
                    <div className="mini-stat">
                      <span className="mini-stat-value" style={{
                        color: game.edgeguardSuccessRate > 0.6 ? "var(--green)" : game.edgeguardSuccessRate > 0.3 ? "var(--yellow)" : "var(--red)",
                      }}>
                        {(game.edgeguardSuccessRate * 100).toFixed(0)}%
                      </span>
                      <span className="mini-stat-label">Edgeguard</span>
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
                          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                          {launchingDolphin === game.id ? "LAUNCHING..." : "WATCH REPLAY"}
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
                      {isAnalyzing && !isStreaming && !streamingText && analyzingGame === game.id && (
                        <div className="analyze-loading">
                          <div className="spinner" />
                          <span>MAGI ANALYZING ENGAGEMENT...</span>
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
