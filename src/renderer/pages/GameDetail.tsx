import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useGameDetail, useGameHighlights } from "../hooks/queries";
import { StockTimeline } from "../components/StockTimeline";
import { HighlightCards } from "../components/HighlightCards";
import { CoachingCards } from "../components/CoachingCards";
import { CoachingModal } from "../components/CoachingModal";
import { Tooltip } from "../components/Tooltip";

// ── Helpers ─────────────────────────────────────────────────────────

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fixed1(v: number): string {
  return v.toFixed(1);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(d: string | null): string {
  if (!d) return "Unknown";
  const date = new Date(d);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statColor(value: number, good: number, bad?: number): string {
  const lo = bad ?? good * 0.6;
  if (value >= good) return "var(--green)";
  if (value <= lo) return "var(--red)";
  return "var(--yellow)";
}

function entropyLabel(e: number): string {
  if (e >= 1.5) return "High";
  if (e >= 0.8) return "Medium";
  return "Low";
}

// ── Stat Grid Item ──────────────────────────────────────────────────

function StatItem({ label, value, tooltip, color }: {
  label: string;
  value: string;
  tooltip: string;
  color?: string;
}) {
  return (
    <Tooltip text={tooltip} position="top">
      <div className="gd-stat-item">
        <span className="gd-stat-label">{label}</span>
        <span className="gd-stat-value" style={color ? { color } : undefined}>{value}</span>
      </div>
    </Tooltip>
  );
}

// ── Signature Stats Panel ───────────────────────────────────────────

function SignatureStats({ json }: { json: string }) {
  let stats: Record<string, unknown>;
  try {
    stats = JSON.parse(json);
  } catch {
    return null;
  }

  const entries = Object.entries(stats).filter(
    ([, v]) => typeof v === "number" && v > 0 || typeof v === "object" && v !== null
  );

  if (entries.length === 0) return null;

  return (
    <div className="gd-section">
      <h3 className="gd-section-title">Signature Stats</h3>
      <p className="gd-sig-caveat">
        These are approximations from conversion sequences, not frame-perfect detections.
      </p>
      <div className="gd-sig-grid">
        {entries.map(([key, val]) => {
          if (typeof val === "number") {
            return (
              <div key={key} className="gd-sig-item">
                <span className="gd-sig-label">{formatStatKey(key)}</span>
                <span className="gd-sig-value">{typeof val === "number" && val % 1 !== 0 ? val.toFixed(1) : String(val)}</span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function formatStatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// ── Main Component ──────────────────────────────────────────────────

export function GameDetail({ refreshKey }: { refreshKey: number }) {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const id = gameId ? parseInt(gameId, 10) : null;

  const { data: game, isLoading, error } = useGameDetail(id);
  const { data: highlights = [] } = useGameHighlights(id);

  const [showCoachingModal, setShowCoachingModal] = useState(false);
  const [expandedAnalysis, setExpandedAnalysis] = useState<number | null>(null);

  // Force refetch when refreshKey changes
  void refreshKey;

  if (isLoading) {
    return (
      <div className="page-container gd-loading">
        <div className="spinner" />
        <span>Loading game...</span>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="page-container gd-error">
        <h2>Game not found</h2>
        <p>This game may have been deleted or doesn't exist.</p>
        <button className="btn" onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  const resultClass = game.result === "win" ? "win" : game.result === "loss" ? "loss" : "draw";

  return (
    <div className="page-container gd-page">
      {/* Back button */}
      <button className="gd-back" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} />
        Back
      </button>

      {/* Header */}
      <motion.div
        className="gd-header"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="gd-matchup-row">
          <span className={`result-badge ${resultClass}`}>
            {game.result === "win" ? "W" : game.result === "loss" ? "L" : "D"}
          </span>
          <h1 className="gd-matchup">
            {game.playerCharacter} <span className="gd-vs">vs</span> {game.opponentCharacter}
          </h1>
          <span className="gd-opponent">
            vs {game.opponentTag}
            {game.opponentConnectCode && <span className="gd-code"> ({game.opponentConnectCode})</span>}
          </span>
        </div>

        <div className="gd-meta-row">
          <span className="gd-meta-item">{game.stage}</span>
          <span className="gd-meta-sep" />
          <span className="gd-meta-item">{formatDuration(game.durationSeconds)}</span>
          <span className="gd-meta-sep" />
          <span className="gd-meta-item">{formatDate(game.playedAt)}</span>
          <span className="gd-meta-sep" />
          <span className="gd-meta-item">
            Stocks: <strong>{game.playerFinalStocks}</strong>-<strong>{game.opponentFinalStocks}</strong>
          </span>
          <span className="gd-meta-sep" />
          <span className="gd-meta-item">
            End: {game.playerFinalPercent}% — {game.opponentFinalPercent}%
          </span>
        </div>

        <div className="gd-actions">
          <button
            className="btn btn-accent"
            onClick={() => setShowCoachingModal(true)}
          >
            Get Coaching
          </button>
          <button
            className="btn"
            onClick={() => window.clippi.openInDolphin(game.replayPath)}
          >
            Watch Replay
          </button>
        </div>
      </motion.div>

      {/* Stock Timeline */}
      <motion.div
        className="gd-section"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.2 }}
      >
        <h3 className="gd-section-title">Stock Timeline</h3>
        <StockTimeline
          replayPath={game.replayPath}
          playerCharacter={game.playerCharacter}
          opponentCharacter={game.opponentCharacter}
        />
      </motion.div>

      {/* Core Stats */}
      <motion.div
        className="gd-section"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.2 }}
      >
        <h3 className="gd-section-title">Performance</h3>
        <div className="gd-stat-grid">
          <StatItem label="Neutral Win Rate" value={pct(game.neutralWinRate)} tooltip="First hit in each exchange. Above 50% = winning neutral." color={statColor(game.neutralWinRate, 0.5)} />
          <StatItem label="L-Cancel Rate" value={pct(game.lCancelRate)} tooltip="L-cancel success rate. Target: 90%+." color={statColor(game.lCancelRate, 0.9, 0.7)} />
          <StatItem label="Conversion Rate" value={pct(game.conversionRate)} tooltip="Openings that led to follow-up damage." color={statColor(game.conversionRate, 0.6, 0.3)} />
          <StatItem label="Openings/Kill" value={fixed1(game.openingsPerKill)} tooltip="Neutral wins needed per kill. Lower = better punish game." color={statColor(1 / Math.max(game.openingsPerKill, 0.01), 0.2)} />
          <StatItem label="Avg Dmg/Opening" value={fixed1(game.avgDamagePerOpening)} tooltip="Average damage dealt per neutral win." />
          <StatItem label="Kill Conversions" value={String(game.killConversions)} tooltip="Number of conversions that resulted in a stock." />
          <StatItem label="Counter Hits" value={String(game.counterHits)} tooltip="Times you hit opponent during their attack animation." />
          <StatItem label="Total Openings" value={String(game.totalOpenings)} tooltip="Total neutral wins." />
        </div>
      </motion.div>

      {/* Movement & Positioning */}
      <motion.div
        className="gd-section"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.2 }}
      >
        <h3 className="gd-section-title">Movement & Positioning</h3>
        <div className="gd-stat-grid">
          <StatItem label="Wavedashes" value={String(game.wavedashCount)} tooltip="Total wavedash count." />
          <StatItem label="Dash Dance Frames" value={String(game.dashDanceFrames)} tooltip="Frames spent dash dancing." />
          <StatItem label="Avg Stage Pos X" value={fixed1(game.avgStagePositionX)} tooltip="Average horizontal position. 0 = center stage." />
          <StatItem label="Platform Time" value={pct(game.timeOnPlatform)} tooltip="% of game time on platforms." />
          <StatItem label="Air Time" value={pct(game.timeInAir)} tooltip="% of game time in the air." />
          <StatItem label="Ledge Time" value={pct(game.timeAtLedge)} tooltip="% of game time at or near ledge." />
        </div>
      </motion.div>

      {/* Defense & Survivability */}
      <motion.div
        className="gd-section"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.2 }}
      >
        <h3 className="gd-section-title">Defense & Survivability</h3>
        <div className="gd-stat-grid">
          <StatItem label="Recovery Rate" value={pct(game.recoverySuccessRate)} tooltip="Successful recoveries / attempts." color={statColor(game.recoverySuccessRate, 0.7, 0.4)} />
          <StatItem label="Recovery Attempts" value={String(game.recoveryAttempts)} tooltip="Times knocked offstage." />
          <StatItem label="Avg Death %" value={`${fixed1(game.avgDeathPercent)}%`} tooltip="Average percent at death. Higher = better DI/survival." />
          <StatItem label="DI Survival" value={fixed1(game.diSurvivalScore)} tooltip="Estimated DI quality when surviving hits. Higher = better." color={statColor(game.diSurvivalScore, 0.7, 0.3)} />
          <StatItem label="DI Combo" value={fixed1(game.diComboScore)} tooltip="Estimated DI quality when escaping combos. Higher = better." color={statColor(game.diComboScore, 0.7, 0.3)} />
          <StatItem label="Dmg Taken" value={fixed1(game.totalDamageTaken)} tooltip="Total damage received." />
          <StatItem label="Power Shields" value={String(game.powerShieldCount)} tooltip="Frame-perfect shield inputs." />
        </div>
      </motion.div>

      {/* Edgeguards & Pressure */}
      <motion.div
        className="gd-section"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.2 }}
      >
        <h3 className="gd-section-title">Edgeguards & Pressure</h3>
        <div className="gd-stat-grid">
          <StatItem label="Edgeguard Rate" value={pct(game.edgeguardSuccessRate)} tooltip="Successful edgeguards / attempts." color={statColor(game.edgeguardSuccessRate, 0.6, 0.3)} />
          <StatItem label="Edgeguard Attempts" value={String(game.edgeguardAttempts)} tooltip="Times you went offstage to edgeguard." />
          <StatItem label="Shield Pressure" value={String(game.shieldPressureSequences)} tooltip="Multi-hit shield pressure sequences." />
          <StatItem label="Shield Avg Dmg" value={fixed1(game.shieldPressureAvgDamage)} tooltip="Average damage per shield pressure sequence." />
          <StatItem label="Shield Breaks" value={String(game.shieldBreaks)} tooltip="Times you broke opponent's shield." />
          <StatItem label="Shield Poke Rate" value={pct(game.shieldPokeRate)} tooltip="Hits that poked through partial shield." />
          <StatItem label="Dmg Dealt" value={fixed1(game.totalDamageDealt)} tooltip="Total damage dealt." />
        </div>
      </motion.div>

      {/* Mixup Entropy */}
      <motion.div
        className="gd-section"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.2 }}
      >
        <h3 className="gd-section-title">Mixup Variety</h3>
        <div className="gd-stat-grid">
          <StatItem label="Ledge Options" value={entropyLabel(game.ledgeEntropy)} tooltip={`Entropy: ${fixed1(game.ledgeEntropy)}. Higher = more varied ledge getup options.`} />
          <StatItem label="Tech Options" value={entropyLabel(game.knockdownEntropy)} tooltip={`Entropy: ${fixed1(game.knockdownEntropy)}. Higher = more varied knockdown tech choices.`} />
          <StatItem label="Shield Pressure" value={entropyLabel(game.shieldPressureEntropy)} tooltip={`Entropy: ${fixed1(game.shieldPressureEntropy)}. Higher = more varied shield pressure options.`} />
        </div>
      </motion.div>

      {/* Signature Stats */}
      {game.signatureJson && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.2 }}
        >
          <SignatureStats json={game.signatureJson} />
        </motion.div>
      )}

      {/* Highlights */}
      {highlights.length > 0 && (
        <motion.div
          className="gd-section"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.2 }}
        >
          <h3 className="gd-section-title">Highlights</h3>
          <HighlightCards
            highlights={highlights}
            replayPath={game.replayPath}
            maxVisible={20}
          />
        </motion.div>
      )}

      {/* Existing Coaching Analyses */}
      {game.coachingAnalyses.length > 0 && (
        <motion.div
          className="gd-section"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.2 }}
        >
          <h3 className="gd-section-title">Coaching Analyses</h3>
          <div className="gd-analyses">
            {game.coachingAnalyses.map((a) => (
              <div key={a.id} className="gd-analysis-card">
                <button
                  className="gd-analysis-header"
                  onClick={() => setExpandedAnalysis(expandedAnalysis === a.id ? null : a.id)}
                >
                  <span className="gd-analysis-meta">
                    {a.modelUsed} &middot; {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`gd-chevron ${expandedAnalysis === a.id ? "open" : ""}`}
                  />
                </button>
                <AnimatePresence>
                  {expandedAnalysis === a.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="gd-analysis-body">
                        <CoachingCards text={a.analysisText} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Coaching Modal */}
      <AnimatePresence>
        {showCoachingModal && (
          <CoachingModal
            isOpen
            onClose={() => setShowCoachingModal(false)}
            scope="game"
            id={game.id}
            title={`${game.playerCharacter} vs ${game.opponentCharacter} — ${game.stage}`}
            replayPath={game.replayPath}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
