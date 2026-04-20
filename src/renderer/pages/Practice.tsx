import { useEffect, useState } from "react";
import { useDashboardHighlights } from "../hooks/queries";
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
  const { data: highlights } = useDashboardHighlights();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setPlans(await window.clippi.listPracticePlans());
  };

  useEffect(() => {
    refresh();
  }, []);

  const onNewPlan = async () => {
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

  const onToggle = async (plan: Plan, drill: Drill) => {
    await window.clippi.setDrillCompletion(drill.id, !drill.completed);
    setPlans((prev) =>
      prev.map((p) =>
        p.id !== plan.id
          ? p
          : {
              ...p,
              drills: p.drills.map((d) => (d.id === drill.id ? { ...d, completed: !d.completed } : d)),
            },
      ),
    );
  };

  const onDelete = async (planId: number) => {
    await window.clippi.deletePracticePlan(planId);
    setPlans((prev) => prev.filter((p) => p.id !== planId));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Practice</h1>
          <p>{plans.length} plans · MAGI-generated from weakness patterns</p>
        </div>
        <button className="btn btn-primary" onClick={onNewPlan} disabled={generating}>
          {generating ? "Generating…" : "+ New Plan"}
        </button>
      </div>

      {err && <p style={{ color: "var(--loss)" }}>{err}</p>}

      {plans.length === 0 && !generating ? (
        <EmptyState
          title="No practice plans yet"
          sub="MAGI can read your stats and generate a drill plan tailored to your weakest areas."
          cta={{ label: "+ Generate First Plan", onClick: onNewPlan }}
        />
      ) : (
        <div className="practice-grid">
          {plans.map((p) => {
            const done = p.drills.filter((d) => d.completed).length;
            const total = p.drills.length;
            const pct = total > 0 ? done / total : 0;
            const due = total - done;
            return (
              <Card key={p.id}>
                <div className="practice-head">
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                  <Badge variant={due > 0 ? "neutral" : "win"}>{due > 0 ? `${due} due` : "done"}</Badge>
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
                <div className="practice-drills">
                  {p.drills.map((d) => (
                    <label key={d.id} className="practice-drill-row">
                      <input
                        type="checkbox"
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
                <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => onDelete(p.id)}>
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
