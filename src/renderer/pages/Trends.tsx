import { LoadError } from "../components/ui/LoadError";
import { useState } from "react";
import { useLibraryGames, useTrendSeriesBundle } from "../hooks/queries";
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
  /** Fixed y-domain to anchor the chart scale. Omit for raw metrics (auto-scale). */
  domain?: [number, number];
}> = [
  {
    key: "neutralWinRate",
    label: "Neutral WR",
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    color: "var(--win)",
    pct: true,
    domain: [0, 1],
  },
  {
    key: "lCancelRate",
    label: "L-Cancel",
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    color: "var(--accent)",
    pct: true,
    domain: [0, 1],
  },
  {
    key: "conversionRate",
    label: "Conversion",
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    color: "var(--caution)",
    pct: true,
    domain: [0, 1],
  },
  { key: "avgDamagePerOpening", label: "Dmg/Opening", fmt: (v) => v.toFixed(1), color: "var(--text)" },
  { key: "openingsPerKill", label: "Openings/Kill", fmt: (v) => v.toFixed(1), color: "var(--loss)", invert: true },
  {
    key: "avgDeathPercent",
    label: "Avg Death %",
    fmt: (v) => `${v.toFixed(0)}%`,
    color: "var(--text-secondary)",
    // Damage percent is unbounded; its delta is already in percentage points.
    
  },
];

/** Format an ISO timestamp as a short axis label, e.g. "Jun 3". */
function fmtAxisDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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

  const { data: libraryOptions, isLoading: optionsLoading, isError: optionsError, refetch: retryOptions } = useLibraryGames({
    search: "",
    char: "all",
    stage: "all",
    result: "all",
    limit: 1,
    offset: 0,
  });
  const chars = libraryOptions?.characters ?? [];
  const totalGames = libraryOptions?.totalUnfiltered ?? 0;

  const {
    data: trendSeries,
    isLoading,
    isError,
    refetch,
  } = useTrendSeriesBundle(range, filterChar === "all" ? null : filterChar);

  const current = METRICS.find((m) => m.key === metric)!;
  const series = trendSeries?.[metric] ?? [];
  const values = series.map((p) => p.value);
  const smoothed = rolling(values, 5);
  const delta = firstHalfDelta(smoothed);
  const improving = current.invert ? delta < 0 : delta > 0;
  const lowSample = !isLoading && !isError && series.length < 5;

  if (optionsLoading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
        Loading…
      </div>
    );
  }

  if (optionsError) return <LoadError message="Trend filters could not load." retry={() => void retryOptions()} />;

  if (totalGames === 0) {
    return <EmptyState title="No games yet" sub="Trends appear once you have replays imported." />;
  }

  const chartDomain: [number, number] = current.domain ?? [Math.min(0, ...smoothed), Math.max(1, ...smoothed) * 1.05];
  // Axis labels use the same domain as the plot.
  const yTicks = [chartDomain[1], (chartDomain[0] + chartDomain[1]) / 2, chartDomain[0]].map(current.fmt);

  return (
    <div>
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
            {chars.map((c) => (
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
            <div className="trends-hero-label">{current.label}</div>
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
        ) : isError ? (
          <div className="trends-chart-message" style={{ height: 260 }}>
            <LoadError message="Trend data could not load." retry={() => void refetch()} />
          </div>
        ) : lowSample ? (
          <div className="trends-chart-message" style={{ height: 260 }}>
            Need 5+ games for a trend — only {series.length} found for this filter.
          </div>
        ) : (
          <>
            <div className="trends-chart-row">
              {yTicks && (
                <div className="trends-yaxis" style={{ height: 260 }}>
                  {yTicks.map((t, i) => (
                    <span key={i}>{t}</span>
                  ))}
                </div>
              )}
              <div className="trends-chart-area">
                <Sparkline
                  values={smoothed}
                  kind="chart"
                  height={260}
                  color={current.color}
                  fill
                  domain={chartDomain}
                  label={`${current.label}: ${series.length} games, five-game rolling average`}
                />
              </div>
            </div>
            {series.length > 1 && (
              <div className="trends-xaxis" style={yTicks ? { paddingLeft: 44 } : undefined}>
                <span>{fmtAxisDate(series[0]!.playedAt)}</span>
                <span>{fmtAxisDate(series[Math.floor((series.length - 1) / 2)]!.playedAt)}</span>
                <span>{fmtAxisDate(series[series.length - 1]!.playedAt)}</span>
              </div>
            )}
          </>
        )}
      </Card>

      <p className="audit-sample-note">Points are equally spaced by game, not elapsed time. Change compares the mean rolling average in the later half with the earlier half of this filtered sample.</p>
      <details><summary>View {current.label} data</summary><div className="audit-data-scroll"><table><thead><tr><th>Game date</th><th>Value</th><th>Rolling average</th></tr></thead><tbody>{series.map((point, index) => <tr key={index}><td>{new Date(point.playedAt).toLocaleString()}</td><td>{current.fmt(point.value)}</td><td>{current.fmt(smoothed[index]!)}</td></tr>)}</tbody></table></div></details>
      <div className="trends-grid">
        {METRICS.filter((m) => m.key !== metric).map((m) => (
          <MiniChart key={m.key} metric={m} series={trendSeries?.[m.key] ?? []} onSelect={() => setMetric(m.key)} />
        ))}
      </div>
    </div>
  );
}

function MiniChart({
  metric,
  series,
  onSelect,
}: {
  metric: (typeof METRICS)[number];
  series: Array<{ playedAt: string; value: number }>;
  onSelect: () => void;
}) {
  const smoothed = rolling(
    series.map((p) => p.value),
    5,
  );
  const delta = firstHalfDelta(smoothed);
  const improving = metric.invert ? delta < 0 : delta > 0;

  return (
    <Card
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Select ${metric.label} trend`}
      style={{ cursor: "pointer" }}
    >
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
      <Sparkline
        values={smoothed}
        kind="chart"
        height={80}
        color={metric.color}
        fill
        {...(metric.domain ? { domain: metric.domain } : {})}
      />
    </Card>
  );
}
