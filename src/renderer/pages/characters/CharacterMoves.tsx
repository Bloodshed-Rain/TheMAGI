import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, ArrowRight } from "lucide-react";
import { useReplayPlayerStore } from "../../stores/useReplayPlayerStore";
import { TECHNIQUE_EXPLANATIONS } from "../../../characterTechniqueExamples";

export interface CharacterMoveStat {
  key: string;
  label: string;
  value: number;
  suffix?: string;
}
export function CharacterMoves({
  character,
  stats,
  selectedKey,
}: {
  character: string;
  stats: CharacterMoveStat[];
  selectedKey?: string | null;
}) {
  const [selected, setSelected] = useState<CharacterMoveStat | null>(
    () => stats.find((stat) => stat.key === selectedKey) ?? null,
  );
  const openClip = useReplayPlayerStore((s) => s.openClip);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["characterTechniqueExamples", character, selected?.key],
    queryFn: () => window.clippi.getCharacterTechniqueExamples(character, selected!.key),
    enabled: !!selected,
  });
  return (
    <section className="character-moves">
      <h3>Character moves</h3>
      <p>Choose a stat to watch just the action, with a short lead-in and ending.</p>
      {stats.length === 0 && <p>No character move stats yet. Import games with {character} to get started.</p>}
      <div className="character-move-grid">
        {stats.map((stat) => (
          <button
            key={stat.key}
            className="character-move-tile"
            disabled={stat.value <= 0}
            aria-pressed={selected?.key === stat.key}
            onClick={() => setSelected(stat)}
          >
            <strong>
              {stat.value.toLocaleString()}
              {stat.suffix}
            </strong>
            <span>{stat.label}</span>
            <small>{TECHNIQUE_EXPLANATIONS[stat.key] || "Detected across your imported games."}</small>
            <span className="character-move-link">
              {stat.value > 0 ? (
                <>
                  View clips <ArrowRight size={13} />
                </>
              ) : (
                "None recorded"
              )}
            </span>
          </button>
        ))}
      </div>
      {selected && (
        <section className="card character-move-examples" aria-label={`${selected.label} replay examples`}>
          <h3>{selected.label} · action clips</h3>
          <p>
            Short clips from your recent games. Clips use matching move sequences; not every counted action has a
            timestamp.
          </p>
          {isLoading && <p role="status">Finding replays…</p>}
          {error && (
            <div role="alert">
              Could not load replays.{" "}
              <button className="btn" onClick={() => void refetch()}>
                Try again
              </button>
            </div>
          )}
          {data && !data.some((game) => game.moments.length > 0) && (
            <p>No action clips available yet. Older imports may need their event data rebuilt.</p>
          )}
          {data
            ?.filter((game) => game.moments.length > 0)
            .map((game) => (
              <article key={game.gameId} className="character-move-game">
                <div>
                  <strong>vs {game.opponentTag || game.opponentCharacter}</strong>
                  <small>
                    {game.playedAt ? new Date(game.playedAt).toLocaleDateString() : "Date unavailable"} · {game.count}{" "}
                    recorded
                  </small>
                </div>
                {game.replayAvailable ? (
                  <div className="character-move-actions">
                    {game.moments.map((moment) => (
                      <button
                        key={moment.id}
                        className="btn"
                        onClick={() =>
                          openClip(
                            game.replayPath,
                            moment.startFrame,
                            moment.endFrame,
                            character,
                            game.opponentCharacter,
                          )
                        }
                        aria-label={`Watch ${selected.label} at ${moment.timestamp} against ${game.opponentTag}`}
                      >
                        <Play size={13} /> {moment.timestamp}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>Replay file moved or missing. Restore it to its original location to watch.</p>
                )}
              </article>
            ))}
          <p className="character-detail-note">
            Playback needs Slippi Playback Dolphin and your Melee game image. Set these in Settings → Playback.
          </p>
        </section>
      )}
    </section>
  );
}
