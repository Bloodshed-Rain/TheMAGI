import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, type MotionStyle } from "framer-motion";
import { useLocation } from "react-router-dom";
import {
  useCharacterList,
  useCharacterMatchups,
  useCharacterSignatureStats,
  useCharacterGameStats,
} from "../hooks/queries";
import { CharacterMoves } from "./characters/CharacterMoves";
import "../styles/character-detail.css";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { WinrateBar } from "../components/ui/WinrateBar";
import { EmptyState } from "../components/ui/EmptyState";
import { computeRadarStats, type RadarGameStats, type RadarStats } from "../radarStats";
import { CharacterCardImage } from "../components/CharacterArt";
import { CHARACTER_IMAGE_URLS, CHARACTER_META, DEFAULT_META } from "../characterMeta";

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

// ── Types ────────────────────────────────────────────────────────────

interface SignatureStat {
  key: string;
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
      multiShineCombos: { label: "Combos with 2+ shine hits", highlight: true },
      waveshineToUpsmash: { label: "Shine \u2192 Up smash" },
      upthrowUpairs: { label: "Up throw \u2192 Up air" },
      upthrowUpairKills: { label: "Up throw \u2192 Up air Kills", highlight: true },
      drillShines: { label: "Drill \u2192 Shine" },
      shineSpikeKills: { label: "Shine Spike Kills", highlight: true },
      laserCount: { label: "Lasers Fired" },
    },
    Falco: {
      pillarCombos: { label: "Pillar Combos", highlight: true },
      pillarKills: { label: "Pillar Kills", highlight: true },
      shineGrabs: { label: "Shine \u2192 Grab" },
      laserCount: { label: "Lasers Fired" },
    },
    Marth: {
      kenCombos: { label: "Ken Combos", highlight: true },
      chainGrabs: { label: "Chain Grabs" },
      fsmashKills: { label: "Forward smash Kills", highlight: true },
    },
    Sheik: {
      techChases: { label: "Tech Chases", highlight: true },
      techChaseKills: { label: "Tech Chase Kills", highlight: true },
      needleHits: { label: "Needle Hits" },
      fairChains: { label: "Forward air Chains (3+)" },
    },
    Falcon: {
      kneeKills: { label: "Knee Kills", highlight: true },
      stompKnees: { label: "Stomp \u2192 Knee", highlight: true },
      upthrowKnees: { label: "Up throw \u2192 Knee Kills" },
      techChaseGrabs: { label: "Tech Chase Grabs", highlight: true },
      gentlemanCount: { label: "Gentlemen" },
    },
    Puff: {
      restKills: { label: "Rest Kills", highlight: true },
      restAttempts: { label: "Rest Attempts" },
      bairStrings: { label: "Back air Walls (3+)", highlight: true },
      longestBairString: { label: "Longest Back air String", suffix: " hits" },
    },
    ICs: {
      wobbles: { label: "Wobbles", highlight: true },
      wobbleKills: { label: "Wobble Kills", highlight: true },
      desyncs: { label: "Desyncs", highlight: true },
      sopoKills: { label: "Solo Popo Kills" },
      nanaDeaths: { label: "Nana Deaths" },
    },
    Peach: {
      turnipPulls: { label: "Turnip Pulls" },
      turnipHits: { label: "Turnip Hits" },
      stitchFaces: { label: "Stitch Faces", highlight: true },
      dsmashKills: { label: "Down smash Kills", highlight: true },
      floatAerials: { label: "Float Aerials" },
      floatCancelAerials: { label: "Float Cancel Aerials", highlight: true },
    },
    Samus: {
      chargeShotKills: { label: "Charge Shot Kills", highlight: true },
      missileCount: { label: "Missile Hits" },
      upBKills: { label: "Up-B Kills" },
      dairKills: { label: "Down air Kills" },
    },
    Pikachu: {
      thunderKills: { label: "Thunder Kills", highlight: true },
      upSmashKills: { label: "Up smash Kills", highlight: true },
      upairChains: { label: "Up air Chains (3+)" },
      nairCombos: { label: "Neutral air Combos (2+)" },
    },
    Luigi: {
      shoryukenKills: { label: "Shoryuken Kills", highlight: true },
      dairKills: { label: "Down air Kills" },
      downSmashKills: { label: "Down smash Kills" },
      fireBallCount: { label: "Fireball Hits" },
    },
    Mario: {
      capeCount: { label: "Cape Hits" },
      fireBallCount: { label: "Fireball Hits" },
      fsmashKills: { label: "Forward smash Kills", highlight: true },
      upSmashKills: { label: "Up smash Kills" },
      fairSpikeKills: { label: "Forward air Spike Kills", highlight: true },
    },
    Doc: {
      pillCount: { label: "Pill Hits" },
      fsmashKills: { label: "Forward smash Kills", highlight: true },
      upBKills: { label: "Up-B Kills", highlight: true },
      dairKills: { label: "Down air Kills" },
      fairKills: { label: "Forward air Kills", highlight: true },
    },
    Yoshi: {
      eggThrowCount: { label: "Egg Hits" },
      dairKills: { label: "Down air Kills", highlight: true },
      upSmashKills: { label: "Up smash Kills" },
      fairSpikeKills: { label: "Forward air Spike Kills", highlight: true },
    },
    Ganon: {
      stompKills: { label: "Stomp Kills", highlight: true },
      sideBKills: { label: "Gerudo Dragon Kills", highlight: true },
      upTiltKills: { label: "Utilt Kills", highlight: true },
      fairKills: { label: "Forward air Kills" },
    },
    Link: {
      boomerangCount: { label: "Boomerang Hits" },
      bombCount: { label: "Bomb Hits" },
      dairSpikeKills: { label: "Down air Spike Kills", highlight: true },
      upSmashKills: { label: "Up smash Kills" },
      grabCombos: { label: "Grab Combos" },
    },
    YLink: {
      fireArrowCount: { label: "Fire Arrow Hits" },
      bombCount: { label: "Bomb Hits" },
      dairSpikeKills: { label: "Down air Spike Kills", highlight: true },
      nairCombos: { label: "Neutral air Combos (2+)" },
    },
    Zelda: {
      lightningKickKills: { label: "Forward/Back air Kills", highlight: true },
      dinsFireCount: { label: "Din's Fire Hits" },
      upBKills: { label: "Up-B Kills" },
    },
    Roy: {
      fsmashKills: { label: "Forward smash Kills", highlight: true },
      blazerKills: { label: "Blazer Kills", highlight: true },
      counterCount: { label: "Counter Hits" },
      chainGrabs: { label: "Chain Grabs" },
      dtiltConversions: { label: "Dtilt Conversions" },
    },
    Mewtwo: {
      shadowBallCount: { label: "Shadow Ball Hits" },
      confusionCount: { label: "Confusion Hits" },
      upThrowKills: { label: "Up throw Kills", highlight: true },
      fairKills: { label: "Forward air Kills" },
    },
    "G&W": {
      judgementCount: { label: "Judgement Hits" },
      judgementKills: { label: "Judgement Kills", highlight: true },
      upAirKills: { label: "Up air Kills", highlight: true },
      baconCount: { label: "Chef (Bacon) Hits" },
    },
    Ness: {
      pkFireCount: { label: "PK Fire Hits" },
      backThrowKills: { label: "Back Throw Kills", highlight: true },
      dairKills: { label: "Down air Kills" },
      fairKills: { label: "Forward air Kills" },
    },
    Bowser: {
      flameCount: { label: "Flame Breath Hits" },
      koopaClaw: { label: "Koopa Klaw Hits" },
      upBKills: { label: "Up-B Kills" },
      fsmashKills: { label: "Forward smash Kills", highlight: true },
    },
    Kirby: {
      inhaleCount: { label: "Inhale Hits" },
      upTiltKills: { label: "Utilt Kills", highlight: true },
      fsmashKills: { label: "Forward smash Kills" },
      dairCombos: { label: "Down air Combos (3+)" },
      stoneKills: { label: "Stone Kills", highlight: true },
    },
    DK: {
      giantPunchKills: { label: "Giant Punch Kills", highlight: true },
      headbuttCount: { label: "Headbutt Hits" },
      spikeKills: { label: "Spike Kills", highlight: true },
      bairKills: { label: "Back air Kills" },
    },
    Pichu: {
      thunderJoltCount: { label: "Thunder Jolt Hits" },
      thunderKills: { label: "Thunder Kills", highlight: true },
      upSmashKills: { label: "Up smash Kills" },
      nairCombos: { label: "Neutral air Combos (2+)" },
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
      const item: SignatureStat = { key, label: meta.label, value: total };
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
  const { data: list = [], isLoading, isError } = useCharacterList();
  // The Dashboard's best-character panel links straight to a character: navigate("/characters", { state: { character } }).
  const location = useLocation();
  const [selected, setSelected] = useState<string | null>(() => {
    const requested = (location.state as { character?: unknown } | null)?.character;
    return typeof requested === "string" && requested in CHARACTER_META ? requested : null;
  });

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { page?: string } | undefined;
      if (detail?.page === "characters") setSelected(null);
    };
    window.addEventListener("nav:reactivate", listener);
    return () => window.removeEventListener("nav:reactivate", listener);
  }, []);

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
    return (
      <div className="page-header">
        <div>
          <h1>Characters</h1>
          <p style={{ color: "var(--loss)" }}>Couldn't load character stats. Try reopening this page.</p>
        </div>
      </div>
    );
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
                  <CharacterCardImage character={c.character} idle={!unplayed} scanColor={meta.color} />
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
                <WinrateBar value={wr} marked />
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
  const [view, setView] = useState("overview");
  const [selectedTechnique, setSelectedTechnique] = useState<string | null>(null);

  const gameStatRows = useMemo<RadarGameStats[]>(() => (Array.isArray(gameStats) ? gameStats : []), [gameStats]);
  const totalGames = gameStatRows.length;
  const radarStats = useMemo(() => computeRadarStats(gameStatRows), [gameStatRows]);
  const radarStrengths = useMemo(() => rankRadarAxes(radarStats, "strongest", 3), [radarStats]);
  const radarTargets = useMemo(() => rankRadarAxes(radarStats, "lowest", 2), [radarStats]);

  const heroStats: Array<[string, string]> =
    totalGames > 0
      ? [
          ["Winning the first hit", `${(avgField(gameStatRows, "neutralWinRate") * 100).toFixed(1)}%`],
          ["Combos extended", `${(avgField(gameStatRows, "conversionRate") * 100).toFixed(0)}%`],
          ["L-cancel success", `${(avgField(gameStatRows, "lCancelRate") * 100).toFixed(0)}%`],
          ["Openings per stock", avgField(gameStatRows, "openingsPerKill").toFixed(1)],
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

  const flankStats = [...signatureStats]
    .sort((a, b) => Number(Boolean(b.highlight)) - Number(Boolean(a.highlight)))
    .slice(0, 4);
  const showTechnique = (key: string) => {
    setSelectedTechnique(key);
    setView("moves");
    requestAnimationFrame(() =>
      document.querySelector(".character-detail-nav")?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  };
  const metricHelp: Record<string, string> = {
    "Winning the first hit": "The share of neutral openings you won in these games.",
    "Combos extended": "The share of openings that Slippi records as successful conversions.",
    "L-cancel success": "Successful L-cancels divided by recorded L-cancel attempts.",
    "Openings per stock": "Separate openings needed to take a stock. Lower means fewer openings per stock.",
  };
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
        specular
      >
        <div className="character-hero-head">
          <div className="character-hero-identity">
            <div className="character-hero-eyebrow">Your character</div>
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
              Get coaching
            </button>
          )}
        </div>

        <div className="character-hero-stage">
          <div className="character-hero-art-xl" aria-hidden="true">
            <CharacterCardImage character={character} variant="portrait" color={meta.color} idle />
          </div>
          {(["left", "right"] as const).map((side, index) => (
            <div key={side} className={`character-hero-side character-hero-side--${side}`}>
              {flankStats
                .filter((_, i) => i % 2 === index)
                .map((stat) => (
                  <button
                    key={stat.key}
                    className="character-hero-stat"
                    onClick={() => showTechnique(stat.key)}
                    aria-label={`View ${stat.label} clips`}
                  >
                    <div className="character-hero-stat-value mono">
                      {stat.value}
                      {stat.suffix}
                    </div>
                    <div className="character-hero-stat-label">{stat.label}</div>
                    <div className="character-hero-stat-detail">View action clips →</div>
                  </button>
                ))}
            </div>
          ))}
        </div>

        {heroStats.length > 0 && (
          <div className="character-hero-stripe">
            {heroStats.map(([label, value]) => (
              <details key={label} className="character-hero-stripe-cell character-hero-metric">
                <summary>
                  <span className="mono character-hero-stripe-value">{value}</span>
                  <span className="character-hero-stripe-label">{label} +</span>
                </summary>
                <p>{metricHelp[label]}</p>
              </details>
            ))}
          </div>
        )}
      </Card>

      <nav className="character-detail-nav" aria-label="Character views">
        {[
          ["overview", "Overview"],
          ["moves", "Character moves"],
          ["details", "Details"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`btn${view === id ? " btn-primary" : ""}`}
            aria-pressed={view === id}
            onClick={() => setView(id!)}
          >
            {label}
          </button>
        ))}
      </nav>
      <p className="character-detail-note">
        Based on {totalGames} imported {character} games. The numbers above are averages per game. Small samples can
        change quickly.
      </p>
      {view === "moves" && (
        <CharacterMoves
          key={`${character}:${selectedTechnique}`}
          character={character}
          stats={signatureStats}
          selectedKey={selectedTechnique}
        />
      )}
      {view === "overview" && (
        <Suspense fallback={<p>Loading recent games…</p>}>
          <div className="character-overview-focus">
            <Card title="Start here">
              <h3>Review one thing at a time</h3>
              <p>
                Watch a recent game and choose one habit to practice. Character moves helps you find your combos;
                Details explains where you lose stocks and miss chances.
              </p>
              <button className="btn" onClick={() => setView("moves")}>
                Find a combo to watch
              </button>
            </Card>
            <Card title="What the numbers mean">
              <dl className="character-metric-guide">
                <dt>Winning the first hit</dt>
                <dd>How often you win the start of an exchange.</dd>
                <dt>Combos extended</dt>
                <dd>How often an opening leads to more hits.</dd>
                <dt>L-cancel success</dt>
                <dd>Successful landing inputs that shorten aerial attack recovery.</dd>
                <dt>Openings per stock</dt>
                <dd>How many separate openings you need to take a stock. Fewer is better.</dd>
              </dl>
            </Card>
          </div>
          <FormStrip character={character} color={meta.color} glowColor={meta.glowColor} />
          <CharacterDisclosure
            title="AI coaching summary"
            description="Optional advice based on your games. Opens when you ask for it."
          >
            <IdentityCard character={character} color={meta.color} glowColor={meta.glowColor} />
          </CharacterDisclosure>
        </Suspense>
      )}
      {view === "details" && (
        <Suspense fallback={<p>Loading details…</p>}>
          <p>Open a topic to explore it. Rates include the number of examples behind them.</p>
          <div className="character-detail-topics">
            <CharacterDisclosure
              title="Missed chances & shield safety"
              description="When attacks miss, and what happens after blocking."
            >
              <PunishEconomy character={character} color={meta.color} glowColor={meta.glowColor} />
            </CharacterDisclosure>
            <CharacterDisclosure
              title="Repeated habits"
              description="What you choose after being knocked down, reaching the ledge, or coming under pressure."
            >
              <HabitLedger character={character} color={meta.color} glowColor={meta.glowColor} />
            </CharacterDisclosure>
            <CharacterDisclosure
              title="Getting back to stage"
              description="Your recovery routes and attempts to stop the opponent returning."
            >
              <RecoveryMatrix character={character} color={meta.color} glowColor={meta.glowColor} />
            </CharacterDisclosure>
            <CharacterDisclosure
              title="How you lose stocks"
              description="Damage before losing a stock, unused jumps, and steering after a hit."
            >
              <DeathReport character={character} color={meta.color} glowColor={meta.glowColor} />
            </CharacterDisclosure>
            <CharacterDisclosure title="Stages & matchups" description="Where you play and which opponents you face.">
              <StageCard character={character} color={meta.color} glowColor={meta.glowColor} />
            </CharacterDisclosure>
            <CharacterDisclosure
              title="Lifetime totals"
              description="Time played, damage dealt, and other career counts."
            >
              <TriviaCard character={character} color={meta.color} glowColor={meta.glowColor} />
            </CharacterDisclosure>
          </div>
        </Suspense>
      )}
      {view === "details" && (
        <CharacterDisclosure
          title="Skill chart & matchup records"
          description="A closer look at the numbers. Chart scores are relative estimates, not a player rating."
        >
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
                    Built from this character's games only. Use it to compare your own games, rather than comparing
                    scores with other players.
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
                  <div className="character-radar-label">Areas to review</div>
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
                            <WinrateBar value={wr} marked />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </Card>
          </div>
        </CharacterDisclosure>
      )}

      {coachOpen && (
        <Suspense fallback={null}>
          <CoachingModal
            isOpen
            onClose={() => setCoachOpen(false)}
            scope="character"
            id={character}
            title={`${character} coaching`}
            replayPath=""
          />
        </Suspense>
      )}
    </div>
  );
}

function CharacterDisclosure({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="character-topic" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <strong>{title}</strong>
        <span>{description}</span>
      </summary>
      {open && (
        <div className="character-topic-body">
          <p className="character-detail-note">Some stats appear only after enough examples have been recorded.</p>
          {children}
        </div>
      )}
    </details>
  );
}
