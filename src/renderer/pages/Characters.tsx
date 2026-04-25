import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  useCharacterList,
  useCharacterMatchups,
  useCharacterSignatureStats,
  useCharacterGameStats,
} from "../hooks/queries";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { WinrateBar } from "../components/ui/WinrateBar";
import { StatGroupCard, type StatItem } from "../components/ui/StatGroupCard";
import { CoachingModal } from "../components/CoachingModal";

// ── Character card art (dynamic, falls back to emoji) ────────────────

const CHARACTER_IMAGE_NAMES: Record<string, string> = {
  Fox: "fox.png",
  Falco: "falco.png",
  Marth: "marth.png",
  Sheik: "sheik.png",
  Falcon: "falcon.png",
  Puff: "puff.png",
  Peach: "peach.png",
  ICs: "ics.png",
  Samus: "samus.png",
  Pikachu: "pikachu.png",
  Luigi: "luigi.png",
  Mario: "mario.png",
  Doc: "doc.png",
  Yoshi: "yoshi.png",
  Ganon: "ganon.png",
  Link: "link.png",
  YLink: "ylink.png",
  Zelda: "zelda.png",
  Roy: "roy.png",
  Mewtwo: "mewtwo.png",
  Ness: "ness.png",
  Bowser: "bowser.png",
  Kirby: "kirby.png",
  DK: "dk.png",
  Pichu: "pichu.png",
};

function CharacterCardImage({
  character,
  variant = "bg",
  color,
}: {
  character: string;
  variant?: "bg" | "portrait";
  color?: string;
}) {
  const filename = CHARACTER_IMAGE_NAMES[character];
  if (!filename) return null;
  const src = new URL(`../assets/characters/${filename}`, import.meta.url).href;
  const className = variant === "portrait" ? "char-hero-portrait" : "char-card-bg-img";
  const style: React.CSSProperties = {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    backgroundColor: color ?? "var(--text)",
  };
  return <div className={className} style={style} aria-hidden />;
}

// ── Types ────────────────────────────────────────────────────────────

interface SignatureStat {
  label: string;
  value: number;
  perGame?: number;
  suffix?: string;
  highlight?: boolean;
  tip?: string;
}

// ── Character metadata ────────────────────────────────────────────────

const CHARACTER_META: Record<
  string,
  {
    emoji: string;
    color: string;
    glowColor: string;
  }
> = {
  Fox: { emoji: "\ud83e\udd8a", color: "#ff6b35", glowColor: "rgba(255, 107, 53, 0.15)" },
  Falco: { emoji: "\ud83e\udd85", color: "#4a7cff", glowColor: "rgba(74, 124, 255, 0.15)" },
  Marth: { emoji: "\u2694\ufe0f", color: "#6b8cff", glowColor: "rgba(107, 140, 255, 0.15)" },
  Sheik: { emoji: "\ud83e\udd77", color: "#8b5cf6", glowColor: "rgba(139, 92, 246, 0.15)" },
  Falcon: { emoji: "\ud83e\udd85", color: "#f59e0b", glowColor: "rgba(245, 158, 11, 0.15)" },
  Puff: { emoji: "\ud83c\udf80", color: "#ec4899", glowColor: "rgba(236, 72, 153, 0.15)" },
  Peach: { emoji: "\ud83c\udf51", color: "#f472b6", glowColor: "rgba(244, 114, 182, 0.15)" },
  ICs: { emoji: "\ud83e\uddca", color: "#67e8f9", glowColor: "rgba(103, 232, 249, 0.15)" },
  Samus: { emoji: "\ud83d\udd2b", color: "#f97316", glowColor: "rgba(249, 115, 22, 0.15)" },
  Pikachu: { emoji: "\u26a1", color: "#facc15", glowColor: "rgba(250, 204, 21, 0.15)" },
  Luigi: { emoji: "\ud83d\udfe2", color: "#22c55e", glowColor: "rgba(34, 197, 94, 0.15)" },
  Mario: { emoji: "\ud83d\udd34", color: "#ef4444", glowColor: "rgba(239, 68, 68, 0.15)" },
  Doc: { emoji: "\ud83d\udc8a", color: "#f8fafc", glowColor: "rgba(248, 250, 252, 0.15)" },
  Yoshi: { emoji: "\ud83e\udd8e", color: "#4ade80", glowColor: "rgba(74, 222, 128, 0.15)" },
  Ganon: { emoji: "\ud83d\udc4a", color: "#7c3aed", glowColor: "rgba(124, 58, 237, 0.15)" },
  Link: { emoji: "\ud83d\udde1\ufe0f", color: "#22c55e", glowColor: "rgba(34, 197, 94, 0.15)" },
  YLink: { emoji: "\ud83c\udff9", color: "#84cc16", glowColor: "rgba(132, 204, 22, 0.15)" },
  Zelda: { emoji: "\u2728", color: "#c084fc", glowColor: "rgba(192, 132, 252, 0.15)" },
  Roy: { emoji: "\ud83d\udd25", color: "#dc2626", glowColor: "rgba(220, 38, 38, 0.15)" },
  Mewtwo: { emoji: "\ud83d\udd2e", color: "#a78bfa", glowColor: "rgba(167, 139, 250, 0.15)" },
  "G&W": { emoji: "\ud83d\udd14", color: "#1e293b", glowColor: "rgba(30, 41, 59, 0.15)" },
  Ness: { emoji: "\ud83e\udde2", color: "#ef4444", glowColor: "rgba(239, 68, 68, 0.15)" },
  Bowser: { emoji: "\ud83d\udc22", color: "#65a30d", glowColor: "rgba(101, 163, 13, 0.15)" },
  Kirby: { emoji: "\ud83e\ude77", color: "#fb7185", glowColor: "rgba(251, 113, 133, 0.15)" },
  DK: { emoji: "\ud83e\udd8d", color: "#92400e", glowColor: "rgba(146, 64, 14, 0.15)" },
  Pichu: { emoji: "\u26a1", color: "#facc15", glowColor: "rgba(250, 204, 21, 0.15)" },
};

const DEFAULT_META = { emoji: "\ud83c\udfae", color: "var(--accent)", glowColor: "var(--accent-glow)" };

// ── Aggregate signature stats across games ──────────────────────────

function aggregateSignatureStats(rawStats: any[], characterName?: string): SignatureStat[] {
  if (rawStats.length === 0) return [];

  const character = characterName ?? rawStats[0]?.character;
  if (!character) return [];

  const totals: Record<string, number> = {};
  for (const game of rawStats) {
    for (const [key, val] of Object.entries(game)) {
      if (key === "character") continue;
      if (typeof val === "number") {
        totals[key] = (totals[key] ?? 0) + val;
      }
    }
  }

  const LABELS: Record<
    string,
    Record<string, { label: string; suffix?: string; highlight?: boolean; tip?: string }>
  > = {
    Fox: {
      multiShineCombos: { label: "Multi-Shine Combos", highlight: true },
      waveshineToUpsmash: { label: "Waveshine \u2192 Upsmash" },
      upthrowUpairs: { label: "Uthrow \u2192 Uair" },
      upthrowUpairKills: { label: "Uthrow \u2192 Uair Kills", highlight: true },
      drillShines: { label: "Drill \u2192 Shine" },
      shineSpikeKills: { label: "Shine Spike Kills", highlight: true },
    },
    Falco: {
      pillarCombos: { label: "Pillar Combos", highlight: true },
      pillarKills: { label: "Pillar Kills", highlight: true },
      shineGrabs: { label: "Shine \u2192 Grab" },
      laserCount: { label: "Lasers Fired" },
    },
    Marth: {
      kenCombos: { label: "Ken Combos", highlight: true },
      kenComboKills: { label: "Ken Combo Kills", highlight: true },
      chainGrabs: { label: "Chain Grabs" },
      fsmashKills: { label: "Fsmash Kills", highlight: true },
    },
    Sheik: {
      techChases: { label: "Tech Chases", highlight: true },
      techChaseKills: { label: "Tech Chase Kills", highlight: true },
      needleHits: { label: "Needle Hits" },
      fairChains: { label: "Fair Chains (3+)" },
    },
    Falcon: {
      kneeKills: { label: "Knee Kills", highlight: true },
      stompKnees: { label: "Stomp \u2192 Knee", highlight: true },
      upthrowKnees: { label: "Uthrow \u2192 Knee Kills" },
      techChaseGrabs: { label: "Tech Chase Grabs", highlight: true },
      gentlemanCount: { label: "Gentlemen" },
    },
    Puff: {
      restKills: { label: "Rest Kills", highlight: true },
      restAttempts: { label: "Rest Attempts" },
      bairStrings: { label: "Bair Walls (3+)", highlight: true },
      longestBairString: { label: "Longest Bair String", suffix: " hits" },
    },
    ICs: {
      wobbles: { label: "Wobbles", highlight: true },
      wobbleKills: { label: "Wobble Kills", highlight: true },
      desyncs: { label: "Desyncs", highlight: true },
      sopoKills: { label: "Sopo Kills" },
      nanaDeaths: { label: "Nana Deaths" },
    },
    Peach: {
      turnipPulls: { label: "Turnip Pulls" },
      turnipHits: { label: "Turnip Hits" },
      stitchFaces: { label: "Stitch Faces", highlight: true },
      dsmashKills: { label: "Downsmash Kills", highlight: true },
      floatCancelAerials: { label: "Float Cancel Aerials" },
    },
    Samus: {
      chargeShotKills: { label: "Charge Shot Kills", highlight: true },
      missileCount: { label: "Missiles Fired" },
      upBKills: { label: "Up-B Kills" },
      dairKills: { label: "Dair Kills" },
    },
    Pikachu: {
      thunderKills: { label: "Thunder Kills", highlight: true },
      upSmashKills: { label: "Upsmash Kills", highlight: true },
      upairChains: { label: "Uair Chains (3+)" },
      nairCombos: { label: "Nair Combos (2+)" },
    },
    Luigi: {
      shoryukenKills: { label: "Shoryuken Kills", highlight: true },
      dairKills: { label: "Dair Kills" },
      downSmashKills: { label: "Dsmash Kills" },
      fireBallCount: { label: "Fireballs Fired" },
    },
    Mario: {
      capeCount: { label: "Capes Used" },
      fireBallCount: { label: "Fireballs Fired" },
      fsmashKills: { label: "Fsmash Kills", highlight: true },
      upSmashKills: { label: "Upsmash Kills" },
      fairSpikeKills: { label: "Fair Spike Kills", highlight: true },
    },
    Doc: {
      pillCount: { label: "Pills Thrown" },
      fsmashKills: { label: "Fsmash Kills", highlight: true },
      upBKills: { label: "Up-B Kills", highlight: true },
      dairKills: { label: "Dair Kills" },
      fairSpikeKills: { label: "Fair Spike Kills", highlight: true },
    },
    Yoshi: {
      eggThrowCount: { label: "Eggs Thrown" },
      dairKills: { label: "Dair Kills", highlight: true },
      upSmashKills: { label: "Upsmash Kills" },
      fairSpikeKills: { label: "Fair Spike Kills", highlight: true },
    },
    Ganon: {
      stompKills: { label: "Stomp Kills", highlight: true },
      sideBKills: { label: "Gerudo Dragon Kills", highlight: true },
      upTiltKills: { label: "Utilt Kills", highlight: true },
      fairKills: { label: "Fair Kills" },
    },
    Link: {
      boomerangCount: { label: "Boomerangs" },
      bombCount: { label: "Bombs" },
      dairSpikeKills: { label: "Dair Spike Kills", highlight: true },
      upSmashKills: { label: "Upsmash Kills" },
      grabCombos: { label: "Grab Combos" },
    },
    YLink: {
      fireArrowCount: { label: "Fire Arrows" },
      bombCount: { label: "Bombs" },
      dairSpikeKills: { label: "Dair Spike Kills", highlight: true },
      nairCombos: { label: "Nair Combos (2+)" },
    },
    Zelda: {
      lightningKickKills: { label: "Lightning Kick Kills", highlight: true },
      dinsFireCount: { label: "Din's Fire" },
      upBKills: { label: "Up-B Kills" },
    },
    Roy: {
      fsmashKills: { label: "Fsmash Kills", highlight: true },
      blazerKills: { label: "Blazer Kills", highlight: true },
      counterCount: { label: "Counters" },
      chainGrabs: { label: "Chain Grabs" },
      dtiltConversions: { label: "Dtilt Conversions" },
    },
    Mewtwo: {
      shadowBallCount: { label: "Shadow Balls" },
      confusionCount: { label: "Confusions" },
      upThrowKills: { label: "Uthrow Kills", highlight: true },
      fairKills: { label: "Fair Kills" },
    },
    "G&W": {
      judgementCount: { label: "Judgements" },
      judgementKills: { label: "Judgement Kills", highlight: true },
      upAirKills: { label: "Uair Kills", highlight: true },
      baconCount: { label: "Bacon (Chef)" },
    },
    Ness: {
      pkFireCount: { label: "PK Fire" },
      backThrowKills: { label: "Back Throw Kills", highlight: true },
      dairKills: { label: "Dair Kills" },
      fairKills: { label: "Fair Kills" },
    },
    Bowser: {
      flameCount: { label: "Flame Breath" },
      koopaClaw: { label: "Koopa Klaw" },
      upBKills: { label: "Up-B Kills" },
      fsmashKills: { label: "Fsmash Kills", highlight: true },
    },
    Kirby: {
      inhaleCount: { label: "Inhales" },
      upTiltKills: { label: "Utilt Kills", highlight: true },
      fsmashKills: { label: "Fsmash Kills" },
      dairCombos: { label: "Dair Combos (3+)" },
      stoneKills: { label: "Stone Kills", highlight: true },
    },
    DK: {
      giantPunchKills: { label: "Giant Punch Kills", highlight: true },
      headbuttCount: { label: "Headbutts" },
      spikeKills: { label: "Spike Kills", highlight: true },
      bairKills: { label: "Bair Kills" },
    },
    Pichu: {
      thunderJoltCount: { label: "Thunder Jolts" },
      thunderKills: { label: "Thunder Kills", highlight: true },
      upSmashKills: { label: "Upsmash Kills" },
      nairCombos: { label: "Nair Combos (2+)" },
    },
  };

  const charLabels = LABELS[character];
  if (!charLabels) return [];

  // For max-type stats, take the max instead of sum
  const MAX_STATS = new Set(["longestBairString"]);
  for (const key of MAX_STATS) {
    if (totals[key] !== undefined) {
      totals[key] = Math.max(...rawStats.map((g: any) => g[key] ?? 0));
    }
  }

  return Object.entries(charLabels)
    .filter(([key]) => totals[key] !== undefined)
    .map(([key, meta]) => {
      const total = totals[key]!;
      const item: SignatureStat = { label: meta.label, value: total };
      if (meta.suffix !== undefined) item.suffix = meta.suffix;
      if (meta.highlight !== undefined) item.highlight = meta.highlight;
      return item;
    });
}

// ── Helpers: aggregate per-game CharacterGameStat rows ──────────────

function avgField(rows: any[], field: string): number {
  if (!rows || rows.length === 0) return 0;
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const v = r?.[field];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n > 0 ? sum / n : 0;
}

// ── Page ─────────────────────────────────────────────────────────────

export function Characters({ refreshKey: _ }: { refreshKey: number }) {
  const { data: list = [] } = useCharacterList();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { page?: string } | undefined;
      if (detail?.page === "characters") setSelected(null);
    };
    window.addEventListener("nav:reactivate", listener);
    return () => window.removeEventListener("nav:reactivate", listener);
  }, []);

  if (selected) {
    return <CharacterDetail character={selected} onBack={() => setSelected(null)} />;
  }

  const allCharacters = Object.keys(CHARACTER_META);
  const playedCount = list.filter((c) => (c.gamesPlayed ?? 0) > 0).length;
  const merged = allCharacters
    .map((name) => {
      const found = list.find((c) => c.character === name);
      return (
        found ?? {
          character: name,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
        }
      );
    })
    .sort((a, b) => (b.gamesPlayed ?? 0) - (a.gamesPlayed ?? 0));

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <div className="page-header">
        <div>
          <h1>Characters</h1>
          <p>
            {playedCount} of {allCharacters.length} played
          </p>
        </div>
      </div>
      <div className="characters-grid">
        {merged.map((c) => {
          const meta = CHARACTER_META[c.character] ?? DEFAULT_META;
          const games = c.gamesPlayed ?? 0;
          const wins = c.wins ?? 0;
          const losses = c.losses ?? Math.max(0, games - wins);
          const wr = c.winRate ?? (games > 0 ? wins / games : 0);
          const unplayed = games === 0;
          return (
            <button
              key={c.character}
              className={`card character-tile${unplayed ? " character-tile-unplayed" : ""}`}
              onClick={() => setSelected(c.character)}
            >
              <div className="character-tile-art">
                {CHARACTER_IMAGE_NAMES[c.character] ? (
                  <CharacterCardImage character={c.character} />
                ) : (
                  <div className="character-tile-emoji">{meta.emoji}</div>
                )}
              </div>
              <div className="character-tile-info">
                <div className="character-tile-name" style={{ color: meta.color }}>
                  {c.character}
                </div>
                <div className="character-tile-record">
                  {unplayed ? (
                    <span style={{ color: "var(--text-muted)" }}>No games yet</span>
                  ) : (
                    <>
                      <span style={{ color: "var(--win)" }}>{wins}W</span>-
                      <span style={{ color: "var(--loss)" }}>{losses}L</span> &middot; {games} games
                    </>
                  )}
                </div>
                <WinrateBar value={wr} />
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

function CharacterDetail({ character, onBack }: { character: string; onBack: () => void }) {
  const meta = CHARACTER_META[character] ?? DEFAULT_META;
  const { data: matchups = [] } = useCharacterMatchups(character);
  const { data: signature } = useCharacterSignatureStats(character);
  const { data: gameStats } = useCharacterGameStats(character);
  const [coachOpen, setCoachOpen] = useState(false);

  const gameStatRows = useMemo(() => (Array.isArray(gameStats) ? gameStats : []), [gameStats]);
  const totalGames = gameStatRows.length;

  const heroStats: Array<[string, string]> =
    totalGames > 0
      ? [
          ["Neutral WR", `${(avgField(gameStatRows, "neutralWinRate") * 100).toFixed(1)}%`],
          ["Conv Rate", `${(avgField(gameStatRows, "conversionRate") * 100).toFixed(0)}%`],
          ["L-Cancel", `${(avgField(gameStatRows, "lCancelRate") * 100).toFixed(0)}%`],
          ["Op/Kill", avgField(gameStatRows, "openingsPerKill").toFixed(1)],
        ]
      : [];

  const sigItems: StatItem[] = useMemo(() => {
    if (!signature) return [];
    const rawArray = Array.isArray(signature) ? (signature as any[]) : [];
    const aggregated = aggregateSignatureStats(rawArray, character);
    return aggregated.map((s) => {
      const displayValue = `${s.value}${s.suffix ?? ""}`;
      const item: StatItem = { label: s.label, value: displayValue };
      if (s.highlight) item.good = true;
      return item;
    });
  }, [signature, character]);

  return (
    <div>
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 20 }}>
        &larr; All Characters
      </button>
      <div className="character-detail-split">
        <Card tone="chrome-plate" className="character-hero">
          <div className="character-hero-art">
            {CHARACTER_IMAGE_NAMES[character] ? (
              <CharacterCardImage character={character} variant="portrait" color={meta.color} />
            ) : (
              <div className="character-hero-emoji">{meta.emoji}</div>
            )}
          </div>
          <h2 style={{ color: meta.color, marginTop: 10 }}>{character}</h2>
          <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 20 }}>{totalGames} games</div>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setCoachOpen(true)}>
            Analyze Matchup
          </button>
          {heroStats.length > 0 && (
            <div className="character-hero-mini">
              {heroStats.map(([label, value]) => (
                <div key={label} className="character-hero-stat">
                  <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
                    {value}
                  </div>
                  <div className="character-hero-stat-label">{label}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div>
          <Card title="Matchups">
            <DataTable>
              <thead>
                <tr>
                  <th>vs</th>
                  <th>Games</th>
                  <th>Record</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {matchups.slice(0, 12).map((m) => {
                  const gamesCount = m.gamesPlayed ?? 0;
                  const wr = m.winRate ?? (gamesCount > 0 ? m.wins / gamesCount : 0);
                  return (
                    <tr key={m.opponentCharacter}>
                      <td style={{ fontWeight: 600 }}>{m.opponentCharacter}</td>
                      <td className="mono">{gamesCount}</td>
                      <td>
                        <span style={{ color: "var(--win)" }}>{m.wins}W</span>-
                        <span style={{ color: "var(--loss)" }}>{m.losses}L</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            className="mono"
                            style={{
                              color: wr >= 0.5 ? "var(--win)" : "var(--loss)",
                              fontWeight: 700,
                            }}
                          >
                            {(wr * 100).toFixed(0)}%
                          </span>
                          <WinrateBar value={wr} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </Card>

          {sigItems.length > 0 && <StatGroupCard title="Signature Stats" items={sigItems} />}
        </div>
      </div>

      {coachOpen && (
        <CoachingModal
          isOpen
          onClose={() => setCoachOpen(false)}
          scope="character"
          id={character}
          title={`${character} Matchup Analysis`}
          replayPath=""
        />
      )}
    </div>
  );
}
