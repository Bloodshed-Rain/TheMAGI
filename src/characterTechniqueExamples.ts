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
    "A shine immediately followed by an up smash hit in the same combo. The detector does not confirm the wavedash input.",
  upthrowUpairs: "An up throw followed by an up air hit in the same combo.",
  upthrowUpairKills: "Up throw → up air combos where the up air took the stock.",
  drillShines: "A down air immediately followed by a shine hit.",
  shineSpikeKills:
    "A shine that was the final hit, landed with the opponent offstage, and did not send them off the top.",
  laserCount: "Lasers fired, counted from the replay's projectile records.",
  pillarCombos: "Falco’s down air → shine → down air sequence.",
  pillarKills: "Pillar combos that took a stock.",
  shineGrabs: "A shine immediately followed by a pummel or throw, which is how a connected grab shows up in the data.",
  chainGrabs: "Two or more throws recorded in the same combo. Pummels do not count as throws.",
  fsmashKills: "Forward smash kills. Replay data does not distinguish tipper from sourspot hits.",
  techChases: "Combos with a down or forward throw, three or more hits, and the opponent in a knockdown or tech state.",
  techChaseKills: "Tech chases that took a stock.",
  techChaseGrabs: "Grabs that connected within 20 frames of the opponent being in a knockdown or tech state.",
  stompKnees: "A stomp (down air) immediately followed by a knee (forward air) hit.",
  upthrowKnees: "Combos with an up throw where the knee took the stock.",
  kneeKills: "Combos whose final hit was a forward air that took the stock.",
  gentlemanCount: "Third jabs performed (the gentleman).",
  restKills: "Rests that were the final hit and took the stock.",
  restAttempts: "Combos in which rest connected.",
  wobbles: "Combos with eight or more pummel records in one grab.",
  desyncs: "Stretches where Nana attacked while Popo was not in the same attack. Heuristic.",
  floatAerials: "Aerials started while floating.",
  floatCancelAerials: "Float aerials that landed before the animation ended (float cancels).",
  shoryukenKills: "Up-B kills where the hit dealt sweetspot damage.",
  fairSpikeKills: "Forward air kills that landed with the opponent offstage and sent them off the bottom.",
  dairSpikeKills: "Down air kills that landed with the opponent offstage and sent them off the bottom.",
  spikeKills: "Forward air kills that landed with the opponent offstage and sent them off the bottom.",
  lightningKickKills: "Forward or back air kills. Sweetspot is not distinguished.",
};
