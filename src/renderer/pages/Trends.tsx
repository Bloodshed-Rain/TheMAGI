import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

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
}

interface MetricConfig {
  key: keyof RecentGame;
  label: string;
  format: (v: number) => string;
  color: string;
  isPercent: boolean;
  higherBetter: boolean;
}

const METRICS: MetricConfig[] = [
  { key: "neutralWinRate", label: "Neutral Win Rate", format: (v) => `${(v * 100).toFixed(1)}%`, color: "#6366f1", isPercent: true, higherBetter: true },
  { key: "lCancelRate", label: "L-Cancel Rate", format: (v) => `${(v * 100).toFixed(1)}%`, color: "#22c55e", isPercent: true, higherBetter: true },
  { key: "conversionRate", label: "Conversion Rate", format: (v) => `${(v * 100).toFixed(1)}%`, color: "#eab308", isPercent: true, higherBetter: true },
  { key: "avgDamagePerOpening", label: "Dmg / Opening", format: (v) => v.toFixed(1), color: "#f97316", isPercent: false, higherBetter: true },
  { key: "openingsPerKill", label: "Openings / Kill", format: (v) => v.toFixed(1), color: "#ef4444", isPercent: false, higherBetter: false },
  { key: "avgDeathPercent", label: "Avg Death %", format: (v) => `${v.toFixed(0)}%`, color: "#8b5cf6", isPercent: false, higherBetter: true },
];

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
  const losses = totalGames - wins;
  const winRate = ((wins / totalGames) * 100).toFixed(1);

  // Most played matchups
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
    "Stat trends (first half of games → second half):",
  ];

  for (const m of METRICS) {
    const early = avg(firstHalf, m.key);
    const late = avg(secondHalf, m.key);
    const delta = late - early;
    const improving = m.higherBetter ? delta > 0 : delta < 0;
    const direction = Math.abs(delta) < 0.01 ? "stable" : improving ? "IMPROVING" : "DECLINING";
    lines.push(`  ${m.label}: ${m.format(early)} → ${m.format(late)} [${direction}]`);
  }

  // Recent streak
  const last5 = chronological.slice(-5);
  const last5Record = last5.filter((g) => g.result === "win").length;
  lines.push("");
  lines.push(`Last 5 games: ${last5Record}W-${5 - last5Record}L`);

  // Best and worst recent stats
  const recentAvg = (key: keyof RecentGame) =>
    last5.reduce((s, g) => s + (g[key] as number), 0) / last5.length;
  lines.push(`Last 5 neutral win rate: ${(recentAvg("neutralWinRate") * 100).toFixed(1)}%`);
  lines.push(`Last 5 L-cancel rate: ${(recentAvg("lCancelRate") * 100).toFixed(1)}%`);
  lines.push(`Last 5 avg death%: ${recentAvg("avgDeathPercent").toFixed(0)}%`);

  return lines.join("\n");
}

export function Trends({ refreshKey }: { refreshKey: number }) {
  const [games, setGames] = useState<RecentGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [analyzingTrends, setAnalyzingTrends] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const g = await window.clippi.getRecentGames(200);
        setGames(g);
      } catch (err) {
        console.error("Failed to load trends:", err);
      }
      setLoading(false);
    }
    load();
  }, [refreshKey]);

  if (loading) return <div className="loading">Loading...</div>;

  if (games.length < 4) {
    return (
      <div className="empty-state">
        <h2>Not enough data</h2>
        <p>Import at least 4 games to see trends.</p>
      </div>
    );
  }

  // Reverse to chronological order (DB returns DESC)
  const chronological = [...games].reverse();

  // Build chart data with 5-game rolling average
  const chartData = chronological.map((g, i) => ({
    game: i + 1,
    ...Object.fromEntries(
      METRICS.map((m) => {
        const raw = chronological.map((r) => r[m.key] as number);
        const smoothed = rollingAvg(raw, 5);
        return [m.key, smoothed[i]];
      }),
    ),
  }));

  // Summary cards: first half vs second half
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
      <div className="page-header">
        <h1>Trends</h1>
        <p>{chronological.length} games, 5-game rolling average</p>
      </div>

      {/* Coach-Clippi's take */}
      <div className="card clippi-card">
        <div className="clippi-header">
          <div className="clippi-avatar">CC</div>
          <div>
            <div className="clippi-name">Coach-Clippi</div>
            <div className="clippi-subtitle">
              {commentary ? "Here's my read on your trajectory" : "Want my take on your trends?"}
            </div>
          </div>
          {!commentary && !analyzingTrends && (
            <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={handleGetCommentary}>
              What do you think, Coach?
            </button>
          )}
        </div>

        {analyzingTrends && (
          <div className="analyze-loading">
            <div className="spinner" />
            <span>Reviewing your trajectory...</span>
          </div>
        )}

        {trendError && (
          <p style={{ color: "var(--red)", fontSize: 13, marginTop: 12 }}>{trendError}</p>
        )}

        {commentary && (
          <div className="clippi-commentary">
            <Markdown>{commentary}</Markdown>
            <button
              className="btn"
              style={{ marginTop: 12 }}
              onClick={handleGetCommentary}
              disabled={analyzingTrends}
            >
              Refresh take
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {METRICS.map((m) => {
          const early = avg(firstHalf, m.key);
          const late = avg(secondHalf, m.key);
          const delta = late - early;
          const improving = m.higherBetter ? delta > 0 : delta < 0;
          const stable = Math.abs(delta) < 0.01;

          return (
            <div className="stat-box" key={m.key}>
              <div className="stat-value" style={{ color: m.color }}>
                {m.format(late)}
                {!stable && (
                  <span
                    className={improving ? "trend-up" : "trend-down"}
                    style={{ fontSize: 12, marginLeft: 6 }}
                  >
                    {improving ? "+" : ""}
                    {m.isPercent ? (delta * 100).toFixed(1) + "pp" : delta.toFixed(1)}
                  </span>
                )}
              </div>
              <div className="stat-label">{m.label}</div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      {METRICS.map((m) => (
        <div className="card" key={m.key}>
          <div className="card-title">{m.label}</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
              <XAxis
                dataKey="game"
                tick={{ fill: "#8b8d9e", fontSize: 11 }}
                axisLine={{ stroke: "#2a2d3a" }}
              />
              <YAxis
                tick={{ fill: "#8b8d9e", fontSize: 11 }}
                axisLine={{ stroke: "#2a2d3a" }}
                tickFormatter={(v: number) => m.isPercent ? `${(v * 100).toFixed(0)}%` : v.toFixed(1)}
                domain={m.isPercent ? [0, 1] : ["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 6 }}
                labelStyle={{ color: "#8b8d9e" }}
                formatter={(value: number) => [m.format(value), m.label]}
                labelFormatter={(label: number) => `Game ${label}`}
              />
              <Line
                type="monotone"
                dataKey={m.key}
                stroke={m.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
