import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Markdown from "react-markdown";
import { useSessionsByDay } from "../hooks/queries";
import { useGlobalStore } from "../stores/useGlobalStore";
import { Card } from "../components/ui/Card";
import { WinrateBar } from "../components/ui/WinrateBar";
import { ResultDot } from "../components/ui/ResultDot";
import { EmptyState } from "../components/ui/EmptyState";

interface Day {
  date: string;
  games: number;
  wins: number;
  losses: number;
  opponents: string[];
  gameIds: number[];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function DayCard({ day }: { day: Day }) {
  const openDrawer = useGlobalStore((s) => s.openDrawer);
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wr = day.games > 0 ? day.wins / day.games : 0;
  const pct = Math.round(wr * 100);

  const onReport = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await window.clippi.analyzeSession(day.date);
      setReport(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <div className="session-card-head">
        <div className="session-card-date">{formatDate(day.date)}</div>
        <span className="mono" style={{ color: wr >= 0.5 ? "var(--win)" : "var(--loss)", fontWeight: 700 }}>
          {pct}%
        </span>
      </div>
      <div className="session-card-sub">
        {day.games} games · <span style={{ color: "var(--win)" }}>{day.wins}W</span>-
        <span style={{ color: "var(--loss)" }}>{day.losses}L</span>
      </div>
      <div className="session-card-dots">
        {day.gameIds.map((id, idx) => (
          <span key={id} onClick={() => openDrawer(id)} style={{ cursor: "pointer" }}>
            <ResultDot result={idx < day.wins ? "win" : "loss"} />
          </span>
        ))}
      </div>
      <WinrateBar value={wr} />
      <div className="session-card-opponents">
        vs {day.opponents.slice(0, 3).join(", ")}
        {day.opponents.length > 3 ? ` +${day.opponents.length - 3}` : ""}
      </div>
      <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={onReport} disabled={loading}>
        {loading ? "Analyzing…" : report ? "Regenerate Report" : "Session Report"}
      </button>
      {err && <p style={{ color: "var(--loss)", fontSize: 12, marginTop: 10 }}>{err}</p>}
      {report && (
        <div className="session-card-report">
          <Markdown>{report}</Markdown>
        </div>
      )}
    </Card>
  );
}

export function Sessions({ refreshKey: _ }: { refreshKey: number }) {
  const navigate = useNavigate();
  const { data: days = [], isLoading } = useSessionsByDay(90);

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
        Loading…
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <EmptyState
        title="No session data yet"
        sub="Sessions appear once you have games on at least one day."
        cta={{ label: "Open Settings", onClick: () => navigate("/settings") }}
      />
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Sessions</h1>
          <p>{days.length} days · grouped by calendar date</p>
        </div>
      </div>

      <div className="sessions-grid">
        {days.map((d) => (
          <DayCard key={d.date} day={d as Day} />
        ))}
      </div>
    </div>
  );
}
