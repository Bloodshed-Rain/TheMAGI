import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search, Trophy, UserRound, Zap, SlidersHorizontal, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useOpponents, useOpponentDetail } from "../hooks/queries";
import { EmptyState } from "../components/ui/EmptyState";
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

function pct(value: number | null | undefined, digits = 0): string {
  return `${((value ?? 0) * 100).toFixed(digits)}%`;
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
  const { data: rawOpponents = [], isLoading, isError } = useOpponents(opponentSearch);
  const opponents = rawOpponents as OpponentRecord[];
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<RivalSort>("volume");
  const [filter, setFilter] = useState<RivalFilter>("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [deferredSearch, sort, filter]);

  const summary = useMemo(() => {
    const totalGames = opponents.reduce((sum, o) => sum + (o.totalGames ?? 0), 0);
    const winning = opponents.filter((o) => (o.winRate ?? 0) >= 0.5).length;
    const mostPlayed = [...opponents].sort((a, b) => (b.totalGames ?? 0) - (a.totalGames ?? 0))[0] ?? null;
    const hardest =
      [...opponents].filter((o) => (o.totalGames ?? 0) >= 3).sort((a, b) => a.winRate - b.winRate)[0] ?? null;
    return { totalGames, winning, mostPlayed, hardest };
  }, [opponents]);

  const visible = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return opponents
      .filter((o) => {
        const hay = [o.opponentTag, o.opponentConnectCode ?? "", o.characters].join(" ").toLowerCase();
        if (query && !hay.includes(query)) return false;
        if (filter === "winning") return (o.winRate ?? 0) >= 0.5;
        if (filter === "losing") return (o.winRate ?? 0) < 0.5;
        if (filter === "close") return Math.abs((o.winRate ?? 0) - 0.5) <= 0.1;
        return true;
      })
      .sort((a, b) => {
        if (sort === "recent") return new Date(b.lastPlayed ?? 0).getTime() - new Date(a.lastPlayed ?? 0).getTime();
        if (sort === "hardest") return (a.winRate ?? 0) - (b.winRate ?? 0);
        if (sort === "winRate") return (b.winRate ?? 0) - (a.winRate ?? 0);
        return (b.totalGames ?? 0) - (a.totalGames ?? 0);
      });
  }, [deferredSearch, filter, opponents, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (selected) {
    return (
      <div className="rival-detail-page">
        <button className="btn btn-ghost rival-back-button" onClick={() => setSelected(null)}>
          <ArrowLeft size={14} aria-hidden="true" />
          All Rivals
        </button>
        <DossierPanel opponentKey={selected} opponentTag={selected} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
        Loading rivals...
      </div>
    );
  }
  if (isError) {
    return <div className="sessions-error">Failed to load rivals. Please try again.</div>;
  }
  if (opponents.length === 0 && !opponentSearch) {
    return (
      <EmptyState
        title="No rivals yet"
        sub="Rivals appear once you've played opponents. Import replays to start scouting."
        cta={{ label: "Open Settings", onClick: () => navigate("/settings") }}
      />
    );
  }

  return (
    <div className="rivals-page">
      <div className="page-header rivals-header">
        <div>
          <h1>Rivals</h1>
          <p>
            {visible.length} of {opponents.length} opponents — {summary.totalGames} head-to-head games
          </p>
        </div>
      </div>

      <div className="rivals-summary-grid">
        <div className="rival-summary-panel">
          <div className="rival-summary-icon">
            <UserRound size={16} aria-hidden="true" />
          </div>
          <div>
            <span className="rival-summary-label">Tracked Rivals</span>
            <strong>{opponents.length}</strong>
          </div>
        </div>
        <div className="rival-summary-panel">
          <div className="rival-summary-icon">
            <Trophy size={16} aria-hidden="true" />
          </div>
          <div>
            <span className="rival-summary-label">Winning Records</span>
            <strong>{summary.winning}</strong>
          </div>
        </div>
        <div className="rival-summary-panel">
          <div className="rival-summary-icon">
            <Zap size={16} aria-hidden="true" />
          </div>
          <div>
            <span className="rival-summary-label">Most Played</span>
            <strong>{summary.mostPlayed?.opponentTag ?? "—"}</strong>
          </div>
        </div>
        <div className="rival-summary-panel rival-summary-panel-danger">
          <div className="rival-summary-icon">
            <SlidersHorizontal size={16} aria-hidden="true" />
          </div>
          <div>
            <span className="rival-summary-label">Problem Match</span>
            <strong>{summary.hardest?.opponentTag ?? "—"}</strong>
            <small>{summary.hardest ? pct(summary.hardest.winRate) : ""}</small>
          </div>
        </div>
      </div>

      <div className="rivals-controls">
        <label className="rivals-search" htmlFor="rivals-search">
          <Search size={15} aria-hidden="true" />
          <input
            id="rivals-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tag, code, or character"
          />
        </label>
        <label className="rivals-sort" htmlFor="rivals-sort">
          <span>Sort</span>
          <select id="rivals-sort" value={sort} onChange={(e) => setSort(e.target.value as RivalSort)}>
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="rivals-filter-row" role="group" aria-label="Filter rivals">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rivals-filter-button${filter === item.id ? " rivals-filter-button-active" : ""}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rivals-empty-panel">No rivals match those filters.</div>
      ) : (
        <>
          <div className="rivals-result-bar">
            <span>
              Page {page + 1} / {pageCount}
            </span>
            <div className="rivals-page-controls">
              <button type="button" className="btn btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
          <div className="rivals-grid">
            {paged.map((opponent, index) => {
              const key = opponent.opponentConnectCode ?? opponent.opponentTag;
              const status = rivalStatus(opponent.winRate ?? 0, opponent.totalGames ?? 0);
              return (
                <button
                  key={key}
                  type="button"
                  className={`rival-card rival-card-${status.toLowerCase()}`}
                  onClick={() => setSelected(key)}
                >
                  <div className="rival-card-topline">
                    <span className="rival-rank">#{page * PAGE_SIZE + index + 1}</span>
                    <span className="rival-status">{status}</span>
                  </div>
                  <div className="rival-card-head">
                    <div>
                      <div className="rival-card-tag">{opponent.opponentTag}</div>
                      <div className="rival-card-code">{opponent.opponentConnectCode ?? "No connect code"}</div>
                    </div>
                    <div className="rival-card-score">
                      <strong>{pct(opponent.winRate)}</strong>
                    </div>
                  </div>
                  <div className="rival-card-record">
                    {opponent.wins}W-{opponent.losses}L — {opponent.totalGames} games
                  </div>
                  <div className="rival-card-footer">
                    <span>Last played</span>
                    <strong>{dateLabel(opponent.lastPlayed)}</strong>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
