import { analysisStatusLabel } from "../utils/analysisStatus";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLibraryGames } from "../hooks/queries";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { KPI } from "../components/ui/KPI";
import { Pill, PillRow } from "../components/ui/Pill";
import { ResultDot } from "../components/ui/ResultDot";
import { EmptyState } from "../components/ui/EmptyState";
import { LibraryFilters, LibraryGame } from "./library/filter";

const RESULTS: Array<LibraryFilters["result"]> = ["all", "win", "loss"];
const PAGE_SIZE = 100;
const EVENT_SEARCH_SUGGESTIONS = ["Zero-to-Death", "Ken Combo", "Waveshine", "Stomp Knee", "Rest Kill"];

export function Library({ refreshKey: _ }: { refreshKey: number }) {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [char, setChar] = useState<LibraryFilters["char"]>("all");
  const [stage, setStage] = useState<LibraryFilters["stage"]>("all");
  const [result, setResult] = useState<LibraryFilters["result"]>("all");
  const [page, setPage] = useState(0);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setPage(0);
  }, [deferredSearch, char, stage, result]);

  const filters = useMemo(
    () => ({
      search: deferredSearch,
      char,
      stage,
      result,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [deferredSearch, char, stage, result, page],
  );

  const { data, isLoading, isError, refetch, isFetching } = useLibraryGames(filters);
  const games = (data?.games ?? []) as LibraryGame[];
  const total = data?.total ?? 0;
  const totalUnfiltered = data?.totalUnfiltered ?? total;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = page * PAGE_SIZE + games.length;
  const showingSearchMatches = deferredSearch.trim() !== "";
  const columnCount = showingSearchMatches ? 10 : 9;

  useEffect(() => {
    if (page > 0 && page >= pageCount) {
      setPage(pageCount - 1);
    }
  }, [page, pageCount]);

  const filtersActive = search.trim() !== "" || char !== "all" || stage !== "all" || result !== "all";

  const clearFilters = () => {
    setSearch("");
    setChar("all");
    setStage("all");
    setResult("all");
    setPage(0);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Library</h1>
          <p>
            <span className="mono" style={{ color: "var(--accent)", fontWeight: 700 }}>
              {total}
            </span>{" "}
            {filtersActive ? `of ${totalUnfiltered} games` : "games"}
            {filtersActive && (
              <>
                {" · "}
                <button type="button" className="btn" onClick={clearFilters}>
                  Clear filters
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      {isError && (
        <div className="sessions-error" role="alert">
          Failed to load games.{" "}
          <button type="button" className="btn" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {(() => {
        const filteredWins = data?.wins ?? 0;
        const filteredLosses = data?.losses ?? 0;
        const decisive = filteredWins + filteredLosses;
        const filteredWR = decisive > 0 ? (filteredWins / decisive) * 100 : 0;
        return (
          <div className="kpi-grid" style={{ marginBottom: 12 }}>
            <KPI label="Filtered" value={total} sub={isFetching ? "updating" : `${pageStart}-${pageEnd || 0} shown`} />
            <KPI label="Win Rate" value={`${filteredWR.toFixed(0)}%`} sub={`${filteredWins}W · ${filteredLosses}L`} />
            <KPI label="Unique Opponents" value={data?.uniqueOpponents ?? 0} />
            <KPI label="Characters Played" value={data?.charactersPlayed ?? 0} />
          </div>
        );
      })()}

      <Card>
        <div className="library-filter-grid">
          <div>
            <div className="tweaks-label">Search games & moments</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zero-to-death, Ken combo, ZAIN…"
              className="library-filter-input"
              aria-label="Search games by opponent, character, stage, move, or detected moment"
            />
          </div>
          <div>
            <div className="tweaks-label">Matchup</div>
            <select
              value={char}
              onChange={(e) => setChar(e.target.value as LibraryFilters["char"])}
              className="library-filter-input"
            >
              <option value="all">All characters</option>
              {(data?.characters ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="tweaks-label">Stage</div>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as LibraryFilters["stage"])}
              className="library-filter-input"
            >
              <option value="all">All stages</option>
              {(data?.stages ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="tweaks-label">Result</div>
            <PillRow>
              {RESULTS.map((r) => (
                <Pill key={r} active={result === r} onClick={() => setResult(r)}>
                  {r}
                </Pill>
              ))}
            </PillRow>
          </div>
          <div className="library-search-suggestions">
            <span>Try:</span>
            {EVENT_SEARCH_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="library-search-suggestion"
                onClick={() => setSearch(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div className="library-table-toolbar">
          <span>
            Showing <strong>{pageStart}</strong>-<strong>{pageEnd}</strong> of <strong>{total}</strong>
          </span>
          <div className="library-page-controls">
            <button
              className="btn btn-ghost"
              disabled={page === 0 || isFetching}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span className="mono">
              {page + 1} / {pageCount}
            </span>
            <button
              className="btn btn-ghost"
              disabled={page + 1 >= pageCount || isFetching}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
        <DataTable
          colWidths={
            showingSearchMatches
              ? ["32px", undefined, undefined, undefined, "220px", "76px", "76px", "76px", "76px", undefined]
              : ["32px", undefined, undefined, undefined, "76px", "76px", "76px", "76px", undefined]
          }
        >
          <thead>
            <tr>
              <th>Res</th>
              <th>Matchup</th>
              <th>Opponent</th>
              <th>Stage</th>
              {showingSearchMatches && <th>Matching moments</th>}
              <th>Stocks</th>
              <th>Neutral</th>
              <th>L-Cancel</th>
              <th>Dmg/Op</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columnCount}>
                  <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                    <div className="spinner" />
                  </div>
                </td>
              </tr>
            ) : total === 0 && !filtersActive ? (
              <tr>
                <td colSpan={columnCount}>
                  <EmptyState
                    title="No replays imported yet"
                    sub="Import a replay folder to start building your library."
                    cta={{ label: "Open Settings", onClick: () => navigate("/settings") }}
                  />
                </td>
              </tr>
            ) : games.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>No games match that opponent, matchup, or detected moment.</td>
              </tr>
            ) : (
              games.map((g) => {
                const matches = g.searchMatches ?? [];
                const game = g as unknown as {
                  playerCharacter?: string;
                  playerFinalStocks?: number;
                  opponentFinalStocks?: number;
                  analysisStatus?: string;
                  analysisError?: string | null;
                  statsAvailable?: boolean;
                  neutralWinRate?: number | null;
                  lCancelRate?: number | null;
                  avgDamagePerOpening?: number;
                  playedAt?: string;
                };
                return (
                  <tr
                    key={g.id}
                    onClick={() => navigate(`/game/${g.id}`)}
                    onKeyDown={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/game/${g.id}`);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${g.result} vs ${g.opponentTag} on ${g.stage}`}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <ResultDot result={g.result} aria-hidden />
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {game.playerCharacter || "—"} <span style={{ color: "var(--text-muted)" }}>vs</span>{" "}
                      {g.opponentCharacter}
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {g.opponentTag}
                      {(game.statsAvailable === false || (game.analysisStatus && game.analysisStatus !== "ok")) && (
                        <span className="analysis-status-chip" title={game.analysisError ?? undefined}>
                          {analysisStatusLabel(game.analysisStatus)}
                        </span>
                      )}
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>{g.stage}</td>
                    {showingSearchMatches && (
                      <td>
                        {matches.length > 0 ? (
                          <div className="library-search-matches">
                            {matches.slice(0, 2).map((match) => (
                              <button
                                key={match.id}
                                type="button"
                                className={`library-search-match${match.didKill ? " library-search-match-kill" : ""}`}
                                title={`${match.label} — ${match.description}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  navigate(`/game/${g.id}`, { state: { seekFrame: match.startFrame } });
                                }}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <span>{match.label}</span>
                                <span className="mono">{match.timestamp}</span>
                              </button>
                            ))}
                            {matches.length > 2 && (
                              <span className="library-search-match-more">+{matches.length - 2}</span>
                            )}
                          </div>
                        ) : (
                          <span className="library-search-game-match">
                            {g.searchTechniqueMatch ? "Technique detected" : "Game details"}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="mono">
                      {game.playerFinalStocks ?? "—"}-{game.opponentFinalStocks ?? "—"}
                    </td>
                    <td className="mono">
                      {game.statsAvailable === false || (game.analysisStatus && game.analysisStatus !== "ok")
                        ? "—"
                        : typeof game.neutralWinRate === "number"
                          ? `${(game.neutralWinRate * 100).toFixed(1)}%`
                          : "—"}
                    </td>
                    <td className="mono">
                      {game.statsAvailable === false || (game.analysisStatus && game.analysisStatus !== "ok")
                        ? "—"
                        : typeof game.lCancelRate === "number"
                          ? `${(game.lCancelRate * 100).toFixed(0)}%`
                          : "—"}
                    </td>
                    <td className="mono">
                      {game.statsAvailable === false || (game.analysisStatus && game.analysisStatus !== "ok")
                        ? "—"
                        : typeof game.avgDamagePerOpening === "number"
                          ? game.avgDamagePerOpening.toFixed(1)
                          : "—"}
                    </td>
                    <td className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {game.playedAt
                        ? new Date(game.playedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : ""}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </DataTable>
      </Card>
    </div>
  );
}
