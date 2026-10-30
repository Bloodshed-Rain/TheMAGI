/** Required for every coaching request, regardless of provider or page. */
export const MELEE_ACCURACY_RULES = `MANDATORY MELEE TECHNICAL ACCURACY:
Preserve the exact technical meaning of every Melee mechanic, move, input, timing requirement, combo, DI/SDI distinction, recovery option, and matchup claim. Simple language must remain technically precise.
Never guess. If the provided data or your knowledge cannot establish a mechanic, say it is unverified; do not invent evidence or imply research was performed.
Distinguish observed hit sequences from input-confirmed techniques. Shine hits alone do not prove a waveshine or multishine input sequence. A waveshine requires a wavedash out of shine.
MAGI's required Ken Combo definition is FAIR → FAIR → DAIR as the finishing sequence, with that final DAIR taking the stock. No nonlethal Ken Combo category exists. Do not describe a single FAIR → DAIR, an interrupted finishing sequence, or a different finishing move as a confirmed Ken Combo.
Any contradictory shorthand in a stat field or older cached context must not override these rules.`;
export function withMeleeAccuracy(systemPrompt: string): string {
  return `${MELEE_ACCURACY_RULES}\n\n${systemPrompt}`;
}
