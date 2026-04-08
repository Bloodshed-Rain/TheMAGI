import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Markdown from "react-markdown";
import { AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown, Trophy, AlertTriangle, Map, User, Compass, MessageSquare } from "lucide-react";
import { Onboarding } from "../components/Onboarding";
import { CoachingModal } from "../components/CoachingModal";
import { Tooltip } from "../components/Tooltip";
import { useRecentGames, useOverallRecord, useDashboardHighlights, useRecentHighlights } from "../hooks/queries";
import { HighlightCards } from "../components/HighlightCards";
import { formatGameDate } from "../hooks";

/** Returns a CSS color variable based on thresholds: good (green), ok (yellow), bad (red) */
function statColor(value: number, goodAbove: number, okAbove?: number): string {
  if (value > goodAbove) return "var(--green)";
  if (okAbove !== undefined && value > okAbove) return "var(--yellow)";
  return "var(--red)";
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

// ── Trend Arrow ──────────────────────────────────────────────────────

function TrendArrow({ delta, invert }: { delta: number; invert?: boolean }) {
  const threshold = 0.005;
  const improving = invert ? delta < -threshold : delta > threshold;
  const declining = invert ? delta > threshold : delta < -threshold;

  if (!improving && !declining) {
    return <span className="trend-arrow trend-flat" title="Stable">&mdash;</span>;
  }

  return improving ? (
    <span className="trend-arrow trend-up" title={`+${(Math.abs(delta) * 100).toFixed(1)}%`}>
      <ChevronUp size={12} strokeWidth={3} />
    </span>
  ) : (
    <span className="trend-arrow trend-down" title={`-${(Math.abs(delta) * 100).toFixed(1)}%`}>
      <ChevronDown size={12} strokeWidth={3} />
    </span>
  );
}

// ── Stat Pulse with Trend Arrows ─────────────────────────────────────

interface PulseStatProps {
  value: string;
  label: string;
  color: string;
  index: number;
  tip?: string;
  delta?: number;
  invertDelta?: boolean;
}

function PulseStat({ value, label, color, index, tip, delta, invertDelta }: PulseStatProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="stat-box"
    >
      <div className="stat-value-row">
        <span className="stat-value" style={{ color }}>{value}</span>
        {delta !== undefined && <TrendArrow delta={delta} invert={invertDelta} />}
      </div>
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

// ── Highlight Card ───────────────────────────────────────────────────

function HighlightCard({ title, value, sub, color, icon, index }: {
  title: string;
  value: string;
  sub: string;
  color: string;
  icon: React.ReactNode;
  index: number;
}) {
  return (
    <motion.div
      className="dash-highlight-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="dash-highlight-icon" style={{ color }}>{icon}</div>
      <div className="dash-highlight-body">
        <div className="dash-highlight-title">{title}</div>
        <div className="dash-highlight-value" style={{ color }}>{value}</div>
        <div className="dash-highlight-sub">{sub}</div>
      </div>
    </motion.div>
  );
}

// ── Recent Trend AI Insight ──────────────────────────────────────────

/** Build a compact stat summary for the LLM from recent games */
function buildRecentSummary(games: RecentGame[]): string {
  const wins = games.filter(g => g.result === "win").length;
  const losses = games.filter(g => g.result === "loss").length;
  const avg = (fn: (g: RecentGame) => number) =>
    (games.reduce((s, g) => s + fn(g), 0) / games.length);

  const matchups = games.map(g => `${g.playerCharacter} vs ${g.opponentCharacter} (${g.result})`).join(", ");

  return [
    `Last ${games.length} games summary:`,
    `Record: ${wins}W-${losses}L`,
    `Matchups played: ${matchups}`,
    "",
    "Average stats across these games:",
    `- Neutral win rate: ${(avg(g => g.neutralWinRate) * 100).toFixed(1)}%`,
    `- L-cancel rate: ${(avg(g => g.lCancelRate) * 100).toFixed(1)}%`,
    `- Edgeguard success: ${(avg(g => g.edgeguardSuccessRate) * 100).toFixed(1)}%`,
    `- Openings per kill: ${avg(g => g.openingsPerKill).toFixed(1)}`,
    "",
    "Individual game results:",
    ...games.map((g, i) =>
      `  Game ${i + 1}: ${g.playerCharacter} vs ${g.opponentCharacter} (${g.opponentTag}) on ${g.stage} — ${g.result.toUpperCase()} ${g.playerFinalStocks}-${g.opponentFinalStocks} | Neutral ${(g.neutralWinRate * 100).toFixed(0)}%, L-Cancel ${(g.lCancelRate * 100).toFixed(0)}%, Edge ${(g.edgeguardSuccessRate * 100).toFixed(0)}%`
    ),
    "",
    "Give a concise dashboard summary: overall trajectory, what's working, what needs work, and one thing to focus on next session. Do NOT analyze each game individually — synthesize across all of them.",
  ].join("\n");
}

function RecentInsight({ games }: { games: RecentGame[] }) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameCountAtLastRun, setGameCountAtLastRun] = useState(0);
  const runningRef = useRef(false);

  const recentFive = useMemo(() => games.slice(0, 5), [games]);
  const gameKey = useMemo(() => recentFive.map(g => g.id).join(","), [recentFive]);

  const runInsight = useCallback(async () => {
    if (recentFive.length < 3 || runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setInsight(null);
    setError(null);

    try {
      const summary = buildRecentSummary(recentFive);
      const result = await window.clippi.analyzeTrends(summary);
      setInsight(result);
      setGameCountAtLastRun(games.length);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  }, [recentFive, games.length]);

  // Auto-run when games change and we haven't analyzed this set yet
  useEffect(() => {
    if (recentFive.length >= 3 && !insight && !loading && games.length !== gameCountAtLastRun) {
      runInsight();
    }
  }, [gameKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (recentFive.length < 3) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      <div className="card dash-insight-card">
        <div className="dash-insight-header">
          <div className="dash-insight-icon">
            <Compass size={18} />
          </div>
          <div>
            <div className="dash-insight-title">Recent Trend Analysis</div>
            <div className="dash-insight-sub">Last {recentFive.length} games</div>
          </div>
          {insight && !loading && (
            <button className="btn dash-insight-refresh" onClick={runInsight}>Refresh</button>
          )}
        </div>

        {loading && (
          <div className="analyze-loading" style={{ padding: "20px 0" }}>
            <div className="spinner" />
            <span>Analyzing recent games...</span>
          </div>
        )}

        {error && (
          <p className="coaching-error" style={{ margin: "12px 0 0" }}>{error}</p>
        )}

        {insight && (
          <div className="dash-insight-body">
            <Markdown>{insight}</Markdown>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Compact Game Row ────────────────────────────────────────────────

function CompactGameRow({ game, index, onClick }: { game: RecentGame; index: number; onClick: () => void }) {
  return (
    <motion.div
      className="dash-game-row"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.12), duration: 0.2 }}
    >
      <span className={`result-badge ${game.result === "win" ? "win" : game.result === "loss" ? "loss" : "draw"}`}>
        {game.result === "win" ? "W" : game.result === "loss" ? "L" : "D"}
      </span>
      <span className="dash-game-stocks">{game.playerFinalStocks}-{game.opponentFinalStocks}</span>
      <span className="dash-game-matchup">
        {game.playerCharacter} <span className="dash-game-vs">vs</span> {game.opponentCharacter}
      </span>
      <span className="dash-game-opponent">{game.opponentTag}</span>
      <span className="dash-game-stage">{game.stage}</span>
      <span className="dash-game-stat" style={{ color: statColor(game.neutralWinRate, 0.5) }}>
        {(game.neutralWinRate * 100).toFixed(0)}%
      </span>
      <span className="dash-game-stat" style={{ color: statColor(game.lCancelRate, 0.85, 0.7) }}>
        {(game.lCancelRate * 100).toFixed(0)}%
      </span>
      <span className="dash-game-stat" style={{ color: statColor(game.edgeguardSuccessRate, 0.6, 0.3) }}>
        {(game.edgeguardSuccessRate * 100).toFixed(0)}%
      </span>
      <span className="dash-game-date">{formatGameDate(game.playedAt)}</span>
    </motion.div>
  );
}

// ── Icons ────────────────────────────────────────────────────────

const TrophyIcon = <Trophy size={18} />;
const AlertIcon = <AlertTriangle size={18} />;
const MapIcon = <Map size={18} />;
const UserIcon = <User size={18} />;

// ── Main Dashboard ───────────────────────────────────────────────────

export function Dashboard({ refreshKey }: { refreshKey: number }) {
  const navigate = useNavigate();
  const { data: games = [], isLoading: loading, refetch } = useRecentGames(100);
  const { data: record, refetch: refetchRecord } = useOverallRecord();
  const { data: highlights, refetch: refetchHighlights } = useDashboardHighlights();
  const { data: recentHighlights = [] } = useRecentHighlights(10);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [coaching, setCoaching] = useState<{ id: number; title: string; replayPath: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const INITIAL_COUNT = 10;

  useEffect(() => {
    refetch();
    refetchRecord();
    refetchHighlights();
  }, [refreshKey, refetch, refetchRecord, refetchHighlights]);

  const avgNeutral = useMemo(() => games.length ? games.reduce((s, g) => s + g.neutralWinRate, 0) / games.length : 0, [games]);
  const avgLCancel = useMemo(() => games.length ? games.reduce((s, g) => s + g.lCancelRate, 0) / games.length : 0, [games]);
  const avgEdgeguard = useMemo(() => games.length ? games.reduce((s, g) => s + g.edgeguardSuccessRate, 0) / games.length : 0, [games]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
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
          <MessageSquare size={64} strokeWidth={1.2} stroke="var(--accent)" />
        </div>
        <h2>No replays found</h2>
        <p>Go to Settings to configure your replay folder and import your games.</p>
      </div>
    );
  }

  const wins = record?.wins ?? 0;
  const losses = record?.losses ?? 0;
  const recordColor = wins > losses ? "var(--green)" : wins < losses ? "var(--red)" : "var(--text)";

  const trends = highlights?.trends;

  return (
    <div>
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="page-header">
          <h1>Dashboard</h1>
          <p>
            {record?.totalGames ?? games.length} games played
            {highlights?.streak
              ? highlights.streak > 0
                ? ` \u00B7 ${highlights.streak} game win streak`
                : ` \u00B7 ${Math.abs(highlights.streak)} game losing streak`
              : ""
            }
          </p>
        </div>
      </motion.div>

      {/* Stat Pulse with Trend Arrows */}
      <div className="session-pulse">
        <PulseStat
          value={`${wins}W-${losses}L`}
          label="Record"
          color={recordColor}
          index={0}
          tip="Overall win/loss record across all games"
        />
        <PulseStat
          value={`${(avgNeutral * 100).toFixed(1)}%`}
          label="Neutral WR"
          color={statColor(avgNeutral, 0.5)}
          index={1}
          tip="How often you win the neutral game — first hit in an exchange"
          delta={trends?.neutralWinRate}
        />
        <PulseStat
          value={`${(avgLCancel * 100).toFixed(1)}%`}
          label="L-Cancel"
          color={statColor(avgLCancel, 0.85)}
          index={2}
          tip="Percentage of aerial landings where you successfully L-cancelled"
          delta={trends?.lCancelRate}
        />
        <PulseStat
          value={`${(avgEdgeguard * 100).toFixed(1)}%`}
          label="Edgeguard"
          color={statColor(avgEdgeguard, 0.6, 0.3)}
          index={3}
          tip="Edgeguard success rate — how often your offstage attempts result in a stock"
          delta={trends?.edgeguardSuccessRate}
        />
      </div>

      {/* Highlight Cards */}
      {highlights && (
        <div className="dash-highlights-grid">
          {highlights.bestCharacter && (
            <HighlightCard
              title="Best Character"
              value={highlights.bestCharacter.character}
              sub={`${(highlights.bestCharacter.winRate * 100).toFixed(0)}% WR \u00B7 ${highlights.bestCharacter.games} games`}
              color="var(--green)"
              icon={UserIcon}
              index={0}
            />
          )}
          {highlights.bestMatchup && (
            <HighlightCard
              title="Best Matchup"
              value={`vs ${highlights.bestMatchup.opponentCharacter}`}
              sub={`${(highlights.bestMatchup.winRate * 100).toFixed(0)}% WR \u00B7 ${highlights.bestMatchup.games} games`}
              color="var(--green)"
              icon={TrophyIcon}
              index={1}
            />
          )}
          {highlights.worstMatchup && (
            <HighlightCard
              title="Worst Matchup"
              value={`vs ${highlights.worstMatchup.opponentCharacter}`}
              sub={`${(highlights.worstMatchup.winRate * 100).toFixed(0)}% WR \u00B7 ${highlights.worstMatchup.games} games`}
              color="var(--red)"
              icon={AlertIcon}
              index={2}
            />
          )}
          {highlights.bestStage && (
            <HighlightCard
              title="Best Stage"
              value={highlights.bestStage.stage}
              sub={`${(highlights.bestStage.winRate * 100).toFixed(0)}% WR \u00B7 ${highlights.bestStage.games} games`}
              color="var(--accent)"
              icon={MapIcon}
              index={3}
            />
          )}
        </div>
      )}

      {/* Recent Trend AI Insight */}
      <RecentInsight games={games} />

      {/* Recent Highlights */}
      {recentHighlights.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="card"
          style={{ padding: "16px" }}
        >
          <HighlightCards highlights={recentHighlights} maxVisible={5} />
        </motion.div>
      )}

      {/* Recent Games — Compact List */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        <div className="dash-recent-header">
          <h2 className="dash-section-title">Recent Games</h2>
        </div>
        <div className="card dash-game-list">
          <div className="dash-game-header">
            <span />
            <span />
            <span>Matchup</span>
            <span>Opponent</span>
            <span>Stage</span>
            <Tooltip text="Neutral win rate — first hit in an exchange. Above 50% = winning neutral." position="bottom"><span className="dash-col-right">Neut</span></Tooltip>
            <Tooltip text="L-cancel success rate. Target: above 90% for consistent tech skill." position="bottom"><span className="dash-col-right">L-C</span></Tooltip>
            <Tooltip text="Edgeguard rate — how often offstage attempts result in a kill." position="bottom"><span className="dash-col-right">Edge</span></Tooltip>
            <span className="dash-col-right">Date</span>
          </div>
          {(showAll ? games : games.slice(0, INITIAL_COUNT)).map((game, index) => (
            <CompactGameRow
              key={game.id}
              game={game}
              index={index}
              onClick={() => navigate(`/game/${game.id}`)}
            />
          ))}
          {!showAll && games.length > INITIAL_COUNT && (
            <div className="dash-show-more">
              <button className="btn" onClick={() => setShowAll(true)}>
                Show All ({games.length} games)
              </button>
            </div>
          )}
          {showAll && games.length > INITIAL_COUNT && (
            <div className="dash-show-more">
              <button className="btn" onClick={() => setShowAll(false)}>
                Show Less
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Game Analysis Modal */}
      <AnimatePresence>
        {coaching && (
          <CoachingModal
            isOpen
            onClose={() => setCoaching(null)}
            scope="game"
            id={coaching.id}
            title={coaching.title}
            replayPath={coaching.replayPath}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
