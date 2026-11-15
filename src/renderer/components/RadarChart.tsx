import { useState, useMemo, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import type { RadarStats, RadarGameStats } from "../radarStats";
import { computeRadarForPeriod } from "../radarStats";
import { DURATION_MS } from "../motion";

// ── Axis labels ──────────────────────────────────────────────────────

const AXES: { key: keyof RadarStats; label: string; description: string }[] = [
  {
    key: "neutral",
    label: "Neutral",
    description:
      "How often this character wins the first meaningful opening. High Neutral means the character is getting into their game plan cleanly.",
  },
  {
    key: "punish",
    label: "Punish",
    description:
      "Damage per opening and conversion rate. High Punish means openings are becoming percent, positioning, or stocks.",
  },
  {
    key: "techSkill",
    label: "Execution",
    description: "L-canceling plus movement volume. This is the character's execution floor across real games.",
  },
  {
    key: "mixups",
    label: "Mixups",
    description:
      "Ledge, knockdown, and shield-pressure entropy. High Mixups means the same situations are producing varied choices.",
  },
  {
    key: "edgeguard",
    label: "Edgeguard",
    description: "How often offstage chances turn into finished stocks or denied recoveries.",
  },
  {
    key: "diQuality",
    label: "DI",
    description:
      "Combo DI and survival DI. This shows how well the character escapes damage and lives through kill attempts.",
  },
  {
    key: "defense",
    label: "Defense",
    description:
      "Average death percent, recovery success, and power shields. High Defense means this character is hard to finish cleanly.",
  },
  {
    key: "consistency",
    label: "Consistency",
    description: "How stable this character's neutral, punish damage, and survivability are from game to game.",
  },
];

// Custom axis tick renders an SVG <title> for a native browser tooltip on hover
function RadarAxisTick(props: any) {
  const { x, y, payload, textAnchor } = props;
  const axis = AXES.find((a) => a.label === payload.value);
  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: axis ? "help" : "default" }}>
      {axis && <title>{`${axis.label}: ${axis.description}`}</title>}
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor={textAnchor}
        fill="var(--text-dim)"
        fontSize={10}
        fontWeight={600}
        fontFamily="var(--font-mono)"
      >
        {payload.value}
      </text>
    </g>
  );
}

// ── Period definitions ───────────────────────────────────────────────

type Period = "none" | "week" | "month" | "3months";

function getPeriodDates(period: Period): { current: string; previous: string } | null {
  if (period === "none") return null;
  const now = new Date();
  const days = period === "week" ? 7 : period === "month" ? 30 : 90;
  const currentStart = new Date(now.getTime() - days * 86400000).toISOString();
  const previousStart = new Date(now.getTime() - days * 2 * 86400000).toISOString();
  return { current: currentStart, previous: previousStart };
}

// ── Tooltip ──────────────────────────────────────────────────────────

function RadarTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const { axis } = payload[0].payload;
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: 12,
        fontFamily: "var(--font-mono)",
      }}
    >
      <div style={{ color: "var(--text-dim)", fontSize: 10, marginBottom: 4 }}>{axis}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: p.stroke || p.color,
              display: "inline-block",
            }}
          />
          <span style={{ color: p.stroke || "var(--accent)", fontWeight: 700 }}>{Math.round(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

interface RadarProps {
  stats: RadarStats;
  /** Raw game data for computing time-based comparison. Optional. */
  games?: RadarGameStats[];
  /** Hide the period selector */
  hideComparison?: boolean;
  /** Character-specific accent color. */
  accentColor?: string;
}

export function PlayerRadar({ stats, games, hideComparison, accentColor }: RadarProps) {
  const [period, setPeriod] = useState<Period>("none");
  // Unfurl from the center on first draw, then morph vertex-to-vertex when the period changes.
  const animate = !useReducedMotion();

  const { currentStats, comparison } = useMemo(() => {
    if (period === "none" || !games || games.length === 0) return { currentStats: stats, comparison: null };
    const dates = getPeriodDates(period);
    if (!dates) return { currentStats: stats, comparison: null };
    return {
      currentStats: computeRadarForPeriod(games, dates.current) ?? stats,
      comparison: computeRadarForPeriod(games, dates.previous, dates.current),
    };
  }, [period, games, stats]);

  const data = AXES.map(({ key, label }: { key: keyof RadarStats; label: string }) => ({
    axis: label,
    current: currentStats[key],
    ...(comparison ? { previous: comparison[key] } : {}),
  }));

  const showComparison = comparison !== null;
  const style = accentColor ? ({ "--radar-accent": accentColor } as CSSProperties) : undefined;

  return (
    <div className="player-radar" style={style}>
      <ResponsiveContainer width="100%" height={300}>
        <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="68%">
          <PolarGrid stroke="var(--border)" strokeDasharray="3 3" gridType="polygon" />
          <PolarAngleAxis dataKey="axis" tick={RadarAxisTick as any} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tickCount={6}
            tick={{ fill: "var(--text-dim)", fontSize: 8, fontFamily: "var(--font-mono)" } as any}
            axisLine={false}
          />

          {/* Previous period (if comparing) — rendered first so it's behind */}
          {showComparison && (
            <Radar
              name="Previous"
              dataKey="previous"
              stroke="var(--text-dim)"
              fill="var(--text-dim)"
              fillOpacity={0.05}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={animate}
              animationDuration={DURATION_MS.slow}
              animationEasing="ease-out"
            />
          )}

          {/* Current period */}
          <Radar
            name={showComparison ? "Current window" : "Character form"}
            dataKey="current"
            stroke="var(--radar-accent, var(--accent))"
            fill="var(--radar-accent, var(--accent))"
            fillOpacity={0.18}
            strokeWidth={2}
            dot={
              { r: 3.5, fill: "var(--bg-card)", strokeWidth: 2, stroke: "var(--radar-accent, var(--accent))" } as any
            }
            isAnimationActive={animate}
            animationDuration={DURATION_MS.reveal}
            animationEasing="ease-out"
          />

          <Tooltip content={<RadarTooltip />} />
          {showComparison && (
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }} />
          )}
        </RechartsRadarChart>
      </ResponsiveContainer>

      {/* Period selector */}
      {!hideComparison && games && games.length >= 6 && (
        <div className="radar-period-selector">
          {(["none", "week", "month", "3months"] as Period[]).map((p) => (
            <button key={p} className={`radar-period-btn ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>
              {p === "none"
                ? "All Time"
                : p === "week"
                  ? "vs Last Week"
                  : p === "month"
                    ? "vs Last Month"
                    : "vs Last 3mo"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
