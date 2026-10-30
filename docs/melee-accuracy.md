# Melee technical accuracy

The mandatory policy is in AGENTS.md and applies to assistant explanations, implementation, and all AI coaching. Plain language must preserve technical meaning.

## Current evidence and limits

- **Ken Combo:** MAGI's explicit user-required invariant is the finishing hit sequence **FAIR → FAIR → DAIR**, where that final DAIR takes the stock. It is implemented once in `src/kenCombo.ts` and used by parsing, highlights, live alerts, clips, and SQL data repair. There is one count. Negative tests reject nonlethal finishes, one FAIR, interrupted finishers, and kills ending with another move.
- **Stock-taking evidence:** the installed `@slippi/slippi-js` conversion computer marks `didKill` when it observes the victim lose a stock during that conversion. MAGI combines this flag with the final move records; the flag alone is not proof of a named technique. The maintained parser is [project-slippi/slippi-js](https://github.com/project-slippi/slippi-js).
- **Waveshine:** requires a wavedash out of shine. An observed shine→up-smash sequence or two shine hits does not establish the wavedash. Legacy counter keys remain for storage compatibility, but visible wording and coaching must describe the hit sequence, not claim verified waveshine inputs. See the community's [waveshine technique reference](https://www.ssbwiki.com/Waveshine).
- A clip is a view into the replay, not independent proof that every condition for a named mechanic was met. Unsupported or unavailable timestamps must not fall back to the full game.

## Change checklist

Before adding or changing any Melee mechanic: document the required conditions, verify uncertain details against primary game/frame data or maintained parser source, identify which conditions the replay actually establishes, and test counterexamples. Keep counts, clips, historical repair, live alerts, labels, and coaching consistent. If evidence is insufficient, use an observational label or say it is unverified.

This document records the areas checked in this change. It is not a claim that every pre-existing detector has been audited.
