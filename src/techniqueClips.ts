import { isKenCombo } from "./kenCombo";
export interface TechniqueMove {
  frame: number;
  moveId: number;
}
/** Match only actions the stored move sequence can establish. */
export function techniqueActionRange(
  key: string,
  moves: TechniqueMove[],
  didKill: boolean,
): { startFrame: number; endFrame: number } | null {
  if (!Array.isArray(moves) || moves.some((m) => !m || !Number.isFinite(m.frame) || !Number.isFinite(m.moveId)))
    return null;
  if (key === "kenCombos") {
    if (!isKenCombo(moves, didKill)) return null;
    return { startFrame: Math.max(0, moves.at(-3)!.frame - 60), endFrame: moves.at(-1)!.frame + 90 };
  }
  if (key === "kenComboKills") return null; // Removed legacy category.
  const pairs: Record<string, number[]> = {
    multiShineCombos: [21, 21],
    waveshineToUpsmash: [21, 11],
    upthrowUpairs: [54, 16],
    upthrowUpairKills: [54, 16],
    drillShines: [17, 21],
    pillarCombos: [17, 21, 17],
    pillarKills: [17, 21, 17],
    stompKnees: [17, 14],
    upthrowKnees: [54, 14],
  };
  if ((key.endsWith("Kills") || key === "pillarKills") && !didKill) return null;
  const pattern = pairs[key];
  if (pattern) {
    const adjacent = ["drillShines", "pillarCombos", "pillarKills", "stompKnees"].includes(key);
    for (let start = 0; start < moves.length; start++) {
      if (moves[start]!.moveId !== pattern[0]) continue;
      let matched = 1,
        end = start;
      for (let i = start + 1; i < moves.length && matched < pattern.length; i++) {
        if (moves[i]!.moveId === pattern[matched]) {
          matched++;
          end = i;
        } else if (adjacent) break;
      }
      if (matched === pattern.length)
        return { startFrame: Math.max(0, moves[start]!.frame - 60), endFrame: moves[end]!.frame + 90 };
    }
  }
  const finalMoves: Record<string, number> = {
    fsmashKills: 10,
    dsmashKills: 12,
    downSmashKills: 12,
    upSmashKills: 11,
    kneeKills: 14,
    dairKills: 17,
    upBKills: 20,
  };
  const last = moves.at(-1);
  if (last && didKill && finalMoves[key] === last.moveId)
    return { startFrame: Math.max(0, last.frame - 60), endFrame: last.frame + 90 };
  return null;
}
