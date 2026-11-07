import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useRecentGames, useOverallRecord, useDashboardHighlights } from "../hooks/queries";
import { Card } from "../components/ui/Card";
import { KPI } from "../components/ui/KPI";
import { RecentHighlightReel } from "../components/HighlightReel";
import { DataTable } from "../components/ui/DataTable";
import { ResultDot } from "../components/ui/ResultDot";
import { Sparkline } from "../components/ui/Sparkline";
import { EmptyState } from "../components/ui/EmptyState";
import { CoachingCards } from "../components/CoachingCards";

interface RecentGame {
  id: number;
  playedAt: string | null;
  stage: string;
  playerCharacter: string;
  opponentCharacter: string;
  opponentTag: string;
  result: "win" | "loss" | "draw";
  playerFinalStocks: number;
  opponentFinalStocks: number;
  neutralWinRate: number;
  lCancelRate: number;
  conversionRate: number;
  avgDamagePerOpening: number;
  replayPath: string;
}

function fmtDelta(d: number, invert = false): { label: string; tone: "good" | "bad" | "neutral" } {
  if (Math.abs(d) < 0.005) return { label: "—", tone: "neutral" };
  const improving = invert ? d < 0 : d > 0;
  const mag = (Math.abs(d) * 100).toFixed(1);
  return { label: `${improving ? "↑" : "↓"} ${mag}pp`, tone: improving ? "good" : "bad" };
}

function fmtDmgDelta(d: number): { label: string; tone: "good" | "bad" | "neutral" } {
  if (Math.abs(d) < 0.05) return { label: "—", tone: "neutral" };
  const improving = d > 0;
  return { label: `${improving ? "↑" : "↓"} ${Math.abs(d).toFixed(1)}`, tone: improving ? "good" : "bad" };
}

export function Dashboard({ refreshKey }: { refreshKey: number }) {
  const navigate = useNavigate();
  const { data: games = [], isLoading, refetch } = useRecentGames(20);
  const { data: record, refetch: refetchRecord } = useOverallRecord();
  const { data: highlights, refetch: refetchHighlights } = useDashboardHighlights();
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    refetch();
    refetchRecord();
    refetchHighlights();
  }, [refreshKey, refetch, refetchRecord, refetchHighlights]);

  const handleImport = useCallback(async () => {
    const config = await window.clippi.loadConfig();
    const tag = config?.connectCode || config?.targetPlayer;
    if (!tag) {
      navigate("/settings");
      return;
    }
    const folder = await window.clippi.openFolder();
    if (!folder) return;
    setImporting(true);
    try {
      await window.clippi.importFolder(folder, tag);
      refetch();
      refetchRecord();
      refetchHighlights();
    } finally {
      setImporting(false);
    }
  }, [navigate, refetch, refetchRecord, refetchHighlights]);

  const recent = useMemo(() => (games as unknown as RecentGame[]).slice(0, 20), [games]);
  const last10 = recent.slice(0, 10);
  const avgNeutral = useMemo(
    () => (recent.length ? recent.reduce((s, g) => s + g.neutralWinRate, 0) / recent.length : 0),
    [recent],
  );
  const avgLCancel = useMemo(
    () => (recent.length ? recent.reduce((s, g) => s + g.lCancelRate, 0) / recent.length : 0),
    [recent],
  );
  const avgDmg = useMemo(
    () => (recent.length ? recent.reduce((s, g) => s + g.avgDamagePerOpening, 0) / recent.length : 0),
    [recent],
  );

  const wins = record?.wins ?? 0;
  const losses = record?.losses ?? 0;
  const totalGames = record?.totalGames ?? recent.length;
  const decisiveGames = wins + losses;
  const overallWR = decisiveGames > 0 ? (wins / decisiveGames) * 100 : 0;

  const trends = highlights?.trends;
  const neutralD = trends ? fmtDelta(trends.neutralWinRate) : { label: "—", tone: "neutral" as const };
  const lcancelD = trends ? fmtDelta(trends.lCancelRate) : { label: "—", tone: "neutral" as const };
  const dmgD = trends ? fmtDmgDelta(trends.avgDamagePerOpening) : { label: "—", tone: "neutral" as const };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
        Loading…
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="dashboard-empty-wrap">
        <EmptyState
          title="No replays imported yet"
          sub="Point MAGI at your Slippi folder to start tracking stats and coaching."
          cta={{ label: "Import Replays", onClick: handleImport }}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header dash-header">
        <div>
          <h1>Dashboard</h1>
          <p>
            {totalGames} games · {wins}W-{losses}L
            {highlights?.streak
              ? highlights.streak > 0
                ? ` · ${highlights.streak}W streak`
                : ` · ${Math.abs(highlights.streak)}L streak`
              : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
            {importing ? "Importing…" : "Import Replays"}
          </button>
        </div>
      </div>

      <motion.div
        className="kpi-grid"
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 },
          },
        }}
        initial="hidden"
        animate="show"
      >
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 10 },
            show: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0.4 } },
          }}
        >
          <KPI label="Win Rate" value={`${overallWR.toFixed(0)}%`} sub={`${wins}W · ${losses}L`} />
        </motion.div>
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 10 },
            show: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0.4 } },
          }}
        >
          <KPI
            label="Neutral WR"
            value={`${(avgNeutral * 100).toFixed(1)}%`}
            sub={neutralD.label}
            subTone={neutralD.tone}
          />
        </motion.div>
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 10 },
            show: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0.4 } },
          }}
        >
          <KPI
            label="L-Cancel"
            value={`${(avgLCancel * 100).toFixed(1)}%`}
            sub={lcancelD.label}
            subTone={lcancelD.tone}
          />
        </motion.div>
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 10 },
            show: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0.4 } },
          }}
        >
          <KPI label="Dmg / Opening" value={avgDmg.toFixed(1)} sub={dmgD.label} subTone={dmgD.tone} />
        </motion.div>
      </motion.div>

      <RecentHighlightReel refreshKey={refreshKey} />

      <div className="dash-split">
        <Card title="Recent Form">
          <div className="dash-dot-strip">
            {last10.map((g) => (
              <motion.button
                key={g.id}
                type="button"
                className="result-dot-button"
                onClick={() => navigate(`/game/${g.id}`)}
                aria-label={`Open ${g.result} vs ${g.opponentTag}`}
                title={`${g.result} vs ${g.opponentTag}`}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
              >
                <ResultDot result={g.result === "win" ? "win" : "loss"} aria-hidden />
              </motion.button>
            ))}
            <span style={{ marginLeft: 12, fontSize: 12, color: "var(--text-muted)" }}>
              Last 10 ·{" "}
              <strong style={{ color: "var(--text)" }}>
                {last10.filter((g) => g.result === "win").length}W-
                {last10.filter((g) => g.result === "loss").length}L
              </strong>
            </span>
          </div>
          <div className="dash-spark-grid">
            <div className="dash-spark-cell">
              <div className="dash-spark-head">
                <span className="dash-spark-label">Neutral WR</span>
                <span className="dash-spark-value mono">{(avgNeutral * 100).toFixed(1)}%</span>
              </div>
              <Sparkline
                values={recent.map((g) => g.neutralWinRate).reverse()}
                color="var(--accent)"
                kind="chart"
                height={90}
                fill
              />
            </div>
            <div className="dash-spark-cell">
              <div className="dash-spark-head">
                <span className="dash-spark-label">L-Cancel</span>
                <span className="dash-spark-value mono">{(avgLCancel * 100).toFixed(1)}%</span>
              </div>
              <Sparkline
                values={recent.map((g) => g.lCancelRate).reverse()}
                color="var(--win)"
                kind="chart"
                height={90}
                fill
              />
            </div>
            <div className="dash-spark-cell">
              <div className="dash-spark-head">
                <span className="dash-spark-label">Conversion</span>
                <span className="dash-spark-value mono">
                  {((recent.reduce((s, g) => s + g.conversionRate, 0) / Math.max(recent.length, 1)) * 100).toFixed(1)}%
                </span>
              </div>
              <Sparkline
                values={recent.map((g) => g.conversionRate).reverse()}
                color="var(--caution)"
                kind="chart"
                height={90}
                fill
              />
            </div>
          </div>
        </Card>

        <CareerInsightCard refreshKey={refreshKey} />
      </div>

      <Card>
        <div className="dash-section-head">
          <div className="card-title" style={{ marginBottom: 0 }}>
            Recent Games
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/library")}>
            View all →
          </button>
        </div>
        <DataTable>
          <thead>
            <tr>
              <th></th>
              <th>Matchup</th>
              <th>Opponent</th>
              <th>Stage</th>
              <th>Stocks</th>
              <th>Neutral</th>
              <th>L-Cancel</th>
              <th>Dmg/Op</th>
              <th></th>
            </tr>
          </thead>
          <motion.tbody
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: { staggerChildren: 0.05 },
              },
            }}
          >
            {recent.slice(0, 10).map((g) => (
              <motion.tr
                key={g.id}
                variants={{
                  hidden: { opacity: 0, x: -10 },
                  show: { opacity: 1, x: 0, transition: { type: "spring", bounce: 0.2 } },
                }}
                onClick={() => navigate(`/game/${g.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/game/${g.id}`);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Open ${g.playerCharacter} versus ${g.opponentCharacter} game`}
                style={{ cursor: "pointer", originX: 0 }}
              >
                <td>
                  <ResultDot result={g.result === "win" ? "win" : "loss"} />
                </td>
                <td style={{ fontWeight: 600 }}>
                  {g.playerCharacter} <span style={{ color: "var(--text-muted)" }}>vs</span> {g.opponentCharacter}
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{g.opponentTag}</td>
                <td style={{ color: "var(--text-secondary)" }}>{g.stage}</td>
                <td className="mono">
                  {g.playerFinalStocks}-{g.opponentFinalStocks}
                </td>
                <td className="mono">{(g.neutralWinRate * 100).toFixed(1)}%</td>
                <td className="mono">{(g.lCancelRate * 100).toFixed(0)}%</td>
                <td className="mono">{g.avgDamagePerOpening.toFixed(1)}</td>
                <td style={{ color: "var(--text-muted)" }}>›</td>
              </motion.tr>
            ))}
          </motion.tbody>
        </DataTable>
      </Card>
    </div>
  );
}

function CareerInsightCard({ refreshKey }: { refreshKey: number }) {
  const [result, setResult] = useState<CareerAnalysisResult | null>(null);
  const [streamText, setStreamText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const run = useCallback(async (force: boolean) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setError(null);
    setStreamText("");
    const streamId = crypto.randomUUID();
    const removeListener = window.clippi.onAnalysisStream((chunk, sid) => {
      if (sid !== undefined && sid !== streamId) return;
      setStreamText((prev) => prev + chunk);
    });
    try {
      setResult(await window.clippi.analyzeCareer(force, streamId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      removeListener();
      setStreamText("");
      setLoading(false);
      runningRef.current = false;
    }
  }, []);

  // A cached analysis comes back without an AI call; the first one is generated once.
  useEffect(() => {
    run(false);
  }, [run, refreshKey]);

  const insufficient = result && result.insufficient ? result : null;
  const ready = result && !result.insufficient ? result : null;
  const newGames = ready ? ready.gamesNow - ready.gamesAnalyzed : 0;
  const text = loading && streamText ? streamText : (ready?.text ?? "");

  return (
    <Card title="MAGI on your whole record" className="clippi-card">
      {insufficient && (
        <p className="dash-career-meta">
          Import at least {insufficient.minGames} games to get an analysis of your full record (
          {insufficient.gamesPlayed} so far).
        </p>
      )}
      {ready && (
        <div className="dash-career-meta">
          <span>
            Based on all {ready.gamesAnalyzed} recorded games · generated {ready.createdAt.slice(0, 10)}
          </span>
          {newGames > 0 && !loading && (
            <button className="btn" onClick={() => run(true)}>
              Refresh with {newGames} new {newGames === 1 ? "game" : "games"}
            </button>
          )}
        </div>
      )}
      {loading && !streamText && (
        <div className="analyze-loading">
          <div className="spinner" />
          <span>Reading every game you have recorded…</span>
        </div>
      )}
      {error && (
        <div className="dash-career-error">
          <p style={{ color: "var(--loss)" }}>{error}</p>
          <button className="btn" onClick={() => run(false)}>
            Try again
          </button>
        </div>
      )}
      {text && (
        <div className="dash-oracle-body">
          <CoachingCards text={text} isStreaming={loading && !!streamText} />
        </div>
      )}
    </Card>
  );
}
