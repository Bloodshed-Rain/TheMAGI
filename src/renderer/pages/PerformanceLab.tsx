import { LoadError } from "../components/ui/LoadError";
import { useViewState } from "../hooks/useViewState";
import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, BookOpenCheck, ClipboardPenLine, Dumbbell, Plus, Target } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { usePerformanceHub, useTrainingLog } from "../hooks/queries";

type PerformanceMetric = Awaited<ReturnType<typeof window.clippi.getPerformanceHub>>["metrics"][number];

const FRACTION_METRICS = new Set<PerformanceMetric["key"]>([
  "neutralWinRate",
  "conversionRate",
  "recoverySuccessRate",
  "lCancelRate",
  "edgeguardSuccessRate",
  "diSurvivalScore",
]);

const ACTIVITY_TYPES = ["Warmup", "Tech skill", "Friendlies", "VOD review", "Tournament", "Coaching"];

function formatMetric(metric: PerformanceMetric, value: number | null): string {
  if (value == null) return "—";
  if (FRACTION_METRICS.has(metric.key)) return `${(value * 100).toFixed(1)}%`;
  if (metric.key === "avgDeathPercent") return `${value.toFixed(0)}%`;
  return value.toFixed(1);
}

function formatDelta(metric: PerformanceMetric): { text: string; tone: "good" | "bad" | "neutral" } {
  if (metric.delta == null) return { text: "Baseline pending", tone: "neutral" };
  const signed = metric.higherIsBetter ? metric.delta : -metric.delta;
  const magnitude = FRACTION_METRICS.has(metric.key)
    ? `${Math.abs(metric.delta * 100).toFixed(1)}pp`
    : metric.key === "avgDeathPercent"
      ? `${Math.abs(metric.delta).toFixed(0)}pp`
      : Math.abs(metric.delta).toFixed(1);
  if (Math.abs(signed) < 0.001) return { text: "Holding steady", tone: "neutral" };
  return { text: `${signed > 0 ? "↑" : "↓"} ${magnitude} vs baseline`, tone: signed > 0 ? "good" : "bad" };
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function PerformanceLab({ refreshKey: _ }: { refreshKey: number }) {
  const navigate = useNavigate();
  const { data: hub, isLoading, isError, refetch: refetchHub } = usePerformanceHub();
  const [logPage, setLogPage] = useViewState("training-page", 0);
  const { data: logRows = [], isError: logsError, refetch: refetchLogs } = useTrainingLog(21, logPage * 20);
  const logs = logRows.slice(0, 20);
  const [showLogForm, setShowLogForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const trackedMinutes = useMemo(() => logs.reduce((sum, entry) => sum + entry.minutes, 0), [logs]);

  const saveLog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setFormError(null);
    try {
      await window.clippi.createTrainingLog({
        activityType: String(data.get("activityType") ?? ""),
        minutes: Number(data.get("minutes") ?? 0),
        focus: String(data.get("focus") ?? ""),
        energy: data.get("energy") ? Number(data.get("energy")) : null,
        confidence: data.get("confidence") ? Number(data.get("confidence")) : null,
        notes: String(data.get("notes") ?? ""),
      });
      form.reset();
      setLogPage(0);
      setShowLogForm(false);
      await Promise.all([refetchLogs(), refetchHub()]);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save this block.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
        Building your performance lab…
      </div>
    );
  }

  if (isError || !hub) {
    return <LoadError message="Performance Lab could not load." retry={() => void refetchHub()} />;
  }


  return (
    <div className="performance-lab">
      <div className="page-header performance-lab-header">
        <div>
          <span className="performance-eyebrow">Player development system</span>
          <h1>Performance Lab</h1>
          <p>
            Current form: {hub.sample.currentGames} games
            {hub.sample.baselineGames
              ? ` · compared with the ${hub.sample.baselineGames} games before it`
              : " · baseline pending"}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowLogForm((open) => !open)}>
          <Plus size={14} aria-hidden="true" />
          Log training
        </button>
      </div>

      {hub.sample.gamesScanned === 0 && <EmptyState title="No replay data to analyze yet" sub="Import replays for your scorecard. You can log training now." />}
      {showLogForm && (
        <Card className="training-log-form-card">
          <form className="training-log-form" onSubmit={saveLog}>
            <div className="training-log-form-head">
              <div>
                <div className="card-title">New training block</div>
                <p>Capture the work and how it felt. This is the context Slippi cannot read.</p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setShowLogForm(false)}>
                Cancel
              </button>
            </div>
            <div className="training-log-form-grid">
              <label>
                Type
                <select name="activityType" defaultValue="Friendlies">
                  {ACTIVITY_TYPES.map((activity) => (
                    <option key={activity}>{activity}</option>
                  ))}
                </select>
              </label>
              <label>
                Minutes
                <input name="minutes" type="number" min="0" max="1440" defaultValue="60" required />
              </label>
              <label>
                Energy (optional)
                <select name="energy" defaultValue="">
                  <option value="">Not logged</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>{`${value} / 5`}</option>
                  ))}
                </select>
              </label>
              <label>
                Confidence (optional)
                <select name="confidence" defaultValue="">
                  <option value="">Not logged</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>{`${value} / 5`}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="training-log-wide-field">
              Focus
              <input name="focus" placeholder="e.g. punish game after up-throw" maxLength={180} />
            </label>
            <label className="training-log-wide-field">
              What did you learn? (optional)
              <textarea
                name="notes"
                rows={3}
                placeholder="One observation, question, adjustment, or coach takeaway…"
                maxLength={4000}
              />
            </label>
            {formError && <p className="training-log-error">{formError}</p>}
            <div className="training-log-form-actions">
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save block"}
              </button>
            </div>
          </form>
        </Card>
      )}

      <section aria-labelledby="scorecard-heading">
        <div className="performance-section-heading">
          <div>
            <span className="performance-eyebrow">Replay telemetry</span>
            <h2 id="scorecard-heading">Current-form scorecard</h2>
          </div>
          <span className="performance-data-note">Replay facts first · no black-box rating</span>
        </div>
        <div className="performance-metric-grid">
          {hub.metrics.map((metric) => {
            const delta = formatDelta(metric);
            return (
              <Card key={metric.key} className="performance-metric-card">
                <div className="performance-metric-head">
                  <span>{metric.label}</span>
                  <span className={`performance-delta performance-delta-${delta.tone}`}>{delta.text}</span>
                </div>
                <div className="performance-metric-value">{formatMetric(metric, metric.current)}</div>
                <div className="performance-metric-comparison">
                  <span>Prior {formatMetric(metric, metric.baseline)}</span>
                  <span>
                    Wins {formatMetric(metric, metric.winValue)} · Losses {formatMetric(metric, metric.lossValue)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="performance-lab-split">
        <section aria-labelledby="insights-heading">
          <div className="performance-section-heading">
            <div>
              <span className="performance-eyebrow">Decision support</span>
              <h2 id="insights-heading">What to act on</h2>
            </div>
          </div>
          <div className="performance-insight-stack">
            {hub.insights.length ? (
              hub.insights.map((insight) => (
                <Card
                  key={`${insight.kind}-${insight.title}`}
                  className={`performance-insight performance-insight-${insight.kind}`}
                >
                  <div className="performance-insight-icon">
                    {insight.kind === "progress" ? (
                      <ArrowUpRight size={16} />
                    ) : insight.kind === "focus" ? (
                      <Target size={16} />
                    ) : (
                      <BookOpenCheck size={16} />
                    )}
                  </div>
                  <div>
                    <h3>{insight.title}</h3>
                    <p>{insight.detail}</p>
                  </div>
                </Card>
              ))
            ) : (
              <Card className="performance-insight performance-insight-progress">
                <div className="performance-insight-icon">
                  <Dumbbell size={16} />
                </div>
                <div>
                  <h3>Keep collecting clean samples</h3>
                  <p>MAGI will surface a focused review target once the next block establishes a meaningful change.</p>
                </div>
              </Card>
            )}
          </div>
        </section>

        <section aria-labelledby="training-log-heading">
          <div className="performance-section-heading">
            <div>
              <span className="performance-eyebrow">Player context</span>
              <h2 id="training-log-heading">Training log</h2>
            </div>
            <span className="performance-data-note">{trackedMinutes} min on this page</span>
          </div>
          <Card className="training-log-card">
            {logsError ? <LoadError message="Training history could not load." retry={() => void refetchLogs()} /> : logs.length === 0 ? (
              <div className="training-log-empty">
                <ClipboardPenLine size={18} />
                <p>Log warmups, drills, VOD review, tournament sets, and coaching takeaways alongside replay data.</p>
                <button type="button" className="btn btn-ghost" onClick={() => setShowLogForm(true)}>
                  Add first block
                </button>
              </div>
            ) : (
              <div className="training-log-list">
                {logs.map((entry) => (
                  <div key={entry.id} className="training-log-entry">
                    <div className="training-log-entry-topline">
                      <strong>{entry.activityType}</strong>
                      <span>{dateLabel(entry.loggedAt)}</span>
                    </div>
                    <div className="training-log-entry-meta">
                      <span>{entry.minutes} min</span>
                      {entry.energy != null && <span>Energy {entry.energy}/5</span>}
                      {entry.confidence != null && <span>Confidence {entry.confidence}/5</span>}
                    </div>
                    {entry.focus && <p className="training-log-entry-focus">{entry.focus}</p>}
                    {entry.notes && <p className="training-log-entry-note">{entry.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <div className="audit-pagination"><button className="btn" disabled={logPage === 0} onClick={() => setLogPage(p => p - 1)}>Newer blocks</button><span>Page {logPage + 1}</span><button className="btn" disabled={logRows.length <= 20} onClick={() => setLogPage(p => p + 1)}>Older blocks</button></div>
        </section>
      </div>

      <section aria-labelledby="review-queue-heading">
        <div className="performance-section-heading">
          <div>
            <span className="performance-eyebrow">Replay review</span>
            <h2 id="review-queue-heading">Prioritized review queue</h2>
          </div>
          <span className="performance-data-note">
            Ranked by gaps from your recent wins — not a verdict on why you lost
          </span>
        </div>
        <Card className="performance-review-card">
          {hub.reviewQueue.length === 0 ? (
            <div className="training-log-empty">
              <BookOpenCheck size={18} />
              <p>Losses will appear here when MAGI has enough replay data to compare them against your recent wins.</p>
            </div>
          ) : (
            <div className="performance-review-list">
              {hub.reviewQueue.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  className="performance-review-row"
                  onClick={() => navigate(`/game/${game.id}`)}
                >
                  <span className="performance-review-index">#{game.id}</span>
                  <div className="performance-review-main">
                    <div className="performance-review-title">
                      {game.playerCharacter} <span>vs</span> {game.opponentCharacter}{" "}
                      <strong>· {game.opponentTag}</strong>
                    </div>
                    <div className="performance-review-reason">{game.reviewReason}</div>
                  </div>
                  <div className="performance-review-meta">
                    <Badge variant={game.priority === "high" ? "loss" : "neutral"}>{game.priority}</Badge>
                    <span>
                      {game.playerFinalStocks}-{game.opponentFinalStocks}
                    </span>
                    <span>
                      {game.noteCount ? `${game.noteCount} note${game.noteCount === 1 ? "" : "s"}` : "Needs notes"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
