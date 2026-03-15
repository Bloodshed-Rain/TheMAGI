import { useEffect, useState, useCallback } from "react";
import Markdown from "react-markdown";

interface RecentGame {
  id: number;
  playedAt: string | null;
  stage: string;
  playerCharacter: string;
  opponentCharacter: string;
  opponentTag: string;
  result: string;
  neutralWinRate: number;
  lCancelRate: number;
  replayPath: string;
}

export function Dashboard({ refreshKey }: { refreshKey: number }) {
  const [games, setGames] = useState<RecentGame[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-game analysis state
  const [expandedGame, setExpandedGame] = useState<number | null>(null);
  const [analysisCache, setAnalysisCache] = useState<Record<number, string>>({});
  const [analyzingGame, setAnalyzingGame] = useState<number | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

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

    if (analysisCache[game.id]) return;

    setAnalyzingGame(game.id);
    try {
      const config = await window.clippi.loadConfig();
      const target = config?.connectCode || config?.targetPlayer || "";
      const result = await window.clippi.analyzeReplays([game.replayPath], target);
      setAnalysisCache((prev) => ({ ...prev, [game.id]: result }));
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : String(err));
    }
    setAnalyzingGame(null);
  };

  if (loading) return <div className="loading">Loading...</div>;

  if (games.length === 0) {
    return (
      <div className="empty-state">
        <h2>No replays imported yet</h2>
        <p>Go to Settings to set your replay folder, then import your games.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Coaching</h1>
        <p>Click any game to get AI coaching analysis</p>
      </div>

      <div className="game-list">
        {games.map((game) => {
          const isExpanded = expandedGame === game.id;
          const isAnalyzing = analyzingGame === game.id;
          const cached = analysisCache[game.id];

          return (
            <div key={game.id} className={`game-card ${isExpanded ? "expanded" : ""}`}>
              <div className="game-card-header" onClick={() => handleGameClick(game)}>
                <div className="game-card-result">
                  <span className={game.result === "win" ? "result-badge win" : "result-badge loss"}>
                    {game.result === "win" ? "W" : "L"}
                  </span>
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
                    <span className="mini-stat-value">{(game.neutralWinRate * 100).toFixed(0)}%</span>
                    <span className="mini-stat-label">Neutral</span>
                  </div>
                  <div className="mini-stat">
                    <span className="mini-stat-value">{(game.lCancelRate * 100).toFixed(0)}%</span>
                    <span className="mini-stat-label">L-Cancel</span>
                  </div>
                </div>
                <div className="game-card-chevron">
                  {isExpanded ? "\u25B2" : "\u25BC"}
                </div>
              </div>

              {isExpanded && (
                <div className="game-card-analysis">
                  {isAnalyzing && (
                    <div className="analyze-loading">
                      <div className="spinner" />
                      <span>Coach-Clippi is reviewing this game...</span>
                    </div>
                  )}
                  {analyzeError && expandedGame === game.id && !cached && (
                    <p style={{ color: "var(--red)", fontSize: 13 }}>{analyzeError}</p>
                  )}
                  {cached && (
                    <div className="analysis-text">
                      <Markdown>{cached}</Markdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
