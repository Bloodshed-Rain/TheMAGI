import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { PlayerRadar } from "../components/RadarChart";
import { computeRadarStats, type RadarStats } from "../radarStats";
import { Tooltip } from "../components/Tooltip";
import { useOverallRecord, useMatchupRecords, useStageRecords, useRecentGames } from "../hooks/queries";
import { CoachingModal } from "../components/CoachingModal";

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

function CountUp({ target, duration = 1200 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return <>{value}</>;
}

function getArchetype(stats: RadarStats): { name: string; description: string } {
  const { neutral, punish, techSkill, defense, edgeguard, consistency, mixups, diQuality } = stats;
  const max = Math.max(neutral, punish, techSkill, defense, edgeguard, consistency, mixups, diQuality);

  if (max === punish && punish > 60) return { name: "PUNISH DEMON", description: "Maximum damage off every opening" };
  if (max === neutral && neutral > 60) return { name: "NEUTRAL ACE", description: "Dominant in the footsies game" };
  if (max === techSkill && techSkill > 85) return { name: "TECH MONSTER", description: "Relentless execution" };
  if (max === defense && defense > 65) return { name: "WALL", description: "Nearly impossible to eliminate" };
  if (max === edgeguard && edgeguard > 60) return { name: "EDGE LORD", description: "Lethal at the ledge" };
  if (max === mixups && mixups > 60) return { name: "WILDCARD", description: "Unpredictable and hard to download" };
  if (max === diQuality && diQuality > 65) return { name: "IRON BODY", description: "Lives forever through clean DI" };
  if (max === consistency && consistency > 70) return { name: "ROCK", description: "Steady, reliable, untiltable" };
  return { name: "ALL-ROUNDER", description: "Balanced across all dimensions" };
}

function EntropyBar({ label, value, description }: { label: string; value: number; description: string }) {
  const pct = Math.min(100, (value / 1.6) * 100);
  const color = pct < 30 ? "var(--red)" : pct < 60 ? "var(--yellow)" : "var(--green)";
  const verdict = pct < 30 ? "Predictable" : pct < 60 ? "Moderate" : "Well mixed";

  return (
    <div className="profile-entropy-item">
      <div className="profile-entropy-header">
        <Tooltip text={description} position="right">
          <span className="profile-entropy-label">{label}</span>
        </Tooltip>
        <span className="profile-entropy-verdict" style={{ color }}>
          {verdict}
        </span>
      </div>
      <div className="winrate-bar" style={{ height: 6 }}>
        <div className="winrate-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="profile-entropy-desc">{description}</div>
    </div>
  );
}

function HabitPanel() {
  const { data: games } = useRecentGames(100);

  const habits = useMemo(() => {
    if (!games || games.length === 0) return null;
    const avg = (key: string) => games.reduce((s: number, g: any) => s + (g[key] ?? 0), 0) / games.length;
    return {
      ledge: avg("ledgeEntropy"),
      knockdown: avg("knockdownEntropy"),
      shield: avg("shieldPressureEntropy"),
    };
  }, [games]);

  if (!habits) return null;

  return (
    <div className="card">
      <div className="card-title">Mixup Analysis</div>
      <p className="profile-entropy-intro">Low entropy means your opponent can read you. Mix up your options.</p>
      <EntropyBar
        label="After Ledge Grab"
        value={habits.ledge}
        description="Neutral getup, roll, jump, drop, attack variety"
      />
      <EntropyBar
        label="After Knockdown"
        value={habits.knockdown}
        description="Tech in place, tech roll, missed tech, getup attack variety"
      />
      <EntropyBar
        label="Under Shield Pressure"
        value={habits.shield}
        description="OOS options: grab, nair, roll, wavedash, jump variety"
      />
    </div>
  );
}

export function Profile({ refreshKey }: { refreshKey: number }) {
  const [isCoachingOpen, setIsCoachingOpen] = useState(false);
  const { data: record, isLoading: loadingRecord, refetch: refetchRecord } = useOverallRecord();
  const { data: matchups, isLoading: loadingMatchups, refetch: refetchMatchups } = useMatchupRecords();
  const { data: stages, isLoading: loadingStages, refetch: refetchStages } = useStageRecords();
  const { data: games, isLoading: loadingGames, refetch: refetchGames } = useRecentGames(100);

  useEffect(() => {
    refetchRecord();
    refetchMatchups();
    refetchStages();
    refetchGames();
  }, [refreshKey, refetchRecord, refetchMatchups, refetchStages, refetchGames]);

  const radarStats = useMemo(() => {
    return games ? computeRadarStats(games) : null;
  }, [games]);

  const loading = loadingRecord || loadingMatchups || loadingStages || loadingGames;

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" style={{ margin: "0 auto 12px" }} />
        Loading profile...
      </div>
    );
  }

  if (!record || record.totalGames === 0) {
    return (
      <div className="empty-state">
        <h2>Not enough data</h2>
        <p>Play at least 5 games to see your profile.</p>
      </div>
    );
  }

  const winRate = ((record.wins / record.totalGames) * 100).toFixed(1);
  const archetype = radarStats ? getArchetype(radarStats) : null;

  // Aggregate stats for featured display
  const avgPowershields =
    games && games.length > 0
      ? games.reduce((s: number, g: any) => s + (g.powerShieldCount ?? 0), 0) / games.length
      : 0;
  const avgEdgeguard =
    games && games.length > 0
      ? games.reduce((s: number, g: any) => s + (g.edgeguardSuccessRate ?? 0), 0) / games.length
      : 0;
  const avgLCancel =
    games && games.length > 0 ? games.reduce((s: number, g: any) => s + (g.lCancelRate ?? 0), 0) / games.length : 0;

  return (
    <div>
      <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
        <div
          className="page-header"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <div>
            <h1>Profile</h1>
            {archetype && (
              <p>
                <Tooltip
                  text="Your playstyle archetype, computed from your strongest stat dimension across all games"
                  position="bottom"
                >
                  <span className="profile-archetype-name">{archetype.name}</span>
                </Tooltip>
                {" \u2014 "}
                {archetype.description}
              </p>
            )}
          </div>

          <button
            className="btn btn-primary"
            onClick={() => setIsCoachingOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 700,
              boxShadow: "0 4px 12px rgba(var(--accent-rgb), 0.2)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
              <path d="M12 12L2.1 12.1" />
              <path d="M12 12L19 19" />
              <path d="M12 12V22" />
            </svg>
            AI Career Analysis
          </button>
        </div>
      </motion.div>

      <CoachingModal
        isOpen={isCoachingOpen}
        onClose={() => setIsCoachingOpen(false)}
        scope="career"
        id="lifetime"
        title="Full Career Analysis"
      />

      {/* Hero stats + radar */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="profile-hero">
          <div className="card profile-record-card">
            <div className="profile-record-big">
              <span className="record-win">
                <CountUp target={record.wins} />
              </span>
              <span className="profile-record-sep">-</span>
              <span className="record-loss">
                <CountUp target={record.losses} />
              </span>
            </div>
            <div className="profile-record-sub">
              <span className="profile-record-games">{record.totalGames}</span> games
              {" \u00B7 "}
              <span
                className="profile-record-rate"
                style={{ color: Number(winRate) >= 50 ? "var(--green)" : "var(--red)" }}
              >
                {winRate}%
              </span>{" "}
              win rate
            </div>
          </div>
          {radarStats && (
            <div className="card profile-radar-card">
              <div className="card-title">Skill Profile</div>
              <PlayerRadar stats={radarStats} games={games ?? undefined} />
            </div>
          )}
        </div>

        {/* Featured Stats Row */}
        <div className="profile-featured-stats">
          <div className="profile-featured-stat">
            <div className="profile-featured-value" style={{ color: "var(--accent)" }}>
              {avgPowershields.toFixed(1)}
            </div>
            <Tooltip
              text="Average power shields per game. Reflects defensive timing and read quality against approaches and projectiles."
              position="bottom"
            >
              <span className="profile-featured-label">Power Shields / Game</span>
            </Tooltip>
          </div>
          <div className="profile-featured-stat">
            <div
              className="profile-featured-value"
              style={{ color: avgEdgeguard > 0.5 ? "var(--green)" : "var(--red)" }}
            >
              {(avgEdgeguard * 100).toFixed(0)}%
            </div>
            <Tooltip text="How often your offstage attempts result in a stock taken" position="bottom">
              <span className="profile-featured-label">Edgeguard Rate</span>
            </Tooltip>
          </div>
          <div className="profile-featured-stat">
            <div
              className="profile-featured-value"
              style={{ color: avgLCancel > 0.85 ? "var(--green)" : avgLCancel > 0.7 ? "var(--yellow)" : "var(--red)" }}
            >
              {(avgLCancel * 100).toFixed(1)}%
            </div>
            <Tooltip text="Average L-cancel rate across all games" position="bottom">
              <span className="profile-featured-label">L-Cancel Rate</span>
            </Tooltip>
          </div>
        </div>
      </motion.div>

      {/* Habit Predictability */}
      {radarStats && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <HabitPanel />
        </motion.div>
      )}

      {matchups && matchups.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="card">
            <div className="card-title">Matchups</div>
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
                {matchups.map((m: MatchupRecord, i: number) => {
                  const wr = m.winRate * 100;
                  return (
                    <motion.tr
                      key={m.opponentCharacter}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + i * 0.025, duration: 0.35 }}
                    >
                      <td style={{ fontWeight: 600 }}>{m.opponentCharacter}</td>
                      <td className="mono-cell">{m.totalGames}</td>
                      <td>
                        <span className="record-win">{m.wins}</span>
                        {" - "}
                        <span className="record-loss">{m.losses}</span>
                      </td>
                      <td
                        className="mono-cell"
                        style={{
                          fontWeight: 700,
                          color: wr >= 60 ? "var(--green)" : wr >= 45 ? "var(--yellow)" : "var(--red)",
                        }}
                      >
                        {wr.toFixed(0)}%
                      </td>
                      <td>
                        <div className="winrate-bar">
                          <div className="winrate-bar-fill" style={{ width: `${wr}%` }} />
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {stages && stages.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="card">
            <div className="card-title">Stage Stats</div>
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
                {stages.map((s: StageRecord, i: number) => {
                  const wr = s.winRate * 100;
                  return (
                    <motion.tr
                      key={s.stage}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + i * 0.025, duration: 0.35 }}
                    >
                      <td style={{ fontWeight: 600 }}>{s.stage}</td>
                      <td className="mono-cell">{s.totalGames}</td>
                      <td>
                        <span className="record-win">{s.wins}</span>
                        {" - "}
                        <span className="record-loss">{s.losses}</span>
                      </td>
                      <td
                        className="mono-cell"
                        style={{
                          fontWeight: 700,
                          color: wr >= 60 ? "var(--green)" : wr >= 45 ? "var(--yellow)" : "var(--red)",
                        }}
                      >
                        {wr.toFixed(0)}%
                      </td>
                      <td>
                        <div className="winrate-bar">
                          <div className="winrate-bar-fill" style={{ width: `${wr}%` }} />
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
