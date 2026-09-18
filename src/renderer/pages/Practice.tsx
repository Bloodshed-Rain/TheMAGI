import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { parsePracticeBaseline, formatPracticeMetric } from "../../practiceBaseline";
import { LoadError } from "../components/ui/LoadError";
import { useState } from "react";
import { useDashboardHighlights, usePerformanceHub, useRecentGames } from "../hooks/queries";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { WinrateBar } from "../components/ui/WinrateBar";
import { EmptyState } from "../components/ui/EmptyState";

interface Drill {
  id: number;
  name: string;
  target: string;
  completed: boolean;
  sortOrder: number;
}
interface Plan {
  id: number;
  name: string;
  weaknessSummary: string | null;
  baselineJson?: string | null;
  createdAt: string;
  drills: Drill[];
}

function buildWeaknessSummary(h: ReturnType<typeof useDashboardHighlights>["data"]): string {
  if (!h) return "No recent data available.";
  const t = h.trends;
  return [
    "Weakness profile:",
    `- Neutral WR trend: ${(t.neutralWinRate * 100).toFixed(1)}pp`,
    `- L-Cancel trend: ${(t.lCancelRate * 100).toFixed(1)}pp`,
    `- Edgeguard trend: ${(t.edgeguardSuccessRate * 100).toFixed(1)}pp`,
    `- Openings/Kill trend: ${t.openingsPerKill.toFixed(2)} (lower is better)`,
    `- Conversion trend: ${(t.conversionRate * 100).toFixed(1)}pp`,
    `- Dmg/Opening trend: ${t.avgDamagePerOpening.toFixed(2)}`,
    h.worstMatchup
      ? `- Struggles vs ${h.worstMatchup.opponentCharacter} (${(h.worstMatchup.winRate * 100).toFixed(0)}% WR over ${h.worstMatchup.games} games)`
      : "",
    h.bestMatchup
      ? `- Strong vs ${h.bestMatchup.opponentCharacter} (${(h.bestMatchup.winRate * 100).toFixed(0)}% WR)`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function Practice({ refreshKey: _ }: { refreshKey: number }) {
  const navigate = useNavigate();
  const { data: hub } = usePerformanceHub();
  const { data: latest = [] } = useRecentGames(1);
  const [mutating, setMutating] = useState(false);
  const { data: highlights, isLoading: highlightsLoading, isError: highlightsError, refetch: retryHighlights } = useDashboardHighlights();
  const { data: plans = [], isLoading, isError, refetch } = useQuery<Plan[]>({ queryKey: ["practicePlans"], queryFn: () => window.clippi.listPracticePlans() });
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => { await refetch(); };

  const onNewPlan = async () => {
    if (generating || highlightsLoading || highlightsError) return;
    setGenerating(true);
    setErr(null);
    try {
      await window.clippi.generatePracticePlan(buildWeaknessSummary(highlights));
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const onToggle = async (_plan: Plan, drill: Drill) => {
    if (mutating) return;
    setMutating(true); setErr(null);
    try { await window.clippi.setDrillCompletion(drill.id, !drill.completed); await refresh(); }
    catch (error) { setErr(error instanceof Error ? error.message : String(error)); }
    finally { setMutating(false); }
  };
  const onDelete = async (planId: number) => {
    if (mutating || !confirm("Delete this practice plan and its progress?")) return;
    setMutating(true); setErr(null);
    try { await window.clippi.deletePracticePlan(planId); await refresh(); }
    catch (error) { setErr(error instanceof Error ? error.message : String(error)); }
    finally { setMutating(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Practice</h1>
          <p>{plans.length} plans · MAGI-generated from weakness patterns</p>
        </div>
        <button className="btn btn-primary" onClick={onNewPlan} disabled={generating || highlightsLoading || highlightsError}>
          {generating ? "Generating…" : "+ New Plan"}
        </button>
      </div>

      {highlightsError && <LoadError message="Replay context could not load." retry={() => void retryHighlights()} />}
      {err && <p role="alert" style={{ color: "var(--loss)" }}>{err}</p>}

      {isError ? <LoadError message="Practice plans could not load." retry={() => void refetch()} /> : isLoading ? <p role="status">Loading practice plans…</p> : generating && plans.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: "64px 0",
            color: "var(--text-secondary)",
          }}
        >
          <div className="spinner" />
          <span>MAGI is building your plan…</span>
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          title="No practice plans yet"
          sub="MAGI can read your stats and generate a drill plan tailored to your weakest areas."
          cta={{ label: "+ Generate First Plan", onClick: onNewPlan, disabled: generating || highlightsLoading || highlightsError }}
        />
      ) : (
        <div
          className="practice-grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 520px))", justifyContent: "start" }}
        >
          {plans.map((p) => {
            const baseline = parsePracticeBaseline(p.baselineJson);
            const hasNewGames = baseline && latest[0]?.id != null && latest[0].id !== baseline.latestReplayId;
            const done = p.drills.filter((d) => d.completed).length;
            const total = p.drills.length;
            const pct = total > 0 ? done / total : 0;
            const due = total - done;
            return (
              <Card key={p.id}>
                <div className="practice-head">
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                  <Badge variant={due > 0 ? "neutral" : "win"}>{due > 0 ? `${due} remaining` : "done"}</Badge>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
                  <span className="mono">
                    {done}/{total}
                  </span>{" "}
                  drills complete
                </div>
                <div style={{ marginBottom: 14 }}>
                  <WinrateBar value={pct} />
                </div>
                <details className="practice-evidence"><summary>Why this plan · Evidence and progress</summary><p style={{ whiteSpace: "pre-wrap" }}>{p.weaknessSummary || "No weakness profile saved for this plan."}</p>{baseline?.evidenceReplayId && <button className="btn" onClick={() => navigate(`/game/${baseline.evidenceReplayId}`)}>Review supporting replay</button>}{baseline ? <><p>Baseline: {baseline.sampleGames} games, saved {new Date(baseline.capturedAt).toLocaleDateString()}. {hasNewGames ? "Current rolling sample may overlap the baseline; this comparison does not measure the effect of practice alone." : "Import new games after practice to compare your next sample."}</p><div className="audit-data-scroll"><table><thead><tr><th>Metric</th><th>Saved baseline</th><th>Current {hub?.sample.currentGames ?? 0} games</th></tr></thead><tbody>{baseline.metrics.map(metric => <tr key={metric.key}><th>{metric.label}</th><td>{formatPracticeMetric(metric.key, metric.value)}</td><td>{hasNewGames ? formatPracticeMetric(metric.key, hub?.metrics.find(item => item.key === metric.key)?.current) : "Awaiting new games"}</td></tr>)}</tbody></table></div></> : <p>This older plan has no saved metric baseline. A new plan will capture one.</p>}</details>
                <p className="audit-sample-note">Review the example, work through each drill's target, then log your training and import your next games.</p><button className="btn" onClick={() => navigate("/performance")}>Log training</button>
                <div className="practice-drills">
                  {p.drills.map((d) => (
                    <label key={d.id} className="practice-drill-row">
                      <input
                        type="checkbox"
                        disabled={mutating}
                        checked={d.completed}
                        onChange={() => onToggle(p, d)}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      <div>
                        <div
                          style={{
                            color: d.completed ? "var(--text-muted)" : "var(--text)",
                            textDecoration: d.completed ? "line-through" : "none",
                            fontSize: 13,
                          }}
                        >
                          {d.name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.target}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <button className="btn btn-danger" disabled={mutating} style={{ marginTop: 10 }} onClick={() => onDelete(p.id)}>
                  Delete plan
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
