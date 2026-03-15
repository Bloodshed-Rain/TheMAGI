import {
  Radar, RadarChart as RechartsRadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from "recharts";

interface RadarProps {
  stats: {
    neutral: number;    // 0-100
    punish: number;
    techSkill: number;
    defense: number;
    aggression: number;
    consistency: number;
  };
}

export function PlayerRadar({ stats }: RadarProps) {
  const data = [
    { axis: "Neutral", value: stats.neutral },
    { axis: "Punish", value: stats.punish },
    { axis: "Tech Skill", value: stats.techSkill },
    { axis: "Defense", value: stats.defense },
    { axis: "Aggression", value: stats.aggression },
    { axis: "Consistency", value: stats.consistency },
  ];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: "var(--text-dim)", fontSize: 11, fontWeight: 500 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={false}
          axisLine={false}
        />
        <Radar
          dataKey="value"
          stroke="var(--accent)"
          fill="var(--accent)"
          fillOpacity={0.15}
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--accent)", strokeWidth: 0 }}
        />
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}
