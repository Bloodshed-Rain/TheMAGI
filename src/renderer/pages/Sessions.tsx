import { LoadError } from "../components/ui/LoadError";
import { useViewState } from "../hooks/useViewState";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Markdown from "react-markdown";
import { useSessionsByDay } from "../hooks/queries";
import { Card } from "../components/ui/Card";
import { WinrateBar } from "../components/ui/WinrateBar";
import { ResultDot } from "../components/ui/ResultDot";
import { EmptyState } from "../components/ui/EmptyState";

interface Day {
  date: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  opponents: string[];
  gameIds: number[];
  gameResults?: Array<{ id: number; result: "win" | "loss" | "draw" | string }>;
}

const MAX_INLINE_DOTS = 16;

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
  const navigate = useNavigate();
  const [expanded, setExpanded] = useViewState(`session-expanded-${day.date}`, false);
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const decisive = day.wins + day.losses;
  const wr = decisive > 0 ? day.wins / decisive : 0;
  const pct = Math.round(wr * 100);

  const onReport = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await window.clippi.analyzeSession(day.date, report !== null);
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
        {day.draws > 0 && (
          <>
            -<span style={{ color: "var(--caution)" }}>{day.draws}D</span>
          </>
        )}
      </div>
      <div className="session-card-dots">
        {(() => {
          const games = day.gameResults ?? day.gameIds.map((id) => ({ id, result: "draw" }));
          const shown = expanded ? games : games.slice(0, MAX_INLINE_DOTS);
          const overflow = games.length - shown.length;
          return (
            <>
              {shown.map((game) => {
                const result = game.result === "win" ? "win" : game.result === "loss" ? "loss" : "draw";
                return (
                  <button
                    key={game.id}
                    type="button"
                    className="result-dot-button"
                    onClick={() => navigate(`/game/${game.id}`)}
                    aria-label={`Open ${result} game ${game.id}`}
                    title={`Open ${result} game`}
                  >
                    <ResultDot result={result} aria-hidden />
                  </button>
                );
              })}
              {overflow > 0 && (
                <button type="button" className="btn btn-ghost" onClick={() => setExpanded(true)}
                  aria-label={`Show ${overflow} more games`}
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                    alignSelf: "center",
                    marginLeft: 2,
                  }}
                >
                  +{overflow}
                </button>
              )}
            </>
          );
        })()}
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
  const [range, setRange] = useViewState("sessions-range", 90);
  const { data: days = [], isLoading, isError, refetch } = useSessionsByDay(range);

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
        Loading…
      </div>
    );
  }

  if (isError) {
    return <LoadError message="Sessions could not load." retry={() => void refetch()} />;
  }


  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Sessions</h1>
          <p>{days.length} days · grouped by calendar date</p>
        </div>
      </div>

      <label>History <select value={range} onChange={e => setRange(Number(e.target.value))}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option><option value={0}>All time</option></select></label>
      {days.length === 0 && <EmptyState title="No sessions in this period" sub="Choose a wider period or import replays." cta={{label:"Import replays",onClick:()=>navigate("/settings?section=replays")}} />}
      <div className="sessions-grid">
        {days.map((d) => (
          <DayCard key={d.date} day={d as Day} />
        ))}
      </div>
    </div>
  );
}
