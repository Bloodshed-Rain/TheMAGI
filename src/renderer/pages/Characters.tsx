import { useEffect, useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────

interface CharacterOverview {
  character: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgNeutralWinRate: number;
  avgConversionRate: number;
  avgLCancelRate: number;
  avgOpeningsPerKill: number;
  avgDamagePerOpening: number;
  avgDeathPercent: number;
  avgRecoverySuccessRate: number;
  lastPlayed: string | null;
}

interface CharacterMatchup {
  opponentCharacter: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgNeutralWinRate: number;
  avgConversionRate: number;
  avgOpeningsPerKill: number;
}

interface CharacterStageStats {
  stage: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

// Signature stat entry for display
interface SignatureStat {
  label: string;
  value: number;
  suffix?: string;
  highlight?: boolean;
}

// ── Character metadata (icons, colors, signature stat labels) ────────

const CHARACTER_META: Record<string, {
  emoji: string;
  color: string;
  glowColor: string;
}> = {
  Fox:              { emoji: "🦊", color: "#ff6b35", glowColor: "rgba(255, 107, 53, 0.15)" },
  Falco:            { emoji: "🦅", color: "#4a7cff", glowColor: "rgba(74, 124, 255, 0.15)" },
  Marth:            { emoji: "⚔️",  color: "#6b8cff", glowColor: "rgba(107, 140, 255, 0.15)" },
  Sheik:            { emoji: "🥷", color: "#8b5cf6", glowColor: "rgba(139, 92, 246, 0.15)" },
  "Captain Falcon": { emoji: "🦅", color: "#f59e0b", glowColor: "rgba(245, 158, 11, 0.15)" },
  Jigglypuff:       { emoji: "🎀", color: "#ec4899", glowColor: "rgba(236, 72, 153, 0.15)" },
  Peach:            { emoji: "🍑", color: "#f472b6", glowColor: "rgba(244, 114, 182, 0.15)" },
  "Ice Climbers":   { emoji: "🧊", color: "#67e8f9", glowColor: "rgba(103, 232, 249, 0.15)" },
  Samus:            { emoji: "🔫", color: "#f97316", glowColor: "rgba(249, 115, 22, 0.15)" },
  Pikachu:          { emoji: "⚡", color: "#facc15", glowColor: "rgba(250, 204, 21, 0.15)" },
  Luigi:            { emoji: "🟢", color: "#22c55e", glowColor: "rgba(34, 197, 94, 0.15)" },
  Mario:            { emoji: "🔴", color: "#ef4444", glowColor: "rgba(239, 68, 68, 0.15)" },
  "Dr. Mario":      { emoji: "💊", color: "#f8fafc", glowColor: "rgba(248, 250, 252, 0.15)" },
  Yoshi:            { emoji: "🦎", color: "#4ade80", glowColor: "rgba(74, 222, 128, 0.15)" },
  Ganondorf:        { emoji: "👊", color: "#7c3aed", glowColor: "rgba(124, 58, 237, 0.15)" },
  Link:             { emoji: "🗡️",  color: "#22c55e", glowColor: "rgba(34, 197, 94, 0.15)" },
  "Young Link":     { emoji: "🏹", color: "#84cc16", glowColor: "rgba(132, 204, 22, 0.15)" },
  Zelda:            { emoji: "✨", color: "#c084fc", glowColor: "rgba(192, 132, 252, 0.15)" },
  Roy:              { emoji: "🔥", color: "#dc2626", glowColor: "rgba(220, 38, 38, 0.15)" },
  Mewtwo:           { emoji: "🔮", color: "#a78bfa", glowColor: "rgba(167, 139, 250, 0.15)" },
  "Mr. Game & Watch": { emoji: "🔔", color: "#1e293b", glowColor: "rgba(30, 41, 59, 0.15)" },
  Ness:             { emoji: "🧢", color: "#ef4444", glowColor: "rgba(239, 68, 68, 0.15)" },
  Bowser:           { emoji: "🐢", color: "#65a30d", glowColor: "rgba(101, 163, 13, 0.15)" },
  Kirby:            { emoji: "🩷", color: "#fb7185", glowColor: "rgba(251, 113, 133, 0.15)" },
  DK:               { emoji: "🦍", color: "#92400e", glowColor: "rgba(146, 64, 14, 0.15)" },
};

const DEFAULT_META = { emoji: "🎮", color: "var(--accent)", glowColor: "var(--accent-glow)" };

function getMeta(character: string) {
  return CHARACTER_META[character] || DEFAULT_META;
}

// ── Aggregate signature stats across games ──────────────────────────

function aggregateSignatureStats(rawStats: any[]): SignatureStat[] {
  if (rawStats.length === 0) return [];

  const character = rawStats[0]?.character;
  if (!character) return [];

  // Sum all numeric fields across games
  const totals: Record<string, number> = {};
  for (const game of rawStats) {
    for (const [key, val] of Object.entries(game)) {
      if (key === "character") continue;
      if (typeof val === "number") {
        totals[key] = (totals[key] ?? 0) + val;
      }
    }
  }

  const LABELS: Record<string, Record<string, { label: string; suffix?: string; highlight?: boolean }>> = {
    Fox: {
      waveshines: { label: "Waveshines", highlight: true },
      waveshineToUpsmash: { label: "Waveshine → Upsmash" },
      upthrowUpairs: { label: "Uthrow → Uair" },
      upthrowUpairKills: { label: "Uthrow → Uair Kills", highlight: true },
      drillShines: { label: "Drill → Shine" },
    },
    Falco: {
      pillarCombos: { label: "Pillar Combos", highlight: true },
      pillarKills: { label: "Pillar Kills", highlight: true },
      shineGrabs: { label: "Shine → Grab" },
      laserCount: { label: "Lasers Fired" },
    },
    Marth: {
      kenCombos: { label: "Ken Combos", highlight: true },
      kenComboKills: { label: "Ken Combo Kills", highlight: true },
      chainGrabs: { label: "Chain Grabs" },
      tipperKills: { label: "Tipper Fsmash Kills", highlight: true },
    },
    Sheik: {
      techChases: { label: "Tech Chases", highlight: true },
      techChaseKills: { label: "Tech Chase Kills", highlight: true },
      needleHits: { label: "Needle Hits" },
      fairChains: { label: "Fair Chains (3+)" },
    },
    "Captain Falcon": {
      kneeKills: { label: "Knee Kills", highlight: true },
      stompKnees: { label: "Stomp → Knee", highlight: true },
      upthrowKnees: { label: "Uthrow → Knee Kills" },
      techChaseGrabs: { label: "Tech Chase Grabs" },
    },
    Jigglypuff: {
      restKills: { label: "Rest Kills", highlight: true },
      restAttempts: { label: "Rest Attempts" },
      bairStrings: { label: "Bair Walls (3+)", highlight: true },
      longestBairString: { label: "Longest Bair String", suffix: " hits" },
    },
    "Ice Climbers": {
      wobbles: { label: "Wobbles", highlight: true },
      wobbleKills: { label: "Wobble Kills", highlight: true },
      desyncs: { label: "Desyncs" },
    },
    Peach: {
      turnipPulls: { label: "Turnip Pulls" },
      turnipHits: { label: "Turnip Hits" },
      stitchFaces: { label: "Stitch Faces", highlight: true },
      dsmashKills: { label: "Downsmash Kills", highlight: true },
      floatCancelAerials: { label: "Float Cancel Aerials" },
    },
  };

  const charLabels = LABELS[character];
  if (!charLabels) return [];

  // For longestBairString, use max instead of sum
  if (character === "Jigglypuff" && totals["longestBairString"] !== undefined) {
    totals["longestBairString"] = Math.max(...rawStats.map((g: any) => g.longestBairString ?? 0));
  }

  return Object.entries(charLabels)
    .filter(([key]) => totals[key] !== undefined)
    .map(([key, meta]) => ({
      label: meta.label,
      value: totals[key]!,
      suffix: meta.suffix,
      highlight: meta.highlight,
    }));
}

// ── Component ────────────────────────────────────────────────────────

export function Characters({ refreshKey }: { refreshKey: number }) {
  const [characters, setCharacters] = useState<CharacterOverview[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matchups, setMatchups] = useState<CharacterMatchup[]>([]);
  const [stages, setStages] = useState<CharacterStageStats[]>([]);
  const [signatureStats, setSignatureStats] = useState<SignatureStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const chars = await window.clippi.getCharacterList();
        setCharacters(chars);
        // Auto-select first character, or re-validate current selection
        if (chars.length > 0) {
          const stillValid = selected && chars.some((c) => c.character === selected);
          if (!stillValid) {
            setSelected(chars[0].character);
          }
        } else {
          setSelected(null);
        }
      } catch (err) {
        console.error("Failed to load characters:", err);
      }
      setLoading(false);
    }
    load();
  }, [refreshKey]);

  // Load detail data when selection changes
  const loadDetail = useCallback(async (char: string) => {
    setDetailLoading(true);
    try {
      const [mu, st, sig] = await Promise.all([
        window.clippi.getCharacterMatchups(char),
        window.clippi.getCharacterStageStats(char),
        window.clippi.getCharacterSignatureStats(char),
      ]);
      setMatchups(mu);
      setStages(st);
      setSignatureStats(aggregateSignatureStats(sig));
    } catch (err) {
      console.error("Failed to load character details:", err);
    }
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (selected) loadDetail(selected);
  }, [selected, refreshKey, loadDetail]);

  if (loading) return <div className="loading">Loading characters...</div>;
  if (characters.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🎮</div>
        <h2>No Character Data Yet</h2>
        <p>Import some replays to see your character stats.</p>
      </div>
    );
  }

  const selectedChar = characters.find((c) => c.character === selected);
  const meta = selected ? getMeta(selected) : DEFAULT_META;
  const pct = (v: number) => (v * 100).toFixed(1) + "%";

  return (
    <div>
      <div className="page-header">
        <h1>Characters</h1>
        <p>Your signature stats, per character</p>
      </div>

      {/* Character cards grid */}
      <div className="char-grid">
        {characters.map((c) => {
          const cm = getMeta(c.character);
          const isSelected = c.character === selected;
          const wr = (c.winRate * 100).toFixed(0);
          return (
            <button
              key={c.character}
              className={`char-card ${isSelected ? "char-card-active" : ""}`}
              onClick={() => setSelected(c.character)}
              style={{
                "--char-color": cm.color,
                "--char-glow": cm.glowColor,
              } as React.CSSProperties}
            >
              <div className="char-card-emoji">{cm.emoji}</div>
              <div className="char-card-name">{c.character}</div>
              <div className="char-card-record">
                <span className="record-win">{c.wins}W</span>
                {" - "}
                <span className="record-loss">{c.losses}L</span>
              </div>
              <div className="char-card-games">{c.gamesPlayed} games · {wr}%</div>
            </button>
          );
        })}
      </div>

      {/* Selected character detail */}
      {selectedChar && (
        <div className="char-detail" style={{ "--char-color": meta.color, "--char-glow": meta.glowColor } as React.CSSProperties}>
          {/* Hero section */}
          <div className="char-hero">
            <div className="char-hero-icon">{meta.emoji}</div>
            <div className="char-hero-info">
              <h2 className="char-hero-name" style={{ color: meta.color }}>{selectedChar.character}</h2>
              <div className="char-hero-record">
                <span className="record-win">{selectedChar.wins}W</span>
                {" - "}
                <span className="record-loss">{selectedChar.losses}L</span>
                <span className="char-hero-games"> · {selectedChar.gamesPlayed} games · {pct(selectedChar.winRate)} win rate</span>
              </div>
              {selectedChar.lastPlayed && (
                <div className="char-hero-last">Last played: {selectedChar.lastPlayed.split("T")[0]}</div>
              )}
            </div>
          </div>

          {detailLoading ? (
            <div className="loading">Loading stats...</div>
          ) : (
            <>
              {/* Signature stats */}
              {signatureStats.length > 0 && (
                <div className="card">
                  <div className="card-title">Signature Stats</div>
                  <div className="sig-grid">
                    {signatureStats.map((s) => (
                      <div
                        key={s.label}
                        className={`sig-stat ${s.highlight ? "sig-stat-highlight" : ""}`}
                        style={s.highlight ? { borderColor: meta.color } : undefined}
                      >
                        <div className="sig-stat-value" style={s.highlight ? { color: meta.color } : undefined}>
                          {s.value}{s.suffix ?? ""}
                        </div>
                        <div className="sig-stat-label">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Core stats */}
              <div className="card">
                <div className="card-title">Average Performance</div>
                <div className="stat-grid">
                  <div className="stat-box">
                    <div className="stat-value">{pct(selectedChar.avgNeutralWinRate)}</div>
                    <div className="stat-label">Neutral Win Rate</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value">{pct(selectedChar.avgConversionRate)}</div>
                    <div className="stat-label">Conversion Rate</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value">{pct(selectedChar.avgLCancelRate)}</div>
                    <div className="stat-label">L-Cancel Rate</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value">{selectedChar.avgOpeningsPerKill}</div>
                    <div className="stat-label">Openings / Kill</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value">{selectedChar.avgDamagePerOpening}</div>
                    <div className="stat-label">Dmg / Opening</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value">{selectedChar.avgDeathPercent}%</div>
                    <div className="stat-label">Avg Death %</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-value">{pct(selectedChar.avgRecoverySuccessRate)}</div>
                    <div className="stat-label">Recovery Rate</div>
                  </div>
                </div>
              </div>

              {/* Matchups */}
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
                        <th>Neutral WR</th>
                        <th>Conv Rate</th>
                        <th>Openings/Kill</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchups.map((m) => {
                        const oppMeta = getMeta(m.opponentCharacter);
                        return (
                          <tr key={m.opponentCharacter}>
                            <td>
                              <span style={{ marginRight: 6 }}>{oppMeta.emoji}</span>
                              {m.opponentCharacter}
                            </td>
                            <td>{m.gamesPlayed}</td>
                            <td>
                              <span className="record-win">{m.wins}W</span>
                              {" - "}
                              <span className="record-loss">{m.losses}L</span>
                            </td>
                            <td>
                              <span className="matchup-wr-bar" style={{ "--wr": m.winRate } as React.CSSProperties}>
                                {pct(m.winRate)}
                              </span>
                            </td>
                            <td>{pct(m.avgNeutralWinRate)}</td>
                            <td>{pct(m.avgConversionRate)}</td>
                            <td>{m.avgOpeningsPerKill}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Stage records */}
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
                      </tr>
                    </thead>
                    <tbody>
                      {stages.map((s) => (
                        <tr key={s.stage}>
                          <td>{s.stage}</td>
                          <td>{s.gamesPlayed}</td>
                          <td>
                            <span className="record-win">{s.wins}W</span>
                            {" - "}
                            <span className="record-loss">{s.losses}L</span>
                          </td>
                          <td>{pct(s.winRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
