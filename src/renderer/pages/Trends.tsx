import { useState } from "react";
import { motion } from "framer-motion";
import { useTrendSeries, useRecentGames } from "../hooks/queries";
import { Card } from "../components/ui/Card";
import { Pill, PillRow } from "../components/ui/Pill";
import { Sparkline } from "../components/ui/Sparkline";
import { EmptyState } from "../components/ui/EmptyState";

type MetricKey =
  | "neutralWinRate"
  | "lCancelRate"
  | "conversionRate"
  | "avgDamagePerOpening"
  | "openingsPerKill"
  | "avgDeathPercent";

const METRICS: Array<{
  key: MetricKey;
  label: string;
  fmt: (v: number) => string;
  color: string;
  invert?: boolean;
  pct?: boolean;
}> = [
  {
    key: "neutralWinRate",
    label: "Neutral WR",
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    color: "var(--win)",
    pct: true,
  },
  { key: "lCancelRate", label: "L-Cancel", fmt: (v) => `${(v * 100).toFixed(1)}%`, color: "var(--accent)", pct: true },
  {
    key: "conversionRate",
    label: "Conversion",
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    color: "var(--caution)",
    pct: true,
  },
  { key: "avgDamagePerOpening", label: "Dmg/Opening", fmt: (v) => v.toFixed(1), color: "var(--text)" },
  { key: "openingsPerKill", label: "Openings/Kill", fmt: (v) => v.toFixed(1), color: "var(--loss)", invert: true },
  { key: "avgDeathPercent", label: "Avg Death %", fmt: (v) => `${v.toFixed(0)}%`, color: "var(--text-secondary)" },
];

function rolling(vals: number[], win: number): number[] {
  return vals.map((_, i) => {
    const slice = vals.slice(Math.max(0, i - win + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function firstHalfDelta(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mid = Math.floor(vals.length / 2);
  const a = vals.slice(0, mid);
  const b = vals.slice(mid);
  const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  return avg(b) - avg(a);
}

export function Trends({ refreshKey: _ }: { refreshKey: number }) {
  const [range, setRange] = useState<"7d" | "30d" | "all">("30d");
  const [metric, setMetric] = useState<MetricKey>("neutralWinRate");
  const [filterChar, setFilterChar] = useState<string>("all");

  const { data: recent = [] } = useRecentGames(500);
  const chars = Array.from(
    new Set(recent.map((g) => (g as unknown as { opponentCharacter: string }).opponentCharacter)),
  ).sort();

  const { data: series = [], isLoading } = useTrendSeries(metric, range, filterChar === "all" ? null : filterChar);

  const current = METRICS.find((m) => m.key === metric)!;
  const smoothed = rolling(series, 5);
  const delta = firstHalfDelta(smoothed);
  const improving = current.invert ? delta < 0 : delta > 0;

  if (recent.length === 0) {
    return <EmptyState title="No games yet" sub="Trends appear once you have replays imported." />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <div className="page-header">
        <div>
          <h1>Trends</h1>
          <p>{series.length} games · 5-game rolling avg</p>
        </div>
        <PillRow>
          {(["7d", "30d", "all"] as const).map((k) => (
            <Pill key={k} active={range === k} onClick={() => setRange(k)}>
              {k.toUpperCase()}
            </Pill>
          ))}
        </PillRow>
      </div>

      <Card style={{ marginBottom: 20, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="tweaks-label">Opponent character</div>
          <PillRow>
            <Pill active={filterChar === "all"} onClick={() => setFilterChar("all")}>
              All
            </Pill>
            {chars.slice(0, 8).map((c) => (
              <Pill key={c} active={filterChar === c} onClick={() => setFilterChar(c)}>
                {c}
              </Pill>
            ))}
          </PillRow>
        </div>
      </Card>

      <Card>
        <div className="trends-hero-head">
          <div>
            <div className="card-title">{current.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div className="kpi-value" style={{ fontSize: 48 }}>
                {smoothed.length > 0 ? current.fmt(smoothed[smoothed.length - 1]!) : "—"}
              </div>
              <div
                className="mono"
                style={{ color: improving ? "var(--win)" : "var(--loss)", fontWeight: 700, fontSize: 14 }}
              >
                {Math.abs(delta) < 0.0005
                  ? "—"
                  : `${improving ? "↑" : "↓"} ${current.pct ? (Math.abs(delta) * 100).toFixed(1) + "pp" : Math.abs(delta).toFixed(1)}`}
              </div>
            </div>
          </div>
          <PillRow>
            {METRICS.map((m) => (
              <Pill key={m.key} active={metric === m.key} onClick={() => setMetric(m.key)}>
                {m.label}
              </Pill>
            ))}
          </PillRow>
        </div>
        {isLoading ? (
          <div style={{ height: 260, display: "grid", placeItems: "center" }}>
            <div className="spinner" />
          </div>
        ) : (
          <Sparkline values={smoothed} kind="chart" height={260} color={current.color} fill />
        )}
      </Card>

      <div className="trends-grid">
        {METRICS.filter((m) => m.key !== metric).map((m) => (
          <MiniChart key={m.key} metric={m} range={range} filterChar={filterChar} onSelect={() => setMetric(m.key)} />
        ))}
      </div>
    </motion.div>
  );
}

function MiniChart({
  metric,
  range,
  filterChar,
  onSelect,
}: {
  metric: (typeof METRICS)[number];
  range: "7d" | "30d" | "all";
  filterChar: string;
  onSelect: () => void;
}) {
  const { data: series = [] } = useTrendSeries(metric.key, range, filterChar === "all" ? null : filterChar);
  const smoothed = rolling(series, 5);
  const delta = firstHalfDelta(smoothed);
  const improving = metric.invert ? delta < 0 : delta > 0;

  return (
    <Card onClick={onSelect} style={{ cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {metric.label}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="mono" style={{ fontWeight: 700, color: metric.color }}>
            {smoothed.length > 0 ? metric.fmt(smoothed[smoothed.length - 1]!) : "—"}
          </span>
          <span className="mono" style={{ fontSize: 10, color: improving ? "var(--win)" : "var(--loss)" }}>
            {Math.abs(delta) < 0.0005 ? "" : improving ? "↑" : "↓"}
          </span>
        </div>
      </div>
      <Sparkline values={smoothed} kind="chart" height={80} color={metric.color} fill />
    </Card>
  );
}
