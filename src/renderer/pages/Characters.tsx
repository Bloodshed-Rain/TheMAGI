import { useViewState } from "../hooks/useViewState";
import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { motion, type MotionStyle } from "framer-motion";
import {
  useCharacterList,
  useCharacterMatchups,
  useCharacterSignatureStats,
  useCharacterGameStats,
} from "../hooks/queries";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { WinrateBar } from "../components/ui/WinrateBar";
import { EmptyState } from "../components/ui/EmptyState";
import { computeRadarStats, type RadarGameStats, type RadarStats } from "../radarStats";

const PlayerRadar = lazy(() => import("../components/RadarChart").then((m) => ({ default: m.PlayerRadar })));
const CoachingModal = lazy(() => import("../components/CoachingModal").then((m) => ({ default: m.CoachingModal })));
const IdentityCard = lazy(() => import("./characters/IdentityCard").then((m) => ({ default: m.IdentityCard })));
const FormStrip = lazy(() => import("./characters/FormStrip").then((m) => ({ default: m.FormStrip })));
const PunishEconomy = lazy(() => import("./characters/PunishEconomy").then((m) => ({ default: m.PunishEconomy })));
const HabitLedger = lazy(() => import("./characters/HabitLedger").then((m) => ({ default: m.HabitLedger })));
const RecoveryMatrix = lazy(() => import("./characters/RecoveryMatrix").then((m) => ({ default: m.RecoveryMatrix })));
const DeathReport = lazy(() => import("./characters/DeathReport").then((m) => ({ default: m.DeathReport })));
const StageCard = lazy(() => import("./characters/StageCard").then((m) => ({ default: m.StageCard })));
const TriviaCard = lazy(() => import("./characters/TriviaCard").then((m) => ({ default: m.TriviaCard })));

// ── Character card art (dynamic, falls back to emoji) ────────────────

const CHARACTER_IMAGE_URLS: Record<string, string> = {
  Fox: new URL("../assets/characters/fox.webp", import.meta.url).href,
  Falco: new URL("../assets/characters/falco.webp", import.meta.url).href,
  Marth: new URL("../assets/characters/marth.webp", import.meta.url).href,
  Sheik: new URL("../assets/characters/sheik.webp", import.meta.url).href,
  Falcon: new URL("../assets/characters/falcon.webp", import.meta.url).href,
  Puff: new URL("../assets/characters/puff.webp", import.meta.url).href,
  Peach: new URL("../assets/characters/peach.webp", import.meta.url).href,
  ICs: new URL("../assets/characters/ics.webp", import.meta.url).href,
  Samus: new URL("../assets/characters/samus.webp", import.meta.url).href,
  Pikachu: new URL("../assets/characters/pikachu.webp", import.meta.url).href,
  Luigi: new URL("../assets/characters/luigi.webp", import.meta.url).href,
  Mario: new URL("../assets/characters/mario.webp", import.meta.url).href,
  Doc: new URL("../assets/characters/doc.webp", import.meta.url).href,
  Yoshi: new URL("../assets/characters/yoshi.webp", import.meta.url).href,
  Ganon: new URL("../assets/characters/ganon.webp", import.meta.url).href,
  Link: new URL("../assets/characters/link.webp", import.meta.url).href,
  YLink: new URL("../assets/characters/ylink.webp", import.meta.url).href,
  Zelda: new URL("../assets/characters/zelda.webp", import.meta.url).href,
  Roy: new URL("../assets/characters/roy.webp", import.meta.url).href,
  Mewtwo: new URL("../assets/characters/mewtwo.webp", import.meta.url).href,
  Ness: new URL("../assets/characters/ness.webp", import.meta.url).href,
  Bowser: new URL("../assets/characters/bowser.webp", import.meta.url).href,
  Kirby: new URL("../assets/characters/kirby.webp", import.meta.url).href,
  DK: new URL("../assets/characters/dk.webp", import.meta.url).href,
  Pichu: new URL("../assets/characters/pichu.webp", import.meta.url).href,
  "G&W": new URL("../assets/characters/gnw.png", import.meta.url).href,
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
  const src = CHARACTER_IMAGE_URLS[character];
  if (!src) return null;
  const className = variant === "portrait" ? "char-hero-portrait" : "char-card-bg-img";
  const style: CSSProperties = {
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

interface CharacterSummary {
  gamesPlayed?: number;
  wins?: number;
  losses?: number;
  winRate?: number;
}

interface HeroCallout {
  label: string;
  value: string;
  detail?: string;
  highlight?: boolean;
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
  Sheik: { emoji: "\ud83e\udd77", color: "#c4b5fd", glowColor: "rgba(139, 92, 246, 0.15)" },
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
  Ganon: { emoji: "\ud83d\udc4a", color: "#b794f6", glowColor: "rgba(124, 58, 237, 0.15)" },
  Link: { emoji: "\ud83d\udde1\ufe0f", color: "#22c55e", glowColor: "rgba(34, 197, 94, 0.15)" },
  YLink: { emoji: "\ud83c\udff9", color: "#84cc16", glowColor: "rgba(132, 204, 22, 0.15)" },
  Zelda: { emoji: "\u2728", color: "#c084fc", glowColor: "rgba(192, 132, 252, 0.15)" },
  Roy: { emoji: "\ud83d\udd25", color: "#f87171", glowColor: "rgba(220, 38, 38, 0.15)" },
  Mewtwo: { emoji: "\ud83d\udd2e", color: "#a78bfa", glowColor: "rgba(167, 139, 250, 0.15)" },
  "G&W": { emoji: "\ud83d\udd14", color: "#cbd5e1", glowColor: "rgba(30, 41, 59, 0.15)" },
  Ness: { emoji: "\ud83e\udde2", color: "#ef4444", glowColor: "rgba(239, 68, 68, 0.15)" },
  Bowser: { emoji: "\ud83d\udc22", color: "#65a30d", glowColor: "rgba(101, 163, 13, 0.15)" },
  Kirby: { emoji: "\ud83e\ude77", color: "#fb7185", glowColor: "rgba(251, 113, 133, 0.15)" },
  DK: { emoji: "\ud83e\udd8d", color: "#d4a373", glowColor: "rgba(146, 64, 14, 0.15)" },
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

const RADAR_AXIS_LABELS: Record<keyof RadarStats, string> = {
  neutral: "Neutral",
  punish: "Punish",
  techSkill: "Execution",
  defense: "Defense",
  edgeguard: "Edgeguard",
  consistency: "Consistency",
  mixups: "Mixups",
  diQuality: "DI",
};

function rankRadarAxes(
  stats: RadarStats,
  direction: "strongest" | "lowest",
  count: number,
): Array<{ key: keyof RadarStats; label: string; value: number }> {
  return (Object.keys(RADAR_AXIS_LABELS) as Array<keyof RadarStats>)
    .map((key) => ({ key, label: RADAR_AXIS_LABELS[key], value: stats[key] }))
    .sort((a, b) => (direction === "strongest" ? b.value - a.value : a.value - b.value))
    .slice(0, count);
}

// ── Page ─────────────────────────────────────────────────────────────

export function Characters({ refreshKey: _ }: { refreshKey: number }) {
  const { data: list = [], isLoading, isError, refetch } = useCharacterList();
  const [selected, setSelected] = useViewState<string | null>("characters-selected", null);

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { page?: string } | undefined;
      if (detail?.page === "characters") setSelected(null);
    };
    window.addEventListener("nav:reactivate", listener);
    return () => window.removeEventListener("nav:reactivate", listener);
  }, [setSelected]);

  if (selected) {
    return (
      <CharacterDetail
        character={selected}
        summary={list.find((item) => item.character === selected)}
        onBack={() => setSelected(null)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner loading-spinner" />
        Loading characters…
      </div>
    );
  }

  if (isError) {
    return (<div role="alert">Characters could not load. <button className="btn" onClick={() => void refetch()}>Retry</button></div>);
    
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
          const losses = c.losses ?? 0;
          const wr = c.winRate ?? (wins + losses > 0 ? wins / (wins + losses) : 0);
          const unplayed = games === 0;
          return (
            <button
              key={c.character}
              className={`card character-tile${unplayed ? " character-tile-unplayed" : ""}`}
              onClick={() => setSelected(c.character)}
            >
              <div className="character-tile-art">
                {CHARACTER_IMAGE_URLS[c.character] ? (
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

function CharacterDetail({
  character,
  summary,
  onBack,
}: {
  character: string;
  summary?: CharacterSummary;
  onBack: () => void;
}) {
  const meta = CHARACTER_META[character] ?? DEFAULT_META;
  const { data: matchupData } = useCharacterMatchups(character);
  const matchups = matchupData ?? [];
  const { data: signature } = useCharacterSignatureStats(character);
  const { data: gameStats, isLoading: statsLoading } = useCharacterGameStats(character);
  const [coachOpen, setCoachOpen] = useState(false);

  const gameStatRows = useMemo<RadarGameStats[]>(() => (Array.isArray(gameStats) ? gameStats : []), [gameStats]);
  const totalGames = gameStatRows.length;
  const radarStats = useMemo(() => computeRadarStats(gameStatRows), [gameStatRows]);
  const radarStrengths = useMemo(() => rankRadarAxes(radarStats, "strongest", 3), [radarStats]);
  const radarTargets = useMemo(() => rankRadarAxes(radarStats, "lowest", 2), [radarStats]);

  const heroStats: Array<[string, string]> =
    totalGames > 0
      ? [
          ["Neutral WR", `${(avgField(gameStatRows, "neutralWinRate") * 100).toFixed(1)}%`],
          ["Conv Rate", `${(avgField(gameStatRows, "conversionRate") * 100).toFixed(0)}%`],
          ["L-Cancel", `${(avgField(gameStatRows, "lCancelRate") * 100).toFixed(0)}%`],
          ["Op/Kill", avgField(gameStatRows, "openingsPerKill").toFixed(1)],
        ]
      : [];

  const signatureStats = useMemo<SignatureStat[]>(() => {
    if (!signature) return [];
    const rawArray = Array.isArray(signature) ? (signature as any[]) : [];
    return aggregateSignatureStats(rawArray, character);
  }, [signature, character]);

  // Unplayed character: no stats to show and nothing useful to coach on.
  // Render an empty state and skip the "Analyze Matchup" CTA so CoachingModal
  // never auto-fires a wasted LLM analysis on a character with zero games.
  if (!statsLoading && totalGames === 0) {
    return (
      <div>
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 20 }}>
          &larr; All Characters
        </button>
        <Card tone="chrome-plate">
          <EmptyState
            icon={
              CHARACTER_IMAGE_URLS[character] ? (
                <CharacterCardImage character={character} variant="portrait" color={meta.color} />
              ) : (
                meta.emoji
              )
            }
            title={`No ${character} games yet`}
            sub={`You haven't played ${character} yet — import replays to see stats and matchups.`}
          />
        </Card>
      </div>
    );
  }

  // Keep the character art central and use at most four signature callouts
  // around it. Highlighted character-specific moments win the limited space.
  const flankItems: HeroCallout[] =
    signatureStats.length > 0
      ? [...signatureStats]
          .sort((a, b) => Number(Boolean(b.highlight)) - Number(Boolean(a.highlight)))
          .slice(0, 4)
          .map((stat) => {
            const item: HeroCallout = {
              label: stat.label,
              value: `${stat.value}${stat.suffix ?? ""}`,
            };
            if (stat.highlight) item.highlight = true;
            if (!stat.suffix && totalGames > 0) {
              const perGame = stat.value / totalGames;
              item.detail = `${perGame >= 10 ? perGame.toFixed(1) : perGame.toFixed(2)} / game`;
            }
            return item;
          })
      : heroStats.map(([label, value]) => ({ label, value }));
  const leftFlank = flankItems.filter((_, index) => index % 2 === 0);
  const rightFlank = flankItems.filter((_, index) => index % 2 === 1);

  const summaryGames = summary?.gamesPlayed ?? totalGames;
  const summaryWins = summary?.wins ?? 0;
  const summaryLosses = summary?.losses ?? 0;
  const summaryDecisions = summaryWins + summaryLosses;
  const summaryWinRate = summary?.winRate ?? (summaryDecisions > 0 ? summaryWins / summaryDecisions : 0);

  return (
    <div>
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 20 }}>
        &larr; All Characters
      </button>

      <Card
        tone="chrome-plate"
        className="character-hero-banner"
        style={{ "--char-color": meta.color, "--char-glow": meta.glowColor } as MotionStyle}
      >
        <div className="character-hero-head">
          <div className="character-hero-identity">
            <div className="character-hero-eyebrow">Character dossier</div>
            <div className="character-hero-title-row">
              <h2>{character}</h2>
              <span className="character-hero-games mono">
                {summaryGames} {summaryGames === 1 ? "game" : "games"}
              </span>
            </div>
            {summaryDecisions > 0 && (
              <div className="character-hero-record mono">
                <span className="character-hero-wins">{summaryWins}W</span>
                <span aria-hidden="true">–</span>
                <span className="character-hero-losses">{summaryLosses}L</span>
                <span className="character-hero-record-divider" aria-hidden="true">
                  •
                </span>
                <span>{(summaryWinRate * 100).toFixed(1)}% win rate</span>
              </div>
            )}
          </div>
          {!statsLoading && totalGames > 0 && (
            <button className="btn btn-primary character-hero-cta" onClick={() => setCoachOpen(true)}>
              Analyze Character
            </button>
          )}
        </div>

        <div className="character-hero-stage">
          <div className="character-hero-side character-hero-side--left">
            {leftFlank.map((s) => (
              <div
                key={s.label}
                className={`character-hero-stat${s.highlight ? " character-hero-stat--highlight" : ""}`}
              >
                <div className="character-hero-stat-value mono">{s.value}</div>
                <div className="character-hero-stat-label">{s.label}</div>
                {s.detail && <div className="character-hero-stat-detail mono">{s.detail}</div>}
              </div>
            ))}
          </div>

          <div className="character-hero-art-xl">
            {CHARACTER_IMAGE_URLS[character] ? (
              <CharacterCardImage character={character} variant="portrait" color={meta.color} />
            ) : (
              <div className="character-hero-emoji">{meta.emoji}</div>
            )}
          </div>

          <div className="character-hero-side character-hero-side--right">
            {rightFlank.map((s) => (
              <div
                key={s.label}
                className={`character-hero-stat${s.highlight ? " character-hero-stat--highlight" : ""}`}
              >
                <div className="character-hero-stat-value mono">{s.value}</div>
                <div className="character-hero-stat-label">{s.label}</div>
                {s.detail && <div className="character-hero-stat-detail mono">{s.detail}</div>}
              </div>
            ))}
          </div>
        </div>

        {signatureStats.length > 0 && heroStats.length > 0 && (
          <div className="character-hero-stripe">
            {heroStats.map(([label, value]) => (
              <div key={label} className="character-hero-stripe-cell">
                <div className="mono character-hero-stripe-value">{value}</div>
                <div className="character-hero-stripe-label">{label}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Suspense
        fallback={
          <div className="character-analytics-loading" aria-label="Loading character analytics">
            <div className="spinner" />
          </div>
        }
      >
        <section className="character-analytics-stack" aria-label={`${character} analytics`}>
          <IdentityCard character={character} color={meta.color} glowColor={meta.glowColor} />
          <FormStrip character={character} color={meta.color} glowColor={meta.glowColor} />
          <div className="character-analytics-grid">
            <PunishEconomy character={character} color={meta.color} glowColor={meta.glowColor} />
            <HabitLedger character={character} color={meta.color} glowColor={meta.glowColor} />
            <RecoveryMatrix character={character} color={meta.color} glowColor={meta.glowColor} />
            <DeathReport character={character} color={meta.color} glowColor={meta.glowColor} />
            <StageCard character={character} color={meta.color} glowColor={meta.glowColor} />
            <TriviaCard character={character} color={meta.color} glowColor={meta.glowColor} />
          </div>
        </section>
      </Suspense>

      <div className="character-detail-bottom">
        <Card
          tone="chrome-plate"
          className="character-radar-card"
          style={{ "--char-color": meta.color, "--char-glow": meta.glowColor } as MotionStyle}
        >
          <div className="character-radar-head">
            <div>
              <div className="character-radar-eyebrow">Character form</div>
              <h3>{character} radar</h3>
              <p>
                Built from this character's games only. The shape favors repeatable strengths over one-off highlight
                moments.
              </p>
            </div>
            <div className="character-radar-sample">
              <span className="mono">{totalGames}</span>
              <small>{totalGames === 1 ? "game" : "games"}</small>
            </div>
          </div>

          <Suspense
            fallback={
              <div className="character-radar-loading">
                <div className="spinner" />
              </div>
            }
          >
            <PlayerRadar stats={radarStats} games={gameStatRows} accentColor={meta.color} />
          </Suspense>

          <div className="character-radar-readout">
            <div>
              <div className="character-radar-label">Strengths</div>
              <div className="character-radar-pills">
                {radarStrengths.map((axis) => (
                  <span className="character-radar-pill character-radar-pill-strong" key={axis.key}>
                    {axis.label}
                    <b>{Math.round(axis.value)}</b>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="character-radar-label">Lab targets</div>
              <div className="character-radar-pills">
                {radarTargets.map((axis) => (
                  <span className="character-radar-pill" key={axis.key}>
                    {axis.label}
                    <b>{Math.round(axis.value)}</b>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Matchups" className="character-matchups-card">
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
                const wr = m.winRate ?? (m.wins + m.losses > 0 ? m.wins / (m.wins + m.losses) : 0);
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
      </div>

      {coachOpen && (
        <Suspense fallback={null}>
          <CoachingModal
            isOpen
            onClose={() => setCoachOpen(false)}
            scope="character"
            id={character}
            title={`${character} Matchup Analysis`}
            replayPath=""
          />
        </Suspense>
      )}
    </div>
  );
}
