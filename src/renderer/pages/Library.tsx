import { useMemo, useState } from "react";
import { useRecentGames } from "../hooks/queries";
import { useGlobalStore } from "../stores/useGlobalStore";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { KPI } from "../components/ui/KPI";
import { Pill, PillRow } from "../components/ui/Pill";
import { ResultDot } from "../components/ui/ResultDot";
import { filterGames, LibraryFilters, LibraryGame } from "./library/filter";

const RESULTS: Array<LibraryFilters["result"]> = ["all", "win", "loss"];

export function Library({ refreshKey: _ }: { refreshKey: number }) {
  const openDrawer = useGlobalStore((s) => s.openDrawer);
  const { data: games = [], isLoading } = useRecentGames(500);

  const [search, setSearch] = useState("");
  const [char, setChar] = useState<LibraryFilters["char"]>("all");
  const [stage, setStage] = useState<LibraryFilters["stage"]>("all");
  const [result, setResult] = useState<LibraryFilters["result"]>("all");

  const chars = useMemo(
    () => Array.from(new Set((games as LibraryGame[]).map((g) => g.opponentCharacter))).sort(),
    [games],
  );
  const stages = useMemo(() => Array.from(new Set((games as LibraryGame[]).map((g) => g.stage))).sort(), [games]);

  const filtered = useMemo(
    () => filterGames(games as LibraryGame[], { search, char, stage, result }),
    [games, search, char, stage, result],
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Library</h1>
          <p>
            <span className="mono" style={{ color: "var(--accent)", fontWeight: 700 }}>
              {filtered.length}
            </span>{" "}
            of {games.length} games
          </p>
        </div>
      </div>

      {(() => {
        const filteredWins = filtered.filter((g) => g.result === "win").length;
        const filteredWR = filtered.length > 0 ? (filteredWins / filtered.length) * 100 : 0;
        const uniqueOpponents = new Set(filtered.map((g) => g.opponentTag)).size;
        const charactersPlayed = new Set(
          filtered.map((g) => (g as unknown as { playerCharacter?: string }).playerCharacter ?? ""),
        ).size;
        return (
          <div className="kpi-grid" style={{ marginBottom: 12 }}>
            <KPI label="Filtered" value={filtered.length} sub={`of ${games.length}`} />
            <KPI
              label="Win Rate"
              value={`${filteredWR.toFixed(0)}%`}
              sub={`${filteredWins}W · ${filtered.length - filteredWins}L`}
            />
            <KPI label="Unique Opponents" value={uniqueOpponents} />
            <KPI label="Characters Played" value={charactersPlayed} />
          </div>
        );
      })()}

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <div>
            <div className="tweaks-label">Search opponent</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="MANG0, ZAIN…"
              className="library-filter-input"
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
              {chars.map((c) => (
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
              {stages.map((s) => (
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
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
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
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9}>Loading…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9}>No games match the filters.</td>
              </tr>
            ) : (
              filtered.slice(0, 500).map((g) => {
                const game = g as unknown as {
                  playerCharacter?: string;
                  playerFinalStocks?: number;
                  opponentFinalStocks?: number;
                  neutralWinRate?: number;
                  lCancelRate?: number;
                  avgDamagePerOpening?: number;
                  playedAt?: string;
                };
                return (
                  <tr key={g.id} onClick={() => openDrawer(g.id)} style={{ cursor: "pointer" }}>
                    <td>
                      <ResultDot result={g.result} />
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {game.playerCharacter || "—"} <span style={{ color: "var(--text-muted)" }}>vs</span>{" "}
                      {g.opponentCharacter}
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>{g.opponentTag}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{g.stage}</td>
                    <td className="mono">
                      {game.playerFinalStocks ?? "—"}-{game.opponentFinalStocks ?? "—"}
                    </td>
                    <td className="mono">
                      {typeof game.neutralWinRate === "number" ? `${(game.neutralWinRate * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="mono">
                      {typeof game.lCancelRate === "number" ? `${(game.lCancelRate * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="mono">
                      {typeof game.avgDamagePerOpening === "number" ? game.avgDamagePerOpening.toFixed(1) : "—"}
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
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
