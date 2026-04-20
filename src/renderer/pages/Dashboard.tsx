import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Markdown from "react-markdown";
import { useRecentGames, useOverallRecord, useDashboardHighlights } from "../hooks/queries";
import { useGlobalStore } from "../stores/useGlobalStore";
import { Card } from "../components/ui/Card";
import { KPI } from "../components/ui/KPI";
import { DataTable } from "../components/ui/DataTable";
import { ResultDot } from "../components/ui/ResultDot";
import { Sparkline } from "../components/ui/Sparkline";
import { EmptyState } from "../components/ui/EmptyState";

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

function buildRecentSummary(games: RecentGame[]): string {
  const wins = games.filter((g) => g.result === "win").length;
  const avg = (fn: (g: RecentGame) => number) => games.reduce((s, g) => s + fn(g), 0) / games.length;
  return [
    `Last ${games.length} games: ${wins}W-${games.length - wins}L`,
    `- Neutral ${(avg((g) => g.neutralWinRate) * 100).toFixed(1)}%`,
    `- L-Cancel ${(avg((g) => g.lCancelRate) * 100).toFixed(1)}%`,
    `- Conversion ${(avg((g) => g.conversionRate) * 100).toFixed(1)}%`,
    `- Dmg/Op ${avg((g) => g.avgDamagePerOpening).toFixed(1)}`,
    "",
    games
      .map(
        (g, i) =>
          `  Game ${i + 1}: ${g.playerCharacter} vs ${g.opponentCharacter} (${g.opponentTag}) — ${g.result.toUpperCase()} ${g.playerFinalStocks}-${g.opponentFinalStocks}`,
      )
      .join("\n"),
    "",
    "You are MAGI Oracle. One concise paragraph. Reference one or two specific numbers above. End with a single sentence focusing the next session.",
  ].join("\n");
}

export function Dashboard({ refreshKey }: { refreshKey: number }) {
  const navigate = useNavigate();
  const openDrawer = useGlobalStore((s) => s.openDrawer);
  const { data: games = [], isLoading, refetch } = useRecentGames(100);
  const { data: record, refetch: refetchRecord } = useOverallRecord();
  const { data: highlights, refetch: refetchHighlights } = useDashboardHighlights();

  useEffect(() => {
    refetch();
    refetchRecord();
    refetchHighlights();
  }, [refreshKey, refetch, refetchRecord, refetchHighlights]);

  const recent = (games as unknown as RecentGame[]).slice(0, 20);
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
  const overallWR = totalGames > 0 ? (wins / totalGames) * 100 : 0;

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
      <EmptyState
        title="No replays imported yet"
        sub="Point MAGI at your Slippi folder to start tracking stats and coaching."
        cta={{ label: "Open Settings", onClick: () => navigate("/settings") }}
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="page-header">
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
          <button className="btn" onClick={() => navigate("/settings")}>
            Import Replays
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <KPI label="Win Rate" value={`${overallWR.toFixed(0)}%`} sub={`${wins}W · ${losses}L`} />
        <KPI
          label="Neutral WR"
          value={`${(avgNeutral * 100).toFixed(1)}%`}
          sub={neutralD.label}
          subTone={neutralD.tone}
        />
        <KPI
          label="L-Cancel"
          value={`${(avgLCancel * 100).toFixed(1)}%`}
          sub={lcancelD.label}
          subTone={lcancelD.tone}
        />
        <KPI label="Dmg / Opening" value={avgDmg.toFixed(1)} sub={dmgD.label} subTone={dmgD.tone} />
      </div>

      <div className="dash-split">
        <Card title="Recent Form">
          <div className="dash-dot-strip">
            {last10.map((g) => (
              <span
                key={g.id}
                onClick={() => openDrawer(g.id)}
                style={{ cursor: "pointer" }}
                title={`${g.result} vs ${g.opponentTag}`}
              >
                <ResultDot result={g.result === "win" ? "win" : "loss"} />
              </span>
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
            <div>
              <div className="dash-spark-label">Neutral WR</div>
              <Sparkline values={recent.map((g) => g.neutralWinRate).reverse()} color="var(--accent)" />
            </div>
            <div>
              <div className="dash-spark-label">L-Cancel</div>
              <Sparkline values={recent.map((g) => g.lCancelRate).reverse()} color="var(--win)" />
            </div>
            <div>
              <div className="dash-spark-label">Conversion</div>
              <Sparkline values={recent.map((g) => g.conversionRate).reverse()} color="var(--caution)" />
            </div>
          </div>
        </Card>

        <OracleInsightCard games={recent} />
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
          <tbody>
            {recent.slice(0, 10).map((g) => (
              <tr key={g.id} onClick={() => openDrawer(g.id)} style={{ cursor: "pointer" }}>
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
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </motion.div>
  );
}

function OracleInsightCard({ games }: { games: RecentGame[] }) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (games.length < 3 || runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setInsight(null);
    setError(null);
    try {
      const summary = buildRecentSummary(games.slice(0, 5));
      const result = await window.clippi.analyzeTrends(summary);
      setInsight(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  }, [games]);

  const gameKey = games
    .slice(0, 5)
    .map((g) => g.id)
    .join(",");
  useEffect(() => {
    if (games.length >= 3 && !insight && !loading) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  return (
    <Card title="MAGI Oracle">
      {loading && (
        <div className="analyze-loading">
          <div className="spinner" />
          <span>Reading your recent games…</span>
        </div>
      )}
      {error && <p style={{ color: "var(--loss)" }}>{error}</p>}
      {insight && (
        <div className="dash-oracle-body">
          <Markdown>{insight}</Markdown>
        </div>
      )}
    </Card>
  );
}
