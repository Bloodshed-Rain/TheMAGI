import { useState, useMemo } from "react";
import {
  Radar, RadarChart as RechartsRadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import type { RadarStats, RadarGameStats } from "../radarStats";
import { computeRadarForPeriod } from "../radarStats";

// ── Axis labels ──────────────────────────────────────────────────────

const AXES: { key: keyof RadarStats; label: string; description: string }[] = [
  {
    key: "neutral",
    label: "Neutral",
    description:
      "Neutral — winning the first hit. To improve: stop throwing out moves at max range hoping to catch something. Watch your opponent's habits for 10 seconds before committing. Use dash-dance and empty short-hops to bait, then punish the option they show you. Losing neutral usually means you're approaching predictably or autopiloting the same aerial.",
  },
  {
    key: "punish",
    label: "Punish",
    description:
      "Punish — converting openings into stocks. To improve: finish your combos instead of resetting to neutral. After the first hit, react to their DI before picking the next move. Learn two kill confirms for your character at mid percent (e.g. uthrow→uair, grab→dthrow→knee) and drill them until they're automatic. High openings-per-kill = you're winning neutral but dropping punishes.",
  },
  {
    key: "techSkill",
    label: "Tech Skill",
    description:
      "Tech Skill — execution. To improve: L-cancel EVERY aerial in training mode for 10 minutes a day until it's muscle memory (target 90%+). Practice wavedash out of shield and ledgedash on a 20XX setup. Shield-drop through platforms instead of rolling off. Tech skill gates everything else — sloppy execution caps your punish game.",
  },
  {
    key: "mixups",
    label: "Mixups",
    description:
      "Mixups — being unpredictable. To improve: vary your approach — not just dash-attack every time. Mix empty land → grab, crossup aerial, and retreat fair. On ledge, alternate between tournament-winner (ledgedash), rolling, jumping, and getup attack. If your opponent reads you, change ONE option — they'll guess wrong for a while.",
  },
  {
    key: "edgeguard",
    label: "Edgeguard",
    description:
      "Edgeguard — killing them offstage. To improve: COMMIT. Most failed edgeguards are from staying onstage and throwing a lazy fair. Hop offstage with a bair/dair and actually take the risk. Learn your character's gimp tools (Marth's dtilt, Fox's bair, Falco's dair). Going offstage and dying is still better than letting them back for free — that's data for next time.",
  },
  {
    key: "diQuality",
    label: "DI Quality",
    description:
      "DI Quality — surviving hits. To improve: DI away and up on horizontal kill moves (fsmash, bair), DI into the stage on spikes. For combos, survival DI (full away) breaks follow-ups at higher percents. The biggest gain: stop holding the same direction every hit — watch the attacker's angle and DI perpendicular to the knockback vector.",
  },
  {
    key: "defense",
    label: "Defense",
    description:
      "Defense — not getting hit. To improve: stop rolling behind shield, opponents are reading it. Use wavedash out of shield, shield-grab, or up-B OoS instead. Power-shield projectiles on reaction (hold shield tap, don't mash). When getting pressured, spot-dodge out once then reset spacing — don't try to outlast infinite shield pressure.",
  },
  {
    key: "consistency",
    label: "Consistency",
    description:
      "Consistency — performing the same across games. To improve: warm up before ranked/tournament sets — 5 minutes of tech skill drills and a friendly. High variance usually means you tilt after losses or overadjust after one read. Reset between games: take a breath, identify ONE thing to change, then play your game. Don't try to fix everything at once.",
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
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "8px 12px",
      fontSize: 12,
      fontFamily: "var(--font-mono)",
    }}>
      <div style={{ color: "var(--text-dim)", fontSize: 10, marginBottom: 4 }}>{axis}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: p.stroke || p.color,
            display: "inline-block",
          }} />
          <span style={{ color: p.stroke || "var(--accent)", fontWeight: 700 }}>
            {Math.round(p.value)}
          </span>
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
}

export function PlayerRadar({ stats, games, hideComparison }: RadarProps) {
  const [period, setPeriod] = useState<Period>("none");

  const comparison = useMemo(() => {
    if (period === "none" || !games || games.length === 0) return null;
    const dates = getPeriodDates(period);
    if (!dates) return null;
    return computeRadarForPeriod(games, dates.previous, dates.current);
  }, [period, games]);

  const data = AXES.map(({ key, label }: { key: keyof RadarStats; label: string }) => ({
    axis: label,
    current: stats[key],
    ...(comparison ? { previous: comparison[key] } : {}),
  }));

  const showComparison = comparison !== null;

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="68%">
          <PolarGrid
            stroke="var(--border)"
            strokeDasharray="3 3"
            gridType="polygon"
          />
          <PolarAngleAxis
            dataKey="axis"
            tick={RadarAxisTick as any}
          />
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
            />
          )}

          {/* Current period */}
          <Radar
            name={showComparison ? "Current" : "Skill"}
            dataKey="current"
            stroke="var(--accent)"
            fill="var(--accent)"
            fillOpacity={0.15}
            strokeWidth={2}
            dot={{ r: 3.5, fill: "var(--bg-card)", strokeWidth: 2, stroke: "var(--accent)" } as any}
          />

          <Tooltip content={<RadarTooltip />} />
          {showComparison && (
            <Legend
              wrapperStyle={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
            />
          )}
        </RechartsRadarChart>
      </ResponsiveContainer>

      {/* Period selector */}
      {!hideComparison && games && games.length >= 6 && (
        <div className="radar-period-selector">
          {(["none", "week", "month", "3months"] as Period[]).map((p) => (
            <button
              key={p}
              className={`radar-period-btn ${period === p ? "active" : ""}`}
              onClick={() => setPeriod(p)}
            >
              {p === "none" ? "All Time" : p === "week" ? "vs Last Week" : p === "month" ? "vs Last Month" : "vs Last 3mo"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
