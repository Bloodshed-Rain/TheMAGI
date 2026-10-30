import { techniqueActionRange, type TechniqueMove } from "./techniqueClips";
import fs from "fs";
import {
  TECHNIQUE_HIGHLIGHTS,
  validateTechniqueKey,
  type CharacterTechniqueExample,
} from "./characterTechniqueExamples";
interface TechniqueDatabase {
  prepare(sql: string): { all(...params: (string | number)[]): unknown[] };
}
/** Only games played AS this character; counts and clips remain separate. */
export function readCharacterTechniqueExamples(
  database: TechniqueDatabase,
  character: string,
  statKey: string,
): CharacterTechniqueExample[] {
  const key = validateTechniqueKey(statKey);
  if (typeof character !== "string" || character.length > 40) throw new Error("Choose a valid character.");
  const rows = database
    .prepare(
      `
    SELECT g.id as gameId, g.replay_path as replayPath, g.opponent_tag as opponentTag,
      g.opponent_character as opponentCharacter, g.played_at as playedAt,
      CAST(json_extract(css.signature_json, ?) AS REAL) as count
    FROM games g JOIN character_signature_stats css ON css.game_id = g.id
    WHERE g.player_character = ? AND CAST(json_extract(css.signature_json, ?) AS REAL) > 0
    ORDER BY g.played_at DESC, g.id DESC LIMIT 30
  `,
    )
    .all(`$.${key}`, character, `$.${key}`) as Omit<CharacterTechniqueExample, "moments" | "replayAvailable">[];
  const types = key === "kenCombos" ? [] : (TECHNIQUE_HIGHLIGHTS[key] ?? []);
  return rows.map((row) => {
    const conversions = database
      .prepare(
        `SELECT id, moves_json as movesJson, did_kill as didKill FROM conversions WHERE game_id = ? AND attacker_is_player = 1 ORDER BY start_frame`,
      )
      .all(row.gameId) as { id: number; movesJson: string; didKill: number }[];
    const clips = conversions.flatMap((conversion) => {
      let moves: TechniqueMove[];
      try {
        moves = JSON.parse(conversion.movesJson);
      } catch {
        return [];
      }
      const range = techniqueActionRange(key, moves, Boolean(conversion.didKill));
      if (!range) return [];
      const seconds = Math.floor((range.startFrame + 60) / 60);
      return [
        {
          id: -conversion.id,
          ...range,
          timestamp: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
        },
      ];
    });
    const saved = types.length
      ? (database
          .prepare(
            `
      SELECT h.id, h.start_frame as startFrame, h.timestamp,
        COALESCE((SELECT c.end_frame FROM conversions c WHERE c.game_id = h.game_id AND c.attacker_is_player = 1 AND c.start_frame = h.start_frame LIMIT 1), h.start_frame + 240) as endFrame
      FROM highlights h WHERE h.game_id = ? AND h.character = ? AND h.type IN (${types.map(() => "?").join(",")}) ORDER BY h.start_frame LIMIT 12
    `,
          )
          .all(row.gameId, character, ...types) as CharacterTechniqueExample["moments"])
      : [];
    return {
      ...row,
      replayAvailable: fs.existsSync(row.replayPath),
      moments: (clips.length
        ? clips
        : saved.map((clip) => ({
            ...clip,
            startFrame: Math.max(0, clip.startFrame - 60),
            endFrame: Math.max(clip.startFrame + 60, clip.endFrame + 90),
          }))
      ).slice(0, 12),
    };
  });
}
