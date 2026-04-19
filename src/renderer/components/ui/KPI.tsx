import { ReactNode } from "react";

interface KPIProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  subTone?: "good" | "bad" | "neutral";
}

export function KPI({ label, value, sub, subTone = "neutral" }: KPIProps) {
  const subColor = subTone === "good" ? "var(--win)" : subTone === "bad" ? "var(--loss)" : "var(--text-muted)";
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub !== undefined && (
        <div className="kpi-sub" style={{ color: subColor }}>
          {sub}
        </div>
      )}
    </div>
  );
}
