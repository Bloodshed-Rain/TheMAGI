import { useViewState } from "../hooks/useViewState";
import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, Search, SlidersHorizontal, Trophy, UserRound, Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useOpponents, useOpponentDetail } from "../hooks/queries";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { WinrateBar } from "../components/ui/WinrateBar";
import { DataTable } from "../components/ui/DataTable";
import { ResultDot } from "../components/ui/ResultDot";
import { DossierPanel } from "../components/DossierPanel";
import "../styles/rivals.css";

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

function rivalStatus(winRate: number): string {
  if (winRate >= 0.6) return "Advantage";
  if (winRate <= 0.4) return "Problem";
  return "Even";
}

export function Rivals({ refreshKey: _ }: { refreshKey: number }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useViewState("rivals-search", "");
  const deferredSearch = useDeferredValue(search);
  const opponentSearch = deferredSearch.trim() || undefined;
  const { data: rawOpponents = [], isLoading, isFetching, isError, refetch } = useOpponents(opponentSearch);
  const opponents = rawOpponents as OpponentRecord[];
  const [selected, setSelected] = useViewState<string | null>("rivals-selected", null);
  useEffect(() => { const key = params.get("opponent"); if (key) setSelected(key); }, [params, setSelected]);
  const [sort, setSort] = useViewState<RivalSort>("rivals-sort", "volume");
  const [filter, setFilter] = useViewState<RivalFilter>("rivals-filter", "all");
  const [page, setPage] = useViewState("rivals-page", 0);

  const filterKey = JSON.stringify([deferredSearch, sort, filter]);
  const previousFilters = useRef(filterKey);
  useEffect(() => {
    if (previousFilters.current !== filterKey) setPage(0);
    previousFilters.current = filterKey;
  }, [filterKey, setPage]);

  const summary = useMemo(() => {
    const totalGames = opponents.reduce((sum, opponent) => sum + (opponent.totalGames ?? 0), 0);
    const winning = opponents.filter((opponent) => (opponent.winRate ?? 0) >= 0.5).length;
    const mostPlayed = [...opponents].sort((a, b) => (b.totalGames ?? 0) - (a.totalGames ?? 0))[0] ?? null;
    const hardest =
      [...opponents].filter((opponent) => (opponent.totalGames ?? 0) >= 3).sort((a, b) => a.winRate - b.winRate)[0] ??
      [...opponents].sort((a, b) => a.winRate - b.winRate)[0] ??
      null;

    return { totalGames, winning, mostPlayed, hardest };
  }, [opponents]);

  const visibleOpponents = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return opponents
      .filter((opponent) => {
        const characters = splitCharacters(opponent.characters).join(" ").toLowerCase();
        const searchable = [opponent.opponentTag, opponent.opponentConnectCode ?? "", characters]
          .join(" ")
          .toLowerCase();
        if (query && !searchable.includes(query)) return false;
        if (filter === "winning") return (opponent.winRate ?? 0) >= 0.5;
        if (filter === "losing") return (opponent.winRate ?? 0) < 0.5;
        if (filter === "close") return Math.abs((opponent.winRate ?? 0) - 0.5) <= 0.1;
        return true;
      })
      .sort((a, b) => {
        if (sort === "recent") {
          return new Date(b.lastPlayed ?? 0).getTime() - new Date(a.lastPlayed ?? 0).getTime();
        }
        if (sort === "hardest") {
          return (a.winRate ?? 0) - (b.winRate ?? 0) || (b.totalGames ?? 0) - (a.totalGames ?? 0);
        }
        if (sort === "winRate") {
          return (b.winRate ?? 0) - (a.winRate ?? 0) || (b.totalGames ?? 0) - (a.totalGames ?? 0);
        }
        return (b.totalGames ?? 0) - (a.totalGames ?? 0);
      });
  }, [deferredSearch, filter, opponents, sort]);

  const pageCount = Math.max(1, Math.ceil(visibleOpponents.length / PAGE_SIZE));
  const pageStart = visibleOpponents.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min(visibleOpponents.length, page * PAGE_SIZE + PAGE_SIZE);
  const pagedOpponents = visibleOpponents.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    if (!isLoading && !isFetching && !isError && page > 0 && page >= pageCount) {
      setPage(pageCount - 1);
    }
  }, [page, pageCount, isLoading, isFetching, isError, setPage]);

  if (selected) return <RivalDetail opponentKey={selected} onBack={() => { setSelected(null); setParams({}, { replace: true }); }} />;

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
        Loading rivals...
      </div>
    );
  }
  if (isError) {
    return <div className="sessions-error">Failed to load rivals. <button className="btn" onClick={() => void refetch()}>Retry</button><button className="btn" onClick={() => void refetch()}>Retry</button></div>;
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
            {visibleOpponents.length} of {opponents.length} {opponentSearch ? "matching opponents" : "opponents"} -{" "}
            {summary.totalGames} head-to-head games
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
            <strong>{summary.mostPlayed?.opponentTag ?? "-"}</strong>
            <small>{summary.mostPlayed ? `${summary.mostPlayed.totalGames} games` : ""}</small>
          </div>
        </div>
        <div className="rival-summary-panel rival-summary-panel-danger">
          <div className="rival-summary-icon">
            <SlidersHorizontal size={16} aria-hidden="true" />
          </div>
          <div>
            <span className="rival-summary-label">Problem Match</span>
            <strong>{summary.hardest?.opponentTag ?? "-"}</strong>
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
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tag, code, or character"
          />
        </label>

        <label className="rivals-sort" htmlFor="rivals-sort">
          <span>Sort</span>
          <select aria-label="Sort rivals" id="rivals-sort" value={sort} onChange={(event) => setSort(event.target.value as RivalSort)}>
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
              aria-pressed={filter === item.id}
              type="button"
              className={`rivals-filter-button${filter === item.id ? " rivals-filter-button-active" : ""}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {visibleOpponents.length === 0 ? (
        <div className="rivals-empty-panel">
          No rivals match those filters.
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setSearch("");
              setFilter("all");
              setPage(0);
            }}
          >
            Clear
          </button>
        </div>
      ) : (
        <>
          <div className="rivals-result-bar">
            <span>
              Showing <strong>{pageStart}</strong>-<strong>{pageEnd}</strong> of{" "}
              <strong>{visibleOpponents.length}</strong>
              {isFetching ? " - updating" : ""}
            </span>
            <div className="rivals-page-controls">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={page === 0 || isFetching}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                Previous
              </button>
              <span className="mono">
                {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={page + 1 >= pageCount || isFetching}
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              >
                Next
              </button>
            </div>
          </div>
          <div className="rivals-grid">
            {pagedOpponents.map((opponent, index) => {
              const key = getOpponentKey(opponent);
              const characters = splitCharacters(opponent.characters);
              const status = rivalStatus(opponent.winRate ?? 0);
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
                      <span>{recordLabel(opponent.wins, opponent.losses)}</span>
                    </div>
                  </div>
                  <div className="rival-card-record">
                    {opponent.wins}W-{opponent.losses}L - {opponent.totalGames} games
                  </div>
                  <WinrateBar value={opponent.winRate ?? 0} />
                  <div className="rival-chip-row">
                    {characters.slice(0, 3).map((character) => (
                      <span key={character} className="rival-character-chip">
                        {character}
                      </span>
                    ))}
                    {characters.length > 3 && <span className="rival-character-chip">+{characters.length - 3}</span>}
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

function RivalDetail({ opponentKey, onBack }: { opponentKey: string; onBack: () => void }) {
  const navigate = useNavigate();
  const { data: rawDetail, isLoading, isError, refetch } = useOpponentDetail(opponentKey);
  const detail = rawDetail as OpponentDetail | null | undefined;

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
        Loading dossier...
      </div>
    );
  }
  if (isError || !detail) {
    return (
      <div>
        <button className="btn btn-ghost rival-back-button" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" />
          All Rivals
        </button>
        <div className="sessions-error">Failed to load this rival.<button className="btn" onClick={() => void refetch()}>Retry</button></div>
      </div>
    );
  }

  const games = detail.games ?? [];
  const recentGames = games.slice(0, 8);
  const recentLosses = recentGames.filter(game => game.result === "loss").length;
  const recentDraws = recentGames.length - recentLosses - recentGames.filter(game => game.result === "win").length;
  const recentWins = recentGames.filter((game) => game.result === "win").length;
  const avgNeutral = detail.avgNeutralWinRate ?? 0;
  const avgLCancel = detail.avgLCancelRate ?? 0;
  const avgOpeningsPerKill = detail.avgOpeningsPerKill ?? 0;
  const avgEdgeguard = detail.avgEdgeguardSuccessRate ?? 0;
  const bestStage = [...(detail.stageBreakdown ?? [])].filter(stage => stage.totalGames >= 5).sort((a, b) => b.winRate - a.winRate)[0];
  const mainCharacter = detail.characterBreakdown?.[0];
  const lastPlayed = games[0]?.playedAt ?? null;

  return (
    <div className="rival-detail-page">
      <button className="btn btn-ghost rival-back-button" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" />
        All Rivals
      </button>

      <div className="rival-detail-hero">
        <div>
          <span className="rivals-eyebrow">Opponent dossier</span>
          <h1>{detail.opponentTag}</h1>
          <p>
            {detail.opponentConnectCode ?? "No connect code"} - last played {dateLabel(lastPlayed)}
          </p>
        </div>
        <div className="rival-detail-record">
          <span>Head to head</span>
          <strong>
            {detail.wins}W-{detail.losses}L
          </strong>
          <small>{pct(detail.winRate)} win rate</small>
        </div>
      </div>

      <div className="rival-detail-kpi-grid">
        <div className="rival-detail-kpi">
          <span>Recent Form</span>
          <strong>
            {recentWins}W-{recentLosses}L{recentDraws > 0 ? `-${recentDraws}D` : ""}
          </strong>
          <div className="rival-form-strip" aria-label="Recent game results">
            {recentGames.map((game) => (
              <button
                key={game.id}
                type="button"
                className="result-dot-button"
                onClick={() => navigate(`/game/${game.id}`)}
                aria-label={`Open ${game.result} vs ${detail.opponentTag}`}
                title={`${game.result} on ${game.stage}`}
              >
                <ResultDot result={game.result === "win" ? "win" : game.result === "loss" ? "loss" : "draw"} />
              </button>
            ))}
          </div>
        </div>
        <div className="rival-detail-kpi">
          <span>Neutral</span>
          <strong>{pct(avgNeutral, 1)}</strong>
          <small>average neutral wins</small>
        </div>
        <div className="rival-detail-kpi">
          <span>L-Cancel</span>
          <strong>{pct(avgLCancel, 1)}</strong>
          <small>against this opponent</small>
        </div>
        <div className="rival-detail-kpi">
          <span>Openings / Kill</span>
          <strong>{avgOpeningsPerKill.toFixed(2)}</strong>
          <small>{pct(avgEdgeguard)} edgeguards</small>
        </div>
      </div>

      <div className="rival-detail-grid">
        <div className="rival-detail-main">
          <div className="rival-scout-grid">
            <Card title="Stage Plan">
              <BreakdownList
                items={detail.stageBreakdown ?? []}
                labelFor={(item) => item.stage ?? "Unknown"}
                emptyLabel="No stage data yet."
              />
              {bestStage && (
                <p className="rival-scout-note">
                  Highest observed win rate (at least 5 games): <strong>{bestStage.stage}</strong> at {pct(bestStage.winRate)} across {bestStage.totalGames} games.
                </p>
              )}
            </Card>
            <Card title="Character Spread">
              <BreakdownList
                items={detail.characterBreakdown ?? []}
                labelFor={(item) => item.opponentCharacter ?? "Unknown"}
                emptyLabel="No character data yet."
              />
              {mainCharacter && (
                <p className="rival-scout-note">
                  Main look: <strong>{mainCharacter.opponentCharacter}</strong>, {mainCharacter.totalGames} games.
                </p>
              )}
            </Card>
          </div>

          <Card title="Recent games vs this rival">
            <DataTable colWidths={["34px", undefined, undefined, "76px", "76px", "72px", "72px"]}>
              <thead>
                <tr>
                  <th>Res</th>
                  <th>Matchup</th>
                  <th>Stage</th>
                  <th>Stocks</th>
                  <th>Neutral</th>
                  <th>L-Cancel</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {games.slice(0, 20).map((game) => {
                  const result: "win" | "loss" | "draw" =
                    game.result === "win" ? "win" : game.result === "loss" ? "loss" : "draw";
                  return (
                    <tr
                      key={game.id}
                      tabIndex={0}
                      role="button"
                      onClick={() => navigate(`/game/${game.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigate(`/game/${game.id}`);
                        }
                      }}
                      aria-label={`Open ${result} vs ${detail.opponentTag} on ${game.stage}`}
                    >
                      <td>
                        <ResultDot result={result} aria-hidden />
                      </td>
                      <td>
                        {game.playerCharacter} <span style={{ color: "var(--text-muted)" }}>vs</span>{" "}
                        {game.opponentCharacter}
                      </td>
                      <td>{game.stage}</td>
                      <td>
                        {game.playerFinalStocks}-{game.opponentFinalStocks}
                      </td>
                      <td>{pct(game.neutralWinRate)}</td>
                      <td>{pct(game.lCancelRate)}</td>
                      <td>{shortDate(game.playedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </Card>
        </div>

        <DossierPanel opponentKey={opponentKey} opponentTag={detail.opponentTag} />
      </div>
    </div>
  );
}

function BreakdownList({
  items,
  labelFor,
  emptyLabel,
}: {
  items: OpponentBreakdown[];
  labelFor: (item: OpponentBreakdown) => string;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="rival-scout-note">{emptyLabel}</p>;
  }

  return (
    <div className="rival-breakdown-list">
      {items.slice(0, 6).map((item) => {
        const label = labelFor(item);
        return (
          <div key={label} className="rival-breakdown-row">
            <div className="rival-breakdown-head">
              <strong>{label}</strong>
              <span>
                {item.wins}W-{item.losses}L
              </span>
            </div>
            <div className="rival-breakdown-track" aria-hidden="true">
              <div className="rival-breakdown-fill" style={{ width: pct(item.winRate) }} />
            </div>
            <div className="rival-breakdown-foot">
              <span>{item.totalGames} games</span>
              <strong>{pct(item.winRate)}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}
