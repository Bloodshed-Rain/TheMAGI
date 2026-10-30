/** Saved highlights are examples, not a reconstruction of every counted event. */
export const TECHNIQUE_HIGHLIGHTS: Record<string, string[]> = {
  kenCombos: ["ken-combo"],
  waveshineToUpsmash: ["waveshine-upsmash"],
  upthrowUpairs: ["upthrow-upair"],
  upthrowUpairKills: ["upthrow-upair"],
  shineSpikeKills: ["shine-spike"],
  pillarCombos: ["pillar-combo"],
  pillarKills: ["pillar-combo"],
  stompKnees: ["stomp-knee"],
};
export interface CharacterTechniqueExample {
  gameId: number;
  replayPath: string;
  replayAvailable: boolean;
  opponentTag: string;
  opponentCharacter: string;
  playedAt: string | null;
  count: number;
  moments: Array<{ id: number; startFrame: number; timestamp: string; endFrame: number }>;
}
export function validateTechniqueKey(key: unknown): string {
  if (key === "kenComboKills")
    throw new Error("Ken Combo is a single stat: FAIR → FAIR → DAIR with the final DAIR taking the stock.");
  if (typeof key !== "string" || !/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(key))
    throw new Error("Choose a valid character stat.");
  return key;
}
export const TECHNIQUE_EXPLANATIONS: Record<string, string> = {
  kenCombos: "FAIR → FAIR → DAIR. The final down air must take the stock.",
  multiShineCombos: "Combos with at least two shine hits. This count does not confirm a wavedash between shines.",
  waveshineToUpsmash:
    "A shine followed by up smash in the same combo. The detector does not confirm the wavedash input.",
  pillarCombos: "Falco’s down air → shine → down air sequence.",
  pillarKills: "Pillar combos that took a stock.",
  chainGrabs: "Repeated throws recorded in the same combo.",
  techChases: "Detected follow-ups after a throw or knockdown.",
};
