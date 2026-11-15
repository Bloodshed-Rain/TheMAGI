import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { MotionStyle } from "framer-motion";
import { Card } from "./ui/Card";
import { useCharacterList } from "../hooks/queries";
import { CharacterCardImage } from "./CharacterArt";
import { CHARACTER_IMAGE_URLS, CHARACTER_META, DEFAULT_META } from "../characterMeta";
import {
  BEST_CHARACTER_MIN_DECIDED_GAMES,
  closestToQualifying,
  compareToOtherCharacters,
  describeStandouts,
  rankCharactersByRecord,
  sumCharacterTotals,
  type CharacterRecord,
  type CharacterTotals,
  type StandoutMeasure,
} from "../../bestCharacter";

/** Row of window.clippi.getCharacterList (db.ts CharacterOverview), as far as this card reads it. */
type CharacterRow = CharacterRecord & Partial<CharacterTotals> & { gamesPlayed?: number };

const count = (n: number) => Math.round(n).toLocaleString("en-US");

function measureValue(m: StandoutMeasure, value: number): string {
  return m.unit === "rate" ? `${(value * 100).toFixed(1)}%` : value.toFixed(1);
}

/** The counts behind one side of a measure: "743 of 10,031" for a rate, "over 12,345 openings" for damage. */
function measureSample(m: StandoutMeasure, num: number, den: number): string {
  return m.unit === "rate" ? `${count(num)} of ${count(den)}` : `over ${count(den)} openings`;
}

function StandoutTile({ kind, measure }: { kind: "good" | "work"; measure: StandoutMeasure }) {
  const gap = Math.abs(measure.relativeGap * 100).toFixed(0);
  return (
    <div className={`dash-best-tile dash-best-tile--${kind}`}>
      <div className="dash-best-tile-eyebrow">{kind === "good" ? "Does well" : "Work on"}</div>
      <div className="dash-best-tile-label">{measure.label}</div>
      <div className="dash-best-tile-value mono">
        {measureValue(measure, measure.value)}
        <span>
          {" "}
          vs {measureValue(measure, measure.otherValue)} · {gap}% {kind === "good" ? "higher" : "lower"}
        </span>
      </div>
      <div className="dash-best-tile-detail">
        {measureSample(measure, measure.num, measure.den)} · other characters{" "}
        {measureSample(measure, measure.otherNum, measure.otherDen)}
      </div>
    </div>
  );
}

/**
 * Dashboard panel: the wireframe of the character the whole record ranks best,
 * and what that character does better and worse than the player's others.
 * Definitions live in src/bestCharacter.ts.
 */
export function BestCharacterCard({ refreshKey }: { refreshKey: number }) {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useCharacterList();

  useEffect(() => {
    refetch();
  }, [refreshKey, refetch]);

  const rows = useMemo<CharacterRow[]>(() => (Array.isArray(data) ? (data as CharacterRow[]) : []), [data]);
  const ranked = useMemo(() => rankCharactersByRecord(rows), [rows]);
  const best = ranked[0] ?? null;

  const comparison = useMemo(() => {
    if (!best) return null;
    const mine = rows.filter((r) => r.character === best.character);
    const others = rows.filter((r) => r.character !== best.character);
    return {
      result: compareToOtherCharacters(sumCharacterTotals(mine), sumCharacterTotals(others)),
      otherGames: others.reduce((sum, r) => sum + (r.gamesPlayed ?? 0), 0),
    };
  }, [best, rows]);

  if (isLoading) {
    return (
      <div className="card dash-best dash-skeleton-card" aria-hidden="true">
        <span className="anim-shimmer skeleton-line" style={{ width: 120 }} />
        <span className="anim-shimmer skeleton-line" style={{ width: "62%" }} />
      </div>
    );
  }

  if (!best) {
    const closest = closestToQualifying(rows);
    return (
      <Card title="Best Character" className="dash-best">
        <p className="dash-best-sentence">
          No character has {BEST_CHARACTER_MIN_DECIDED_GAMES} decided games yet, so there is no best character to name.
          {closest
            ? ` Closest: ${closest.character} with ${closest.decidedGames} of ${BEST_CHARACTER_MIN_DECIDED_GAMES}.`
            : ""}
        </p>
      </Card>
    );
  }

  const { character } = best;
  const meta = CHARACTER_META[character] ?? DEFAULT_META;
  const hasArt = Boolean(CHARACTER_IMAGE_URLS[character]);
  const strongest = comparison?.result.strongest ?? null;
  const weakest = comparison?.result.weakest ?? null;
  const sentence = comparison ? describeStandouts(comparison.result) : "";
  const compared = (comparison?.result.measures.length ?? 0) > 0;

  return (
    <Card
      className="dash-best"
      style={{ "--char-color": meta.color, "--char-glow": meta.glowColor } as MotionStyle}
      specular
    >
      <div className="dash-section-head">
        <div className="card-title" style={{ marginBottom: 0 }}>
          Best Character
        </div>
        <button className="btn btn-ghost" onClick={() => navigate("/characters", { state: { character } })}>
          Open {character} →
        </button>
      </div>

      <div className={`dash-best-stage${strongest || weakest ? " has-tiles" : ""}`}>
        <div className="dash-best-flank dash-best-flank--left">
          {strongest && <StandoutTile kind="good" measure={strongest} />}
        </div>
        <div className="dash-best-figure" aria-hidden="true">
          {hasArt ? (
            <div className="character-hero-art-xl dash-best-art">
              <CharacterCardImage character={character} variant="portrait" color={meta.color} idle />
            </div>
          ) : (
            <div className="dash-best-emoji">{meta.emoji}</div>
          )}
        </div>
        <div className="dash-best-flank dash-best-flank--right">
          {weakest && <StandoutTile kind="work" measure={weakest} />}
        </div>
      </div>

      <div className="dash-best-copy">
        <h3 className="dash-best-name">{character}</h3>
        <div className="dash-best-record mono">
          <span className="character-hero-wins">{count(best.wins)}W</span>
          <span aria-hidden="true">–</span>
          <span className="character-hero-losses">{count(best.losses)}L</span>
          <span className="character-hero-record-divider" aria-hidden="true">
            •
          </span>
          <span>{(best.winRate * 100).toFixed(1)}% win rate</span>
        </div>
        <p className="dash-best-sentence">
          <strong>{character} is your best character.</strong> {sentence}
        </p>
        <p className="dash-best-note">
          Best means the highest win rate after discounting small samples, among characters with{" "}
          {BEST_CHARACTER_MIN_DECIDED_GAMES}+ decided games (
          {ranked.length === 1 ? `only ${character} qualifies` : `${ranked.length} qualify`}).{" "}
          {compared
            ? `Strengths and weaknesses compare your ${character} totals with your ${count(comparison?.otherGames ?? 0)} games on other characters.`
            : `There are not enough games on other characters yet to show what ${character} does better or worse than the rest.`}
        </p>
      </div>
    </Card>
  );
}
