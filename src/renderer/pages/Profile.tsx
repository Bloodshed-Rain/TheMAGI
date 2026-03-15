import { useEffect, useState } from "react";
import { PlayerRadar } from "../components/RadarChart";

interface MatchupRecord {
  opponentCharacter: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

interface StageRecord {
  stage: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

interface OverallRecord {
  wins: number;
  losses: number;
  totalGames: number;
}

interface RecentGame {
  neutralWinRate: number;
  lCancelRate: number;
  openingsPerKill: number;
  avgDamagePerOpening: number;
  conversionRate: number;
  avgDeathPercent: number;
}

function computeRadarStats(games: RecentGame[]): {
  neutral: number;
  punish: number;
  techSkill: number;
  defense: number;
  aggression: number;
  consistency: number;
} {
  if (games.length === 0) {
    return { neutral: 0, punish: 0, techSkill: 0, defense: 0, aggression: 0, consistency: 0 };
  }

  const avg = (fn: (g: RecentGame) => number) =>
    games.reduce((s, g) => s + fn(g), 0) / games.length;

  // Neutral: based on neutral win rate (50% = average, scale to 0-100)
  const neutralWR = avg((g) => g.neutralWinRate);
  const neutral = Math.min(100, Math.max(0, neutralWR * 100));

  // Punish: based on damage per opening (30 = decent, 60+ = great) and conversion rate
  const dpo = avg((g) => g.avgDamagePerOpening);
  const convRate = avg((g) => g.conversionRate);
  const punish = Math.min(100, (dpo / 60) * 50 + convRate * 50);

  // Tech skill: L-cancel rate is the best proxy
  const lcancel = avg((g) => g.lCancelRate);
  const techSkill = Math.min(100, lcancel * 100);

  // Defense: higher avg death % = better defense (dying at higher % means harder to kill)
  const deathPct = avg((g) => g.avgDeathPercent);
  const defense = Math.min(100, Math.max(0, (deathPct / 150) * 100));

  // Aggression: inverse of openings per kill (fewer openings = more aggressive/efficient)
  const opk = avg((g) => g.openingsPerKill);
  const aggression = Math.min(100, Math.max(0, (1 - (opk - 1) / 10) * 100));

  // Consistency: low variance in neutral win rate across games
  const nwRates = games.map((g) => g.neutralWinRate);
  const nwMean = nwRates.reduce((a, b) => a + b, 0) / nwRates.length;
  const variance = nwRates.reduce((s, v) => s + (v - nwMean) ** 2, 0) / nwRates.length;
  const stdDev = Math.sqrt(variance);
  const consistency = Math.min(100, Math.max(0, (1 - stdDev * 3) * 100));

  return { neutral, punish, techSkill, defense, aggression, consistency };
}

export function Profile({ refreshKey }: { refreshKey: number }) {
  const [record, setRecord] = useState<OverallRecord | null>(null);
  const [matchups, setMatchups] = useState<MatchupRecord[]>([]);
  const [stages, setStages] = useState<StageRecord[]>([]);
  const [radarStats, setRadarStats] = useState<ReturnType<typeof computeRadarStats> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [r, m, s, games] = await Promise.all([
          window.clippi.getOverallRecord(),
          window.clippi.getMatchupRecords(),
          window.clippi.getStageRecords(),
          window.clippi.getRecentGames(100),
        ]);
        setRecord(r);
        setMatchups(m);
        setStages(s);
        setRadarStats(computeRadarStats(games));
      } catch (err) {
        console.error("Failed to load profile:", err);
      }
      setLoading(false);
    }
    load();
  }, [refreshKey]);

  if (loading) return <div className="loading">Loading...</div>;

  if (!record || record.totalGames === 0) {
    return (
      <div className="empty-state">
        <h2>No data yet</h2>
        <p>Import replays to build your profile.</p>
      </div>
    );
  }

  const winRate = ((record.wins / record.totalGames) * 100).toFixed(1);

  return (
    <div>
      <div className="page-header">
        <h1>Profile</h1>
      </div>

      {/* Hero stats + radar */}
      <div className="profile-hero">
        <div className="profile-record-card">
          <div className="profile-record-big">
            <span className="record-win">{record.wins}</span>
            <span className="profile-record-sep">-</span>
            <span className="record-loss">{record.losses}</span>
          </div>
          <div className="stat-label" style={{ textAlign: "center", marginTop: 4 }}>
            {record.totalGames} games ({winRate}%)
          </div>
        </div>
        {radarStats && (
          <div className="profile-radar-card">
            <div className="card-title">Player Archetype</div>
            <PlayerRadar stats={radarStats} />
          </div>
        )}
      </div>

      {matchups.length > 0 && (
        <div className="card">
          <div className="card-title">Matchup Records</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>vs Character</th>
                <th>Games</th>
                <th>Record</th>
                <th>Win Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {matchups.map((m) => {
                const wr = m.winRate * 100;
                return (
                  <tr key={m.opponentCharacter}>
                    <td>{m.opponentCharacter}</td>
                    <td>{m.totalGames}</td>
                    <td>
                      <span className="record-win">{m.wins}</span>
                      {" - "}
                      <span className="record-loss">{m.losses}</span>
                    </td>
                    <td>{wr.toFixed(0)}%</td>
                    <td>
                      <div className="winrate-bar">
                        <div className="winrate-bar-fill" style={{ width: `${wr}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {stages.length > 0 && (
        <div className="card">
          <div className="card-title">Stage Records</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Games</th>
                <th>Record</th>
                <th>Win Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => {
                const wr = s.winRate * 100;
                return (
                  <tr key={s.stage}>
                    <td>{s.stage}</td>
                    <td>{s.totalGames}</td>
                    <td>
                      <span className="record-win">{s.wins}</span>
                      {" - "}
                      <span className="record-loss">{s.losses}</span>
                    </td>
                    <td>{wr.toFixed(0)}%</td>
                    <td>
                      <div className="winrate-bar">
                        <div className="winrate-bar-fill" style={{ width: `${wr}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
