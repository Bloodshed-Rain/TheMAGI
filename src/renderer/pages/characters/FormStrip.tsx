import "./FormStrip.css";
import { useNavigate } from "react-router-dom";
import { useCharacterGameStats, useLibraryGames } from "../../hooks/queries";
import { Card } from "../../components/ui/Card";
import { ResultDot } from "../../components/ui/ResultDot";
import { Sparkline } from "../../components/ui/Sparkline";
import { accentVars, type CharacterModuleProps } from "./shared";

// Layout guards from the FormStrip spec (these gate rendering, not event-table
// rates — EVENT_SAMPLE_GUARDS covers the per-instance event modules).
const MIN_FORM_GAMES = 3;
const FORM_DOTS = 15;
/** Suppress the improve/decline arrow when a series is too short to halve meaningfully. */
const DELTA_MIN_POINTS = 10;
const ROLLING_WINDOW = 5;
/** Server-side cap in getLibraryGames — we fetch the newest page and slice per character. */
const LIBRARY_FETCH_LIMIT = 250;

type MetricKey =
  | "neutralWinRate"
  | "lCancelRate"
  | "conversionRate"
  | "avgDamagePerOpening"
  | "openingsPerKill"
  | "avgDeathPercent";

// Same idiom as Trends.tsx METRICS: label/fmt/invert (+ fixed domain for pct metrics).
const METRICS: Array<{
  key: MetricKey;
  label: string;
  fmt: (v: number) => string;
  invert?: boolean;
  domain?: [number, number];
}> = [
  { key: "neutralWinRate", label: "Winning the first hit", fmt: (v) => `${(v * 100).toFixed(1)}%`, domain: [0, 1] },
  { key: "conversionRate", label: "Combos extended", fmt: (v) => `${(v * 100).toFixed(1)}%`, domain: [0, 1] },
  { key: "lCancelRate", label: "L-cancel success", fmt: (v) => `${(v * 100).toFixed(1)}%`, domain: [0, 1] },
  { key: "openingsPerKill", label: "Openings per stock", fmt: (v) => v.toFixed(1), invert: true },
  { key: "avgDamagePerOpening", label: "Damage per opening", fmt: (v) => v.toFixed(1) },
  { key: "avgDeathPercent", label: "Damage before stock loss", fmt: (v) => `${v.toFixed(0)}%`, invert: true },
];

// Copied from Trends.tsx: 5-game rolling average smoothing.
function rolling(vals: number[], win: number): number[] {
  return vals.map((_, i) => {
    const slice = vals.slice(Math.max(0, i - win + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

// Copied from Trends.tsx: second-half average minus first-half average.
function firstHalfDelta(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mid = Math.floor(vals.length / 2);
  const a = vals.slice(0, mid);
  const b = vals.slice(mid);
  const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  return avg(b) - avg(a);
}

interface LibraryGameRow {
  id: number;
  playedAt: string | null;
  stage: string;
  playerCharacter: string;
  opponentTag: string;
  result: "win" | "loss" | "draw";
}

/** Row shape of getCharacterGameStats (WHERE player_character = ?, newest first). */
type CharacterGameStatRow = { playedAt: string | null } & Partial<Record<MetricKey, number | null>>;

export function FormStrip({ character, color, glowColor }: CharacterModuleProps) {
  const navigate = useNavigate();
  // NOTE: getLibraryGames' `char` filter matches opponent_character, so we fetch
  // unfiltered and slice by playerCharacter — this page is about YOUR character.
  const { data: library, isLoading: libraryLoading } = useLibraryGames({
    search: "",
    char: "all",
    stage: "all",
    result: "all",
    limit: LIBRARY_FETCH_LIMIT,
    offset: 0,
  });
  const { data: gameStats, isLoading: statsLoading } = useCharacterGameStats(character);

  if (libraryLoading || statsLoading) return null;

  const charGames = ((library?.games ?? []) as unknown as LibraryGameRow[]).filter(
    (g) => g.playerCharacter === character,
  );
  if (charGames.length < MIN_FORM_GAMES) return null;

  // Newest 15, rendered chronological (oldest → newest, left → right).
  const recent = charGames.slice(0, FORM_DOTS).reverse();
  const wins = recent.filter((g) => g.result === "win").length;

  // getCharacterGameStats is newest-first; reverse to chronological for trends.
  const statRows = [...((gameStats ?? []) as CharacterGameStatRow[])].reverse();

  return (
    <Card title="Recent Form" className="form-strip" style={accentVars(color, glowColor)}>
      <div className="form-strip-body">
        <div className="form-strip-recent">
          <div className="form-strip-dots" aria-label="Recent game results">
            {recent.map((game) => (
              <button
                key={game.id}
                type="button"
                className="result-dot-button"
                onClick={() => navigate(`/game/${game.id}`)}
                aria-label={`Open ${game.result} vs ${game.opponentTag}`}
                title={`${game.result} on ${game.stage}`}
              >
                <ResultDot result={game.result === "win" ? "win" : game.result === "loss" ? "loss" : "draw"} />
              </button>
            ))}
          </div>
          <div className="form-strip-caption">
            {wins} of last {recent.length} wins
          </div>
        </div>
        <div className="form-strip-sparks">
          {METRICS.slice(0, 3).map((metric) => {
            const values = statRows
              .map((row) => row[metric.key])
              .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
            const smoothed = rolling(values, ROLLING_WINDOW);
            const delta = firstHalfDelta(smoothed);
            const improving = metric.invert ? delta < 0 : delta > 0;
            const showDelta = values.length >= DELTA_MIN_POINTS && Math.abs(delta) >= 0.0005;
            const last = smoothed.length > 0 ? smoothed[smoothed.length - 1]! : null;
            return (
              <div className="form-strip-cell" key={metric.key}>
                <div className="form-strip-cell-label">{metric.label}</div>
                <div className="form-strip-cell-value-row">
                  <span className="form-strip-cell-value">{last != null ? metric.fmt(last) : "—"}</span>
                  {showDelta && (
                    <span
                      className={`form-strip-cell-delta ${improving ? "form-strip-up" : "form-strip-down"}`}
                      aria-label={improving ? "improving" : "declining"}
                    >
                      {improving ? "↑" : "↓"}
                    </span>
                  )}
                </div>
                <Sparkline
                  values={smoothed}
                  kind="spark"
                  color="var(--char-color, var(--accent))"
                  className="form-strip-spark"
                  {...(metric.domain ? { domain: metric.domain } : {})}
                />
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
