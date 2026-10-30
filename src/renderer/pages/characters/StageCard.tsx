import "./StageCard.css";
import { Card } from "../../components/ui/Card";
import { DataTable } from "../../components/ui/DataTable";
import { WinrateBar } from "../../components/ui/WinrateBar";
import type { CharacterModuleProps } from "./shared";
import { accentVars } from "./shared";
import { useCharacterMatchups, useCharacterStageStats } from "../../hooks/queries";

interface StageRow {
  stage: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate?: number | null;
}

interface MatchupRow {
  opponentCharacter: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate?: number | null;
}

// Stage/matchup aggregates come from the games table, not the v10-v14 event
// tables, so EVENT_SAMPLE_GUARDS has no key for them. These minimums are the
// module's own trust gates; every rendered rate still shows its n.
const STAGE_TRUST_MIN = 3;
const MATCHUP_TRUST_MIN = 5;

function winRateOf(row: { wins: number; losses: number; winRate?: number | null }): number {
  return row.winRate ?? (row.wins + row.losses > 0 ? row.wins / (row.wins + row.losses) : 0);
}

function argBest<T>(rows: T[], score: (row: T) => number, dir: 1 | -1): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const row of rows) {
    const s = score(row) * dir;
    if (s > bestScore) {
      bestScore = s;
      best = row;
    }
  }
  return best;
}

export function StageCard({ character, color, glowColor }: CharacterModuleProps) {
  const { data: stageData } = useCharacterStageStats(character);
  const { data: matchupData } = useCharacterMatchups(character);

  // Loading (either query unresolved) → null; the page pops in when ready.
  if (stageData === undefined || matchupData === undefined) return null;

  const stages = ((stageData ?? []) as StageRow[]).filter((s) => (s.gamesPlayed ?? 0) > 0);
  if (stages.length === 0) return null;

  const sorted = [...stages].sort((a, b) => b.gamesPlayed - a.gamesPlayed);

  const trusted = sorted.filter((s) => s.gamesPlayed >= STAGE_TRUST_MIN);
  let bestStage: StageRow | null = null;
  let worstStage: StageRow | null = null;
  if (trusted.length >= 2) {
    bestStage = argBest(trusted, winRateOf, 1);
    worstStage = argBest(
      trusted.filter((s) => s !== bestStage),
      winRateOf,
      -1,
    );
  }

  const matchups = (matchupData ?? []) as MatchupRow[];
  const trustedMU = matchups.filter((m) => (m.gamesPlayed ?? 0) >= MATCHUP_TRUST_MIN);
  const bestMU = argBest(trustedMU, winRateOf, 1);
  const worstMU =
    trustedMU.length >= 2
      ? argBest(
          trustedMU.filter((m) => m !== bestMU),
          winRateOf,
          -1,
        )
      : null;

  const hasDimRows = sorted.some((s) => s.gamesPlayed < STAGE_TRUST_MIN);

  return (
    <Card title="Stages" className="stage-card" style={accentVars(color, glowColor)}>
      {bestStage && worstStage && (
        <div className="stage-card-tiles">
          <div className="stage-card-tile stage-card-tile-best">
            <div className="stage-card-tile-label">Best Stage</div>
            <div className="stage-card-tile-stage">{bestStage.stage}</div>
            <div className="stage-card-tile-value">{Math.round(winRateOf(bestStage) * 100)}%</div>
            <div className="stage-card-tile-caption">{bestStage.gamesPlayed} games</div>
          </div>
          <div className="stage-card-tile stage-card-tile-worst">
            <div className="stage-card-tile-label">Worst Stage</div>
            <div className="stage-card-tile-stage">{worstStage.stage}</div>
            <div className="stage-card-tile-value">{Math.round(winRateOf(worstStage) * 100)}%</div>
            <div className="stage-card-tile-caption">{worstStage.gamesPlayed} games</div>
          </div>
        </div>
      )}

      <DataTable colWidths={[undefined, "64px", "96px", undefined]}>
        <thead>
          <tr>
            <th>Stage</th>
            <th>Games</th>
            <th>Record</th>
            <th>Win Rate</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const wr = winRateOf(s);
            const dim = s.gamesPlayed < STAGE_TRUST_MIN;
            return (
              <tr key={s.stage} className={dim ? "stage-card-row-dim" : undefined}>
                <td className="stage-card-stage-name">{s.stage}</td>
                <td className="stage-card-num">{s.gamesPlayed}</td>
                <td className="stage-card-num">
                  <span className="stage-card-w">{s.wins}W</span>-<span className="stage-card-l">{s.losses}L</span>
                </td>
                <td>
                  <div className="stage-card-wr-cell">
                    <span className={`stage-card-pct ${wr >= 0.5 ? "stage-card-pct-up" : "stage-card-pct-down"}`}>
                      {Math.round(wr * 100)}%
                    </span>
                    <WinrateBar value={wr} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      {hasDimRows && (
        <div className="stage-card-footnote">Dimmed rows: fewer than {STAGE_TRUST_MIN} games — sample too small.</div>
      )}

      {bestMU && (
        <div className="stage-card-ban">
          <div className="stage-card-ban-label">Matchup records</div>
          <div className="stage-card-ban-chips">
            <span className="stage-card-chip stage-card-chip-best">
              Highest win rate: <b>{bestMU.opponentCharacter}</b> {Math.round(winRateOf(bestMU) * 100)}% (games:
              {bestMU.gamesPlayed})
            </span>
            {worstMU && (
              <span className="stage-card-chip stage-card-chip-worst">
                Lowest win rate: <b>{worstMU.opponentCharacter}</b> {Math.round(winRateOf(worstMU) * 100)}% (games:
                {worstMU.gamesPlayed})
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
