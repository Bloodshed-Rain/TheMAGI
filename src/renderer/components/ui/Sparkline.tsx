import { CSSProperties } from "react";

export function buildSparklinePoints(values: number[], w: number, h: number): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `0,${h}`;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
}

interface SparklineProps {
  values: number[];
  kind?: "spark" | "chart";
  color?: string;
  height?: number;
  /** When true, shows a subtle area fill and 3 dashed gridlines (chart kind only). */
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Sparkline({
  values,
  kind = "spark",
  color = "var(--accent)",
  height,
  fill,
  className,
  style,
}: SparklineProps) {
  const w = kind === "chart" ? 1000 : 120;
  const h = height ?? (kind === "chart" ? 200 : 32);
  const pts = buildSparklinePoints(values, w, h);
  if (!pts) return null;

  const showFill = fill ?? kind === "chart";
  const showGrid = kind === "chart";
  const gridLines = [0.25, 0.5, 0.75].map((t) => h * t);
  const lastX = w;
  const lastY = values.length > 1 ? Number(pts.split(" ").slice(-1)[0]!.split(",")[1]) : h;
  const areaPath = `0,${h} ${pts} ${w},${h}`;
  const gradId = `sparkgrad-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={kind === "chart" ? "100%" : w}
      height={h}
      preserveAspectRatio={kind === "chart" ? "none" : "xMinYMid meet"}
      style={{ display: "block", overflow: "visible", ...style }}
      className={className}
    >
      {showFill && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {showGrid &&
        gridLines.map((y) => (
          <line key={y} x1="0" y1={y} x2={w} y2={y} stroke="var(--border-subtle)" strokeDasharray="3 3" />
        ))}
      {showFill && <polygon points={areaPath} fill={`url(#${gradId})`} />}
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={kind === "chart" ? 2 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {kind === "chart" && values.length > 1 && (
        <circle cx={lastX} cy={lastY} r="5" fill={color} stroke="var(--bg)" strokeWidth="2" />
      )}
    </svg>
  );
}
