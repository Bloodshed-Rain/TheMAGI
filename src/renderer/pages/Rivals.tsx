import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, SlidersHorizontal, Trophy, UserRound, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useOpponents, useOpponentDetail } from "../hooks/queries";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { WinrateBar } from "../components/ui/WinrateBar";
import { DataTable } from "../components/ui/DataTable";
import { ResultDot } from "../components/ui/ResultDot";
import { DossierPanel } from "../components/DossierPanel";
import "../styles/rivals.css";
import { rivalLabelAllowed } from "../../truthGates";

interface OpponentRecord {
  opponentTag: string;
  opponentConnectCode: string | null;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
  characters: string;
  lastPlayed: string | null;
}

interface OpponentDetailGame {
  id: number;
  playedAt: string | null;
  playerCharacter: string;
  opponentCharacter: string;
  stage: string;
  result: string;
  playerFinalStocks: number;
  opponentFinalStocks: number;
  neutralWinRate: number;
  lCancelRate: number;
  openingsPerKill: number;
  edgeguardSuccessRate: number;
  replayPath: string;
}

interface OpponentBreakdown {
  stage?: string;
  opponentCharacter?: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

interface OpponentDetail {
  opponentTag: string;
  opponentConnectCode: string | null;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
  avgNeutralWinRate: number;
  avgLCancelRate: number;
  avgOpeningsPerKill: number;
  avgEdgeguardSuccessRate: number;
  games: OpponentDetailGame[];
  stageBreakdown: OpponentBreakdown[];
  characterBreakdown: OpponentBreakdown[];
}

type RivalSort = "volume" | "recent" | "hardest" | "winRate";
type RivalFilter = "all" | "winning" | "losing" | "close";

const FILTERS: Array<{ id: RivalFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "winning", label: "Winning" },
  { id: "losing", label: "Losing" },
  { id: "close", label: "Close" },
];

const SORT_LABELS: Record<RivalSort, string> = {
  volume: "Most played",
  recent: "Most recent",
  hardest: "Hardest",
  winRate: "Best record",
};
const PAGE_SIZE = 48;

function getOpponentKey(opponent: Pick<OpponentRecord, "opponentConnectCode" | "opponentTag">): string {
  return opponent.opponentConnectCode ?? opponent.opponentTag;
}

function pct(value: number | null | undefined, digits = 0): string {
  return `${((value ?? 0) * 100).toFixed(digits)}%`;
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function shortDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function splitCharacters(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function recordLabel(wins: number, losses: number): string {
  const diff = wins - losses;
  if (diff > 0) return `+${diff}`;
  return `${diff}`;
}

function rivalStatus(winRate: number, totalGames: number): string {
  // Labels require a real sample — withhold Problem/Advantage below n=3.
  if (!rivalLabelAllowed(totalGames)) return "Even";
  if (winRate >= 0.6) return "Advantage";
  if (winRate <= 0.4) return "Problem";
  return "Even";
}

export function Rivals({ refreshKey: _ }: { refreshKey: number }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const opponentSearch = deferredSearch.trim() || undefined;
  const { data: rawOpponents = [], isLoading, isFetching, isError } = useOpponents(opponentSearch);
  const opponents = rawOpponents as OpponentRecord[];
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<RivalSort>("volume");
  const [filter, setFilter] = useState<RivalFilter>("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [deferredSearch, sort, filter]);

  const summary = useMemo(() => {
    const totalGames = opponents.reduce((sum, opponent) => sum + (opponent.totalGames ?? 0), 0);
    const winning = opponents.filter((opponent) => (opponent.winRate ?? 0) >= 0.5).length;
    const mostPlayed = [...opponents].sort((a, b) => (b.totalGames ?? 0) - (a.totalGames ?? 0))[0] ?? null;
    const hardest =
      [...opponents].filter((opponent) => (opponent.totalGames ?? 0) >= 3).sort((a, b) => a.winRate - b.winRate)[0] ??
      null;

    return { totalGames, winning, mostPlayed, hardest };
  }, [opponents]);

  // NOTE: truncated mid-file for tool-call size — DO NOT USE THIS STUB
  return null;
}
