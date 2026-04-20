import { useState } from "react";
import Markdown from "react-markdown";
import { useGlobalStore } from "../stores/useGlobalStore";
import { useRecentGames } from "../hooks/queries";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { StatGroupCard } from "./ui/StatGroupCard";

interface DrawerGame {
  id: number;
  result: "win" | "loss";
  playerCharacter?: string;
  opponentCharacter: string;
  opponentTag: string;
  stage: string;
  durationSeconds?: number;
  playerFinalStocks?: number;
  opponentFinalStocks?: number;
  neutralWinRate?: number;
  lCancelRate?: number;
  conversionRate?: number;
  avgDamagePerOpening?: number;
  openingsPerKill?: number;
  recoverySuccessRate?: number;
  avgDeathPercent?: number;
  powerShieldCount?: number;
  edgeguardSuccessRate?: number;
  totalDamageDealt?: number;
  killMove?: string | null;
  replayPath?: string;
}

interface StatItem {
  label: string;
  value: string | number;
  good?: boolean;
  isText?: boolean;
}
interface StatGroup {
  group: string;
  items: StatItem[];
}

function fmt(n: number | undefined, digits: number = 1, unit: string = ""): string {
  return typeof n === "number" ? `${n.toFixed(digits)}${unit}` : "—";
}

function buildStats(g: DrawerGame): StatGroup[] {
  return [
    {
      group: "Performance",
      items: [
        {
          label: "Neutral WR",
          value: fmt(g.neutralWinRate !== undefined ? g.neutralWinRate * 100 : undefined, 1, "%"),
          good: g.neutralWinRate !== undefined ? g.neutralWinRate >= 0.5 : false,
        },
        {
          label: "L-Cancel",
          value: fmt(g.lCancelRate !== undefined ? g.lCancelRate * 100 : undefined, 0, "%"),
          good: g.lCancelRate !== undefined ? g.lCancelRate >= 0.9 : false,
        },
        {
          label: "Conversion",
          value: fmt(g.conversionRate !== undefined ? g.conversionRate * 100 : undefined, 0, "%"),
          good: g.conversionRate !== undefined ? g.conversionRate >= 0.5 : false,
        },
        { label: "Dmg/Op", value: fmt(g.avgDamagePerOpening, 1) },
        { label: "Op/Kill", value: fmt(g.openingsPerKill, 1) },
      ],
    },
    {
      group: "Defense",
      items: [
        {
          label: "Recovery",
          value: fmt(g.recoverySuccessRate !== undefined ? g.recoverySuccessRate * 100 : undefined, 0, "%"),
          good: g.recoverySuccessRate !== undefined ? g.recoverySuccessRate >= 0.7 : false,
        },
        {
          label: "Death %",
          value: fmt(g.avgDeathPercent, 0, "%"),
          good: g.avgDeathPercent !== undefined ? g.avgDeathPercent >= 110 : false,
        },
        { label: "Power Shields", value: g.powerShieldCount ?? "—" },
      ],
    },
    {
      group: "Offense",
      items: [
        {
          label: "Edgeguard",
          value: fmt(g.edgeguardSuccessRate !== undefined ? g.edgeguardSuccessRate * 100 : undefined, 0, "%"),
          good: g.edgeguardSuccessRate !== undefined ? g.edgeguardSuccessRate >= 0.5 : false,
        },
        { label: "Dmg Dealt", value: fmt(g.totalDamageDealt, 0) },
        {
          label: "Kill Move",
          value: g.killMove ?? "—",
          isText: true,
        },
      ],
    },
  ];
}

export function GameDrawer() {
  const drawerGameId = useGlobalStore((s) => s.drawerGameId);
  const closeDrawer = useGlobalStore((s) => s.closeDrawer);
  const { data: games = [] } = useRecentGames(500);
  const game =
    drawerGameId != null ? ((games as unknown as DrawerGame[]).find((g) => g.id === drawerGameId) ?? null) : null;

  const [coaching, setCoaching] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);

  if (!game) return null;

  const stats = buildStats(game);
  const dur = typeof game.durationSeconds === "number" ? game.durationSeconds : 0;
  const mins = Math.floor(dur / 60);
  const secs = Math.round(dur % 60)
    .toString()
    .padStart(2, "0");
  const stocks = 4;

  const onGetCoaching = async () => {
    if (!game) return;
    setCoachLoading(true);
    setCoachError(null);
    try {
      const result = await window.clippi.analyzeScoped("game", game.id);
      const text = typeof result === "string" ? result : ((result as { content?: string })?.content ?? String(result));
      setCoaching(text);
    } catch (err) {
      setCoachError(err instanceof Error ? err.message : String(err));
    } finally {
      setCoachLoading(false);
    }
  };

  const onWatchReplay = () => {
    if (!game?.replayPath) return;
    window.clippi.openInDolphin(game.replayPath);
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={closeDrawer} />
      <div className="drawer" role="dialog" aria-label="Game details">
        <div className="drawer-header">
          <div>
            <div className="drawer-title-row">
              <Badge variant={game.result === "win" ? "win" : "loss"}>{game.result === "win" ? "W" : "L"}</Badge>
              <h2 style={{ margin: 0 }}>
                {game.playerCharacter || "—"} <span style={{ color: "var(--text-muted)" }}>vs</span>{" "}
                {game.opponentCharacter}
              </h2>
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              vs {game.opponentTag} · {game.stage} · {mins}:{secs}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={closeDrawer} aria-label="Close drawer">
            ×
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <button className="btn btn-primary" onClick={onGetCoaching} disabled={coachLoading}>
            {coachLoading ? "Analyzing…" : "Get Coaching"}
          </button>
          <button className="btn" onClick={onWatchReplay} disabled={!game.replayPath}>
            Watch Replay
          </button>
        </div>

        <Card title="Stock Timeline">
          <div className="drawer-stock-strip">
            {Array.from({ length: stocks }).map((_, i) => {
              const taken = i >= (game.playerFinalStocks ?? 0);
              return (
                <div key={i} className={`drawer-stock ${taken ? "taken" : "alive"}`}>
                  <div className="drawer-stock-label">Stock {i + 1}</div>
                  <div className="drawer-stock-state mono">{taken ? "—" : "alive"}</div>
                </div>
              );
            })}
          </div>
        </Card>

        {stats.map((s) => (
          <StatGroupCard key={s.group} title={s.group} items={s.items} />
        ))}

        {coachError && (
          <Card title="Coaching">
            <p style={{ color: "var(--loss)" }}>{coachError}</p>
          </Card>
        )}
        {coaching && (
          <Card title="Coaching">
            <div className="drawer-coaching-body">
              <Markdown>{coaching}</Markdown>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
