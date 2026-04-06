import { useEffect, useState, useMemo } from "react";
import { useTypewriter } from "../hooks";
import { motion, AnimatePresence } from "framer-motion";
import Markdown from "react-markdown";
import {
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart,
} from "recharts";
import { useRecentGames, useStageRecords } from "../hooks/queries";
import { Tooltip } from "../components/Tooltip";
import { CoachingModal } from "../components/CoachingModal";

interface RecentGame {
  playedAt: string | null;
  playerCharacter: string;
  opponentCharacter: string;
  opponentTag: string;
  result: string;
  neutralWinRate: number;
  lCancelRate: number;
  openingsPerKill: number;
  avgDamagePerOpening: number;
  conversionRate: number;
  avgDeathPercent: number;
  powerShieldCount: number;
  edgeguardSuccessRate: number;
  recoverySuccessRate: number;
}

interface MetricConfig {
  key: keyof RecentGame;
  label: string;
  tip: string;
  format: (v: number) => string;
  color: string;
  isPercent: boolean;
  higherBetter: boolean;
  maxValue?: number;
}

const METRICS: MetricConfig[] = [
  { key: "neutralWinRate", label: "Neutral Win Rate", tip: "How often you win the first hit in an exchange. Above 50% means you're outplaying in neutral.", format: (v) => `${(v * 100).toFixed(1)}%`, color: "#18FF6D", isPercent: true, higherBetter: true },
  { key: "lCancelRate", label: "L-Cancel Rate", tip: "Percentage of aerial landings with a successful L-cancel. 85%+ is solid, 95%+ is top-level.", format: (v) => `${(v * 100).toFixed(1)}%`, color: "#14e060", isPercent: true, higherBetter: true },
  { key: "conversionRate", label: "Conversion Rate", tip: "How often a neutral win turns into a combo or string. Higher means better punish game off openings.", format: (v) => `${(v * 100).toFixed(1)}%`, color: "#f5a623", isPercent: true, higherBetter: true },
  { key: "avgDamagePerOpening", label: "Dmg / Opening", tip: "Average damage dealt per neutral win. Measures how hard you punish each opening.", format: (v) => v.toFixed(1), color: "#5cdb95", isPercent: false, higherBetter: true, maxValue: 60 },
  { key: "openingsPerKill", label: "Openings / Kill", tip: "Neutral wins needed per stock taken. Lower is better — fewer openings to close a stock.", format: (v) => Number.isFinite(v) ? v.toFixed(1) : "N/A", color: "#C60707", isPercent: false, higherBetter: false, maxValue: 15 },
  { key: "avgDeathPercent", label: "Avg Death %", tip: "Average percent at which you die. Higher means you're surviving longer and DI-ing well.", format: (v) => `${v.toFixed(0)}%`, color: "#8ba89a", isPercent: false, higherBetter: true, maxValue: 200 },
  { key: "powerShieldCount", label: "Power Shields", tip: "Power shields per game. Reflects defensive timing and reactions to projectiles/approaches.", format: (v) => v.toFixed(1), color: "#18FF6D", isPercent: false, higherBetter: true, maxValue: 20 },
  { key: "edgeguardSuccessRate", label: "Edgeguard Rate", tip: "How often your edgeguard attempts result in a taken stock. Measures offstage lethality.", format: (v) => `${(v * 100).toFixed(1)}%`, color: "#ff6b6b", isPercent: true, higherBetter: true },
  { key: "recoverySuccessRate", label: "Recovery Rate", tip: "How often you make it back to stage when knocked offstage. Higher means better survival.", format: (v) => `${(v * 100).toFixed(1)}%`, color: "#45c9a8", isPercent: true, higherBetter: true },
];

/** Inline stat header shown above each chart card */
function ChartHeader({ value, label, tip, format, color, higherBetter, delta, isPercent }: {
  value: number;
  label: string;
  tip: string;
  format: (v: number) => string;
  color: string;
  higherBetter: boolean;
  delta: number;
  isPercent: boolean;
}) {
  const improving = higherBetter ? delta > 0 : delta < 0;
  const stable = Math.abs(delta) < 0.01;

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
      <Tooltip text={tip} position="right">
        <span className="card-title" style={{ marginBottom: 0 }}>{label}</span>
      </Tooltip>
      <span style={{ color, fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "-0.5px" }}>
        {format(value)}
      </span>
      {!stable && (
        <span style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          color: improving ? "var(--green)" : "var(--red)",
        }}>
          {improving ? "\u2191" : "\u2193"}{" "}
          {isPercent ? Math.abs(delta * 100).toFixed(1) + "pp" : Math.abs(delta).toFixed(1)}
        </span>
      )}
    </div>
  );
}

function rollingAvg(data: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

function buildTrendSummary(
  chronological: RecentGame[],
  firstHalf: RecentGame[],
  secondHalf: RecentGame[],
  avg: (rows: RecentGame[], key: keyof RecentGame) => number,
): string {
  const totalGames = chronological.length;
  const wins = chronological.filter((g) => g.result === "win").length;
  const losses = chronological.filter((g) => g.result === "loss").length;
  const winRate = ((wins / totalGames) * 100).toFixed(1);

  const matchupCounts: Record<string, number> = {};
  for (const g of chronological) {
    const key = `${g.playerCharacter} vs ${g.opponentCharacter}`;
    matchupCounts[key] = (matchupCounts[key] ?? 0) + 1;
  }
  const topMatchups = Object.entries(matchupCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([mu, count]) => `${mu} (${count} games)`)
    .join(", ");

  const lines: string[] = [
    `Player's recent performance across ${totalGames} games:`,
    `Overall record: ${wins}W-${losses}L (${winRate}% win rate)`,
    `Most played matchups: ${topMatchups}`,
    "",
    "Stat trends (first half of games -> second half):",
  ];

  for (const m of METRICS) {
    const early = avg(firstHalf, m.key);
    const late = avg(secondHalf, m.key);
    const delta = late - early;
    const improving = m.higherBetter ? delta > 0 : delta < 0;
    const direction = Math.abs(delta) < 0.01 ? "stable" : improving ? "IMPROVING" : "DECLINING";
    lines.push(`  ${m.label}: ${m.format(early)} -> ${m.format(late)} [${direction}]`);
  }

  const last5 = chronological.slice(-5);
  const last5Wins = last5.filter((g) => g.result === "win").length;
  const last5Losses = last5.filter((g) => g.result === "loss").length;
  const last5Draws = last5.length - last5Wins - last5Losses;
  lines.push("");
  lines.push(`Last ${last5.length} games: ${last5Wins}W-${last5Losses}L${last5Draws > 0 ? `-${last5Draws}D` : ""}`);

  const recentAvg = (key: keyof RecentGame) =>
    last5.reduce((s, g) => s + (g[key] as number), 0) / last5.length;
  lines.push(`Last 5 neutral win rate: ${(recentAvg("neutralWinRate") * 100).toFixed(1)}%`);
  lines.push(`Last 5 L-cancel rate: ${(recentAvg("lCancelRate") * 100).toFixed(1)}%`);
  lines.push(`Last 5 avg death%: ${recentAvg("avgDeathPercent").toFixed(0)}%`);

  return lines.join("\n");
}

function ChartTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "8px 12px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 3 }}>
        Game {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: metric.color, fontFamily: "var(--font-mono)" }}>
        {metric.format(payload[0].value)}
      </div>
    </div>
  );
}

export function Trends({ refreshKey }: { refreshKey: number }) {
  const { data: games = [], isLoading: loading, refetch } = useRecentGames(200);
  const { data: stages = [], refetch: refetchStages } = useStageRecords();

  const [scopedCoaching, setScopedCoaching] = useState<{
    scope: "game" | "session" | "character" | "stage" | "opponent";
    id: string | number;
    title: string;
  } | null>(null);

  const [commentary, setCommentary] = useState<string | null>(null);
  const { displayText: typedCommentary, isTyping } = useTypewriter(commentary ?? "", 4, !!commentary);
  const [analyzingTrends, setAnalyzingTrends] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);

  useEffect(() => {
    refetch();
    refetchStages();
  }, [refreshKey, refetch, refetchStages]);

  // Memos must be above early returns to keep hook count stable
  const chronological = useMemo(() => [...games].reverse(), [games]);

  const chartData = useMemo(() => chronological.map((g, i) => ({
    game: i + 1,
    ...Object.fromEntries(
      METRICS.map((m) => {
        const raw = chronological.map((r) => r[m.key] as number);
        const smoothed = rollingAvg(raw, 5);
        return [m.key, smoothed[i]];
      }),
    ),
  })), [chronological]);

  if (loading) return <div className="loading"><div className="spinner" style={{ margin: "0 auto 12px" }} />Loading trend data...</div>;

  if (games.length < 4) {
    return (
      <div className="empty-state">
        <h2>Not enough data</h2>
        <p>Import at least 4 games to generate trend analysis.</p>
      </div>
    );
  }

  const half = Math.floor(chronological.length / 2);
  const firstHalf = chronological.slice(0, half);
  const secondHalf = chronological.slice(half);

  function avg(rows: RecentGame[], key: keyof RecentGame): number {
    const vals = rows.map((r) => r[key] as number);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const handleGetCommentary = async () => {
    setAnalyzingTrends(true);
    setTrendError(null);
    try {
      const summary = buildTrendSummary(chronological, firstHalf, secondHalf, avg);
      const result = await window.clippi.analyzeTrends(summary);
      setCommentary(result);
    } catch (err: unknown) {
      setTrendError(err instanceof Error ? err.message : String(err));
    }
    setAnalyzingTrends(false);
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="page-header">
          <h1>Trends</h1>
          <p>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--accent)" }}>{chronological.length}</span> games &middot; 5-game rolling average
          </p>
        </div>
      </motion.div>

      {/* MAGI Oracle */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <div className="card clippi-card">
          <div className="clippi-header">
            <div className="clippi-avatar">M</div>
            <div>
              <div className="clippi-name">MAGI</div>
              <div className="clippi-subtitle">
                {commentary ? "Analysis complete" : "Ready to analyze trends"}
              </div>
            </div>
            {!commentary && !analyzingTrends && (
              <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={handleGetCommentary}>
                Analyze Trends
              </button>
            )}
          </div>

          {analyzingTrends && (
            <div className="analyze-loading">
              <div className="spinner" />
              <span>Analyzing trends...</span>
            </div>
          )}

          {trendError && (
            <p style={{ color: "var(--red)", fontSize: 12, marginTop: 12 }}>{trendError}</p>
          )}

          {commentary && (
            <div className="clippi-commentary">
              <div className="analysis-text">
                <Markdown>{typedCommentary}</Markdown>
                {isTyping && <span className="typing-cursor">|</span>}
              </div>
              {!isTyping && (
                <button
                  className="btn"
                  style={{ marginTop: 14 }}
                  onClick={handleGetCommentary}
                  disabled={analyzingTrends}
                >
                  Refresh Analysis
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Charts — each card shows current value, delta, and trend line */}
      {METRICS.map((m, index) => {
        const early = avg(firstHalf, m.key);
        const late = avg(secondHalf, m.key);
        const delta = late - early;
        return (
        <motion.div
          key={m.key}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(index * 0.02, 0.12), duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="card">
            <ChartHeader
              value={late}
              label={m.label}
              tip={m.tip}
              format={m.format}
              color={m.color}
              higherBetter={m.higherBetter}
              delta={delta}
              isPercent={m.isPercent}
            />
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={`grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={m.color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={m.color} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="game"
                  tick={{ fill: "var(--text-dim)", fontSize: 9 } as any}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--text-dim)", fontSize: 9 } as any}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  tickFormatter={(v: number) => m.isPercent ? `${(v * 100).toFixed(0)}%` : v.toFixed(1)}
                  domain={m.isPercent ? [0, 1] : ["auto", "auto"]}
                  width={42}
                />
                <RechartsTooltip content={<ChartTooltip metric={m} />} />
                <Area
                  type="monotone"
                  dataKey={m.key}
                  stroke={m.color}
                  strokeWidth={2}
                  fill={`url(#grad-${m.key})`}
                  dot={false}
                  activeDot={{ r: 4, fill: m.color, stroke: "var(--bg-card)", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
        );
      })}

      {/* Stage Analysis Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        style={{ marginTop: 40 }}
      >
        <div className="page-header" style={{ marginBottom: 20 }}>
          <h2>Stage Performance</h2>
          <p>AI coaching available per stage</p>
        </div>

        <div className="char-grid">
          {stages.map((s, index) => {
            const wr = (s.winRate * 100).toFixed(0);
            return (
              <motion.div
                key={s.stage}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(index * 0.02, 0.1), duration: 0.2 }}
              >
                <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{s.stage}</span>
                    <span style={{ 
                      fontFamily: 'var(--font-mono)', 
                      fontSize: 14, 
                      color: s.winRate >= 0.5 ? 'var(--green)' : 'var(--red)' 
                    }}>{wr}%</span>
                  </div>
                  <div className="winrate-bar">
                    <div className="winrate-bar-fill" style={{ width: `${s.winRate * 100}%` }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {s.wins}W - {s.losses}L ({s.totalGames} games)
                  </div>
                  <button 
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '8px', padding: '5px 10px', fontSize: '11px' }}
                    onClick={() => setScopedCoaching({
                      scope: 'stage',
                      id: s.stage,
                      title: `${s.stage} Performance Profile`
                    })}
                  >
                    Analyze Habits
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

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
    </div>
  );
}
