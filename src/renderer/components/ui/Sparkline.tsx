import { useId, type CSSProperties } from "react";
import { buildSparklinePoints } from "./sparklineMath";

interface SparklineProps {
  values: number[];
  label?: string;
  kind?: "spark" | "chart";
  color?: string;
  height?: number;
  /** When true, shows a subtle area fill and 3 dashed gridlines (chart kind only). */
  fill?: boolean;
  /** Fixed y-domain [min,max]; prevents misleading auto-scaling (e.g. [0,100] for %). */
  domain?: [number, number];
  className?: string;
  style?: CSSProperties;
}

export function Sparkline({
  values,
  label = "Trend",
  kind = "spark",
  color = "var(--accent)",
  height,
  fill,
  domain,
  className,
  style,
}: SparklineProps) {
  const w = kind === "chart" ? 1000 : 120;
  const h = height ?? (kind === "chart" ? 200 : 32);
  const pts = buildSparklinePoints(values, w, h, domain);
  const gradId = `sparkgrad-${useId().replace(/:/g, "")}`;
  if (!pts) return null;

  const showFill = fill ?? kind === "chart";
  const showGrid = kind === "chart";
  const gridLines = [0.25, 0.5, 0.75].map((t) => h * t);
  const lastX = w;
  const lastY = values.length > 1 ? Number(pts.split(" ").slice(-1)[0]!.split(",")[1]) : h;
  const areaPath = `0,${h} ${pts} ${w},${h}`;

  return (
    <svg
      role="img"
      aria-label={`${label}. ${values.length} points; first ${values[0]?.toFixed(2)}, last ${values.at(-1)?.toFixed(2)}.`}
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
