import { StatGroupCard } from "./ui/StatGroupCard";
import { analysisStatusDetail, analysisStatusLabel, type AnalysisStatus } from "../utils/analysisStatus";

export interface GameStatsInput {
  analysisStatus?: AnalysisStatus | string;
  analysisError?: string | null;
  statsAvailable?: boolean;
  neutralWinRate?: number | null;
  lCancelRate?: number | null;
  conversionRate?: number | null;
  avgDamagePerOpening?: number | null;
  openingsPerKill?: number | null;
  recoverySuccessRate?: number | null;
  avgDeathPercent?: number | null;
  powerShieldCount?: number | null;
  edgeguardSuccessRate?: number | null;
  totalDamageDealt?: number | null;
  killMove?: string | null;
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

function fmt(n: number | null | undefined, digits: number = 1, unit: string = ""): string {
  return typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(digits)}${unit}` : "—";
}

function buildStats(g: GameStatsInput): StatGroup[] {
  const performance: StatGroup = {
    group: "Performance",
    items: [
      {
        label: "Neutral WR",
        value: fmt(g.neutralWinRate != null ? g.neutralWinRate * 100 : undefined, 1, "%"),
        good: g.neutralWinRate != null ? g.neutralWinRate >= 0.5 : false,
      },
      {
        label: "L-Cancel",
        value: fmt(g.lCancelRate != null ? g.lCancelRate * 100 : undefined, 0, "%"),
        good: g.lCancelRate != null ? g.lCancelRate >= 0.9 : false,
      },
      {
        label: "Conversion",
        value: fmt(g.conversionRate != null ? g.conversionRate * 100 : undefined, 0, "%"),
        good: g.conversionRate != null ? g.conversionRate >= 0.5 : false,
      },
      { label: "Dmg/Op", value: fmt(g.avgDamagePerOpening, 1) },
      { label: "Op/Kill", value: fmt(g.openingsPerKill, 1) },
    ],
  };

  const defense: StatGroup = {
    group: "Defense",
    items: [
      {
        label: "Recovery",
        value: fmt(g.recoverySuccessRate != null ? g.recoverySuccessRate * 100 : undefined, 0, "%"),
        good: g.recoverySuccessRate != null ? g.recoverySuccessRate >= 0.7 : false,
      },
      {
        label: "Death %",
        value: fmt(g.avgDeathPercent, 0, "%"),
        good: g.avgDeathPercent != null ? g.avgDeathPercent >= 110 : false,
      },
      { label: "Power Shields", value: g.powerShieldCount ?? "—" },
    ],
  };

  const offense: StatGroup = {
    group: "Offense",
    items: [
      {
        label: "Edgeguard",
        value: fmt(g.edgeguardSuccessRate != null ? g.edgeguardSuccessRate * 100 : undefined, 0, "%"),
        good: g.edgeguardSuccessRate != null ? g.edgeguardSuccessRate >= 0.5 : false,
      },
      { label: "Dmg Dealt", value: fmt(g.totalDamageDealt, 0) },
    ],
  };

  if (g.killMove !== undefined) {
    offense.items.push({ label: "Kill Move", value: g.killMove ?? "—", isText: true });
  }

  return [performance, defense, offense];
}

export function GameStats({ game }: { game: GameStatsInput }) {
  const unavailable = game.statsAvailable === false || (game.analysisStatus && game.analysisStatus !== "ok");

  if (unavailable) {
    return (
      <div className="analysis-unavailable" role="status">
        <strong>{analysisStatusLabel(game.analysisStatus)}</strong>
        <p>{analysisStatusDetail(game.analysisStatus, game.analysisError)}</p>
      </div>
    );
  }

  const stats = buildStats(game);
  return (
    <>
      {stats.map((s) => (
        <StatGroupCard key={s.group} title={s.group} items={s.items} />
      ))}
    </>
  );
}
