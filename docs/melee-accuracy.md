# Melee technical accuracy

The mandatory policy is in AGENTS.md and applies to assistant explanations, implementation, and all AI coaching. Plain language must preserve technical meaning.

## Current evidence and limits

- **Ken Combo:** MAGI's explicit user-required invariant is the finishing hit sequence **FAIR → FAIR → DAIR**, where that final DAIR takes the stock. It is implemented once in `src/kenCombo.ts` and used by parsing, highlights, live alerts, clips, and SQL data repair. There is one count. Negative tests reject nonlethal finishes, one FAIR, interrupted finishers, and kills ending with another move.
- **Stock-taking evidence:** the installed `@slippi/slippi-js` conversion computer marks `didKill` when it observes the victim lose a stock during that conversion. MAGI combines this flag with the final move records; the flag alone is not proof of a named technique. The maintained parser is [project-slippi/slippi-js](https://github.com/project-slippi/slippi-js).
- **Waveshine:** requires a wavedash out of shine. An observed shine→up-smash sequence or two shine hits does not establish the wavedash. Legacy counter keys remain for storage compatibility, but visible wording and coaching must describe the hit sequence, not claim verified waveshine inputs. See the community's [waveshine technique reference](https://www.ssbwiki.com/Waveshine).
- A clip is a view into the replay, not independent proof that every condition for a named mechanic was met. Unsupported or unavailable timestamps must not fall back to the full game.

## Detector audit (1.11.0)

Every highlight, character signature stat, and PlayerSummary counter was checked against the installed slippi-js source and against imported replays. The findings below are the current definitions; `tests/moveIds.test.ts`, `tests/killEvidence.test.ts`, `tests/highlights.test.ts`, `tests/signatureStats.test.ts`, and `tests/recoveryStats.test.ts` hold the positive and negative cases.

### Move ids (slippi-js `lastAttackLanded`)

The library's move table is `50 getup attack, 51 getup attack (slow), 52 pummel, 53 fthrow, 54 bthrow, 55 uthrow, 56 dthrow, 61/62 ledge attack`. A grab itself never appears in a conversion's move list because it deals no damage; the pummel or throw that follows is the evidence that a grab connected. Verified from fixture replays: throw state 219 (ThrowF) records id 53 and pummel state 217 records id 52. `moveIdToName` in `src/pipeline/helpers.ts` and the `MOVE_*` constants in `src/pipeline/signatureStats.ts` are the single table, and a parity test compares them to the library on every run.

### Kill evidence (`src/pipeline/killEvidence.ts`)

- On a kill conversion, `endFrame` is the frame the stock counter dropped. By then the victim is at the blast zone (x ≈ ±224 on Battlefield, y ≈ −110 for bottom deaths) in a Dead\* action state, so "offstage at endFrame" is true for every side or bottom death. It is never used as evidence.
- The victim's position on the frame of the final damaging hit is the "offstage when hit" signal.
- The victim's action state on the stock-loss frame is the death animation; `animations.getDeathDirection` decodes it (0 = down).
- **Spike kill** = final hit is the named move (dair; fair for Mario, Yoshi, DK; dair for Link, Young Link), the victim was offstage at that hit, and the death went off the bottom. A dair kill off the side, or a dair on a grounded opponent who later fell to the bottom, is not a spike.
- **Shine spike / gimp / edgeguard kill** = final hit landed with the victim offstage and the death did not go off the top.
- Doc's forward air is not a meteor smash; Doc has a plain fair-kill count.

### Stage boundaries

`stageBounds` derives its horizontal boundary from `STAGE_LEDGE_X` (FoD 63.35, PS 87.75, YS 56, DL 77.27, BF 68.4, FD 85.57). The previous table had Battlefield (86) and Dreamland (68) swapped: on Dreamland up to 8% of grounded frames near the edge were marked offstage in sampled games. Below y = −10 is also offstage.

### Recovery and edgeguard counters (`src/pipeline/recoveryStats.ts`)

A recovery situation starts below the stage or far past the ledge in a vulnerable air state and ends on the next onstage frame or at death. An edgeguard kill is credited only when the recovering player took damage inside the situation or the edgeguarder occupied the ledge during it; an unforced offstage death is reported separately. Death and respawn frames never open a situation (the old counter opened one on every death frame and closed it as a success on respawn).

### Highlights

- "Tipper F-Smash" is now "Early F-Smash Kill … (tipper not verified)": replay data does not distinguish tipper from sourspot, and the percent shown is the victim's percent before the final hit.
- "Comeback" requires winning after trailing by two or more stocks (read from the frames). Rows written by the old last-stock-win definition were relabeled "Last-Stock Win".
- Ganon side-B kills are "Gerudo Dragon Kill"; a Ganoncide is a specific suicide, which the data does not establish.
- The Sacred Combo is Knee Smash → Falcon Punch (adjacent fair → neutral-B hits); the old up air → knee detector is labeled "Up Air → Knee".
- Rest kills, Judgement kills, Ness back-throw kills, and Mewtwo up-throw kills require the named move to be the final hit.
- Luigi's Shoryuken requires the killing up-B to deal sweetspot damage (25% fresh vs 1% sour; gate ≥ 8%).
- Sheik tech-chase kills require a down/forward throw opener, three or more hits, and the victim observed in a down/tech state (183-204) inside the conversion. The live Cornerman alert cannot scan states and is labeled "Throw Follow-up".
- Ice Climbers "wobble" = eight or more pummel records (id 52) in one grab; Nana's hits during a wobble are attributed to Popo's pummel.

### Character stats

- Peach float: states 341 Float, 342/343 FloatEnd, 344-348 float aerials (slippi-js names 349-351 `PEACH_FSMASH1-3`). Verified from imported replays: float aerials enter from 341 and land into Landing (42), never into the AttackAir landing states 70-74. `floatAerials` counts entries into 344-348; `floatCancelAerials` counts 344-348 → 42 transitions.
- Lasers fired: Falco lasers spawn item type 55, Fox lasers item type 54 (verified across imported replays; 102 Falco spawns in four games). Counted as distinct spawn ids owned by the player.
- Every other special-move counter (`missileCount`, `fireBallCount`, `pillCount`, `capeCount`, `counterCount`, …) counts hits that connected, read from conversion move lists, and is labeled "… Hits". slippi-js's action counts have no special-move fields, so the previous "fired" labels always showed 0.
- Falcon tech-chase grabs: the opponent enters a grabbed (capture) state within 20 frames of being in a down/tech state. Gentlemen: entries into ATTACK_JAB3 (46).
- Falco shine → grab: shine immediately followed by a pummel or throw. Fox shine → up smash and Falcon stomp → knee require adjacent hits; Fox up throw → up air uses id 55.
- Chain grabs: two or more throws (ids 53-56) in one conversion; pummels are not throws.

### Known approximations (labeled, not upgraded)

- `powerShieldCount` = shieldstun (GuardSetOff 181) entered within four frames of raising shield. Imported replays show both GuardOn (178) and GuardReflect (182) as first shield states on ordinary presses, so 182 is not a powershield signal on its own.
- `dashDanceFrames` counts frames in Dash or Turn; slippi-js's `dashDanceCount` is the dash-dance count.
- `desyncs` (Ice Climbers) is a heuristic on Nana attacking while Popo is not in the same attack.
- `timeOnPlatform` uses fixed per-stage platform heights.
- Marth `fsmashKills` and Zelda forward/back-air kills do not distinguish sweetspot hits.

## Change checklist

Before adding or changing any Melee mechanic: document the required conditions, verify uncertain details against primary game/frame data or maintained parser source, identify which conditions the replay actually establishes, and test counterexamples. Keep counts, clips, historical repair, live alerts, labels, and coaching consistent. If evidence is insufficient, use an observational label or say it is unverified.

Detector definition changes must bump `FRAME_EVENTS_VERSION`; the backfill rebuilds event tables, game stats, signature stats, and highlights for stale games.
