# Release notes

## 1.12.0 — 2026-11-06

- Scope every AI analysis to the data that invoked it. A single-game review (Library → Game Theater) now ranks and reports only what happened in that game: the player's history decides whether to call something a habit, never whether it counts, and a pattern that did not occur in the game is no longer a finding. The lifetime profile (record, other characters, overall trend) is replaced by one background line, the player's record in that exact matchup before the game.
- Character coaching and the character blurb discuss only the games played as that character. The prompt states the scope explicitly (games the player played AS the character, never games against it) and no longer receives the lifetime record or other characters.
- Replace the Dashboard's five-game Oracle paragraph with an analysis of every recorded game, written for what a human coach cannot hold in their head: habits that persist across characters and matchups (with how often each matchup punishes them), what changed between the oldest and newest games, what separates wins from losses, and the recent games against the career baseline. It is cached with the game count it covered and offers a refresh when new games arrive. The unused "deep pattern discovery" and trend-commentary prompts are removed.
- Win/loss separators and correlations given to the career analysis use only exact per-game measurements: the labeled power-shield approximation and the pre-measured-DI proxy scores are excluded, correlations need at least 20 games and |r| ≥ 0.25, and every block carries its sample size.
- Coaching prompt version 4: cached analyses from earlier versions are regenerated when next opened.

## 1.11.0 — 2026-11-03

- Audit highlight detection, character-specific action detection, and per-game statistics against the installed slippi-js parser and imported replays; correct every detector whose evidence did not establish what it claimed. Details and evidence are in [docs/melee-accuracy.md](docs/melee-accuracy.md).
- Fix the move-id table for grabs and throws: pummel is 52 and the throws are 53-56 (forward, back, up, down). The old table was shifted by one, so throw names in combo strings, kill moves, key moments, and coaching prompts were wrong, "up throw → up air" matched back throws, pummels counted as chain-grab throws, and Ice Climbers wobbles could never be detected.
- Spike, shine-spike, gimp, and offstage-kill evidence now reads the victim's position when the final hit landed and the blast-zone direction of the death. The old check used the stock-loss frame, where every side or bottom death is already at the blast zone, so any dair kill counted as a spike.
- Derive the offstage boundary from each stage's real ledge position. Battlefield and Dreamland were swapped, which marked standing near Dreamland's edge as offstage and inflated recovery, edgeguard, and resource-fault counts there.
- Edgeguard success only credits a death after a hit during the recovery or ledge occupation by the edgeguarder; unforced offstage deaths no longer count. Death and respawn frames no longer open phantom recovery attempts.
- Rename or redefine overclaiming highlights: "Tipper F-Smash" becomes "Early F-Smash Kill (tipper not verified)", "Comeback" requires winning after a two-stock deficit (previous rows become "Last-Stock Win"), "Ganoncide" becomes "Gerudo Dragon Kill", "Sacred Combo" is now knee → Falcon Punch, rest and judgement kills require the move to be the final hit, Sheik tech-chase kills require an observed knockdown state, and Luigi's Shoryuken requires sweetspot damage.
- Peach float cancels are read from her float-aerial action states landing mid-animation; the previous heuristic never looked at those states. Fox and Falco laser counts come from the replay's projectile records. All other special-move counters now count hits that connected and are labeled as such (they previously always read 0).
- Falcon tech-chase grabs are grabs that connect within 20 frames of a knockdown or tech state; Falco shine → grab is evidenced by the following pummel or throw; Fox shine → up smash and Falcon stomp → knee must be adjacent hits.
- Jumpsquat no longer counts as airborne, and per-stock neutral win rate uses the same neutral-win opening type as the headline stat.
- The database upgrade relabels or removes legacy highlights that cannot be trusted, and the backfill command now rebuilds game stats, signature stats, and highlights together with the event tables. Run it after upgrading to refresh older games.
- Add `npm run backfill`, a shell-independent launcher for the backfill CLI (the previous command needed a PowerShell-only or POSIX-only environment variable).
- Coaching prompts are insight-first: findings must cite measured evidence with sample sizes instead of restating visible stats, under fixed headings (The Read, Fix This First, Also Worth Fixing, Exploit Next Game, Keep Doing, Set Analysis, Practice Plan) that the coaching cards parse.
- Every coaching entry point (single game, set, recent, session, and aggregate scopes) receives the same measured-pattern history (habits, DI, whiffs, shield decisions, recovery) for this game, the matchup, and the character, with deviation flags and sample guards; the analyzed games are excluded from their own history.
- Cached coaching analyses record the prompt version that produced them and are regenerated after prompt or input changes instead of being reused.
- Measured DI anchors the final-hit search at the frame the victim entered a dying state, so Star KOs are no longer mislabeled as self-destructs; a death with no hit in the final window but a live kill conversion is reported as a failed recovery, and only a death with no kill conversion is a self-destruct.
- New imports stamp each game with the event-detector version so the backfill can tell which games still carry older definitions.

## 1.10.1 — 2026-10-30

- Add a ChatGPT plan connection for optional coaching: browser sign-in and consent, account-provided models, account switching, refresh, disconnect, and usage management. Keep connection tokens in OS-encrypted main-process storage. Account eligibility and usage limits apply; live provider responses have not been verified in this documentation refresh.
- Add Oracle and recent-form panel options alongside live stats, opponent/set tracking, Cornerman, practice focus, and notes in Play Mode.
- Prepare live tracking from the hosted Dolphin's replay-saving configuration, with replay-source and AI-readiness status shown separately. Starting a live session enables live stats; stopping Cornerman leaves the app-wide import watcher active.
- Preserve queued Play Mode preference saves across route changes and write configuration through a flushed temporary file before replacement.
- Refresh the README, user/development documentation, release instructions, and website feature tour to describe the current app, platform requirements, optional AI, and replay-clip limits.

The downloadable release also includes the setup wizard, character action clips, Fullscreen panels, integrated Cornerman, and technical-accuracy changes described in 1.9.0 and 1.10.0 below. See [1.10.1 release details](docs/releases/v1.10.1.md) for installation and upgrade notes.

## 1.10.0 — 2026-10-29

- Keep information visible in the existing black side bars in Fullscreen, preserving the largest 4:3 game image. Add a saved auto-hide option and use edge reveal when the available bars are too narrow.
- Integrate Cornerman coaching, live alerts, errors, and voice into the main app and Play Mode panels. Remove the separate popup window and its controls. Delivery continues across page changes.
- Simplify the Play Mode toolbar, add the MAGI logo, rename Game Only to Fullscreen, and move sidebar toggles into Customize.
- Move game paths and Cornerman’s enable switch to Settings → Play Mode settings. Hide live-session controls and skip automatic tracking when Cornerman is disabled.
- Keep optional voice and desktop notifications; desktop notifications are off by default for unset preferences.

## 1.9.0 — 2026-10-29

- Add a resumable first-run setup wizard for player identity, replay imports, and optional game paths, with checks and clear recovery steps.
- Feature Play Mode above Analyze in the sidebar and align its surfaces with Liquid, Telemetry, Tournament, and Light. Remove CRT and Amber; saved selections migrate to Liquid.
- Organize character dossiers around the large wireframe, with clickable surrounding stats, expandable core numbers, and plain-language details.
- Add bounded action clips for supported character-specific sequences, including replay availability checks and start/end limits for embedded and external playback. No whole-game fallback for these clips.
- Enforce the project’s single Ken Combo definition: FAIR → FAIR → DAIR, with the final DAIR taking the stock. Correct parsing, live alerts, highlights, clips, and historical counts; remove the separate kill category.
- Apply technical-accuracy instructions to every AI coaching request and describe observed shine sequences without claiming unverified wavedash inputs.
- Update setup and troubleshooting documentation and remove verified obsolete capture/desktop metadata files.
- Show the running app’s version in Settings, using Electron’s packaged version as the source of truth.

Existing replay data is retained. On first launch, database migration 15 repairs legacy Ken Combo counts and invalid highlights and clears outdated Marth character coaching caches. This release does not claim a complete audit of every existing Melee detector.

Validation: automated tests, type checks, lint, four-skin UI checks, packaged migration checks, and native Melee/replay clip checks. AI provider responses were not exercised against live accounts.
