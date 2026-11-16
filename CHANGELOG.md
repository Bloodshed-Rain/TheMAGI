# Release notes

## 1.16.0 — 2026-11-15

- Add a **Best Character** panel to the Dashboard, under Recent Form. It shows the wireframe of your best character with their record, and one sentence: what you do well with them and what to work on. A button opens that character's page.
- Best character is decided by results: the highest win rate after discounting small samples (the lower bound of the 95% Wilson interval), among characters with at least 10 decided games. A 10-0 pocket pick no longer outranks hundreds of games at 60%. Draws and unfinished games count toward neither side. Until one character has 10 decided games the panel says so and names the closest.
- "Does well" and "Work on" compare that character with your other characters combined on five measures: neutral win rate, openings converted (two or more hits), damage per opening, recoveries that made it back, and edgeguards that took the stock. Each is a total across games (for example 743 of 10,031 edgeguards), never an average of per-game percentages, so a game with no attempts adds nothing instead of counting as 0%. A measure is compared only with enough events on both sides (100 exchanges or openings, 50 recoveries or edgeguards), and is named only when it differs by 5% or more. Both tiles show the counts behind them.
- With games on only one character there is nothing to compare against, and the panel says that instead of naming a strength or weakness.
- The whole-record analysis card now matches the height of the column beside it and scrolls inside it, so neither Dashboard column leaves a blank area.
- Remove the **Performance Lab** page and its entries in the sidebar and the command palette. Its scorecard repeated the Dashboard and Trends, and its suggestions and review queue came from the same per-game averages. An old link to it opens the Dashboard. Play Mode's Recent form module is unchanged. Training-log entries already saved stay in the database, but nothing in the app shows or adds to them now. Notes on individual games (the game page) are unchanged.
- The unused `bestCharacter` field of the dashboard highlights query now uses the same ranking (it was the highest raw win rate with 3 decided games).
- Development only: packaging builds now empty the main-process output folder first. Compiled files left over from sources deleted months ago were still being picked up, and the artifact check rejected the package.

## 1.15.0 — 2026-11-15

- Add an **Input display** module to Play Mode. It is in the Customize module tray, labeled Stream. It draws your controller as a GameCube wireframe and lights the lines of each control while it is held: A green, B red, Z purple, the C-stick yellow, everything else white. The stick caps move with the sticks, and L and R brighten with how far the trigger is pressed.
- The display shows the inputs the running game read on each frame, taken from the hosted Dolphin's local spectator stream (the stream Slippi Launcher broadcasts from). MAGI connects only while Melee is running and the module is on screen. Inputs appear during a game, not in menus, and online they follow Slippi's delay setting.
- A press that lasts one frame is always drawn. When several game frames arrive between two screen refreshes, that refresh shows every button held on any of them and the next shows the newest frame alone.
- Only your controller is shown. You are matched by the connect code or tag in your profile, or by being the only human player in the game. When MAGI cannot tell which player is you, the display stays dark and says so. When the Dolphin's spectator stream is turned off, the module names the setting to change.
- Open faster: the page you land on is loaded before the first render, so it appears without a loading placeholder, and the other pages load in idle time so the first visit to each is as quick as a return visit.
- Faster character and pattern statistics on large libraries: the database upgrade (v18) collects query-planner statistics, and they are refreshed when the app closes. This changes how rows are fetched, never which rows or what they add up to.
- Lists ranked by a count or a rate now order tied entries the same way every time (larger sample first for best/worst picks, then by name; games at the same timestamp by import order). Before, two entries with equal counts could swap places, and a top-N list could keep a different one of them, depending on how SQLite ran the query. No count, rate or average changes.
- Remove files and code nothing used: the loose navigation icon exports and superseded screenshots, the wireframe optimizer script and its `sharp` dependency, and unreferenced query hooks and helpers.
- Development only: an unpackaged run on Windows shows the MAGI icon in the taskbar instead of Electron's.

## 1.14.0 — 2026-11-15

- Rebuild Play Mode's Customize view around a module tray. Every module is listed with what it shows and whether it needs a live session; add one with Add left / Add right or drag its card into a sidebar. The per-sidebar checkbox lists are gone.
- Drag a module by its title to reorder it or move it to the other sidebar; a marker shows where it will land and Escape cancels. Each module also has buttons to move up, move down, move to the other sidebar and remove, so everything works from the keyboard.
- Drag a sidebar's inner edge to resize it (or focus the edge and use the arrow keys). This replaces the width slider.
- Fold any module to its title with the chevron in its header, in or out of Customize. Folded modules are remembered.
- Scenes: Minimal, Live Coaching and Practice are joined by scenes you save by name (up to 12). Applying a scene restores which modules sit where, sidebar widths, displayed stats and folded modules; the fullscreen panel preference is not part of a scene. Saving under an existing name replaces that scene.
- A module now sits in one sidebar at a time. A layout saved by an earlier version with the same module on both sides keeps it on the left.
- Customize shows how wide the fullscreen side bars are on the current display, or says that panels will appear on edge hover when there is no room beside the game.

## 1.13.0 — 2026-11-15

- Add a motion layer so data arrives the way it reads and actions are confirmed, without anything looping for decoration. Every animation is skipped when the operating system asks for reduced motion.
- Changing theme (Settings → Appearance or the Appearance panel) opens the new theme as a circle from the button you pressed instead of cross-fading every color. It falls back to an instant change while a replay is embedded.
- KPI figures count up from zero and land on the exact value shown before; only single plain figures count (records, times and compound values render as written), and screen readers get the final value from the first frame.
- The Dashboard's Recent Form card and each character's hero banner catch a light under the pointer and tilt toward it (up to 3°, less for large cards).
- Filter pills: the active highlight glides to the pill you pick. The radar opens from its center and moves vertex to vertex when you change the comparison period.
- Stock timeline: the kill marker stamps onto a lost stock as its segment finishes. Highlight chips land in order, and a chip that took a stock rings once. A coaching card shows a lit edge while its text is streaming.
- Page headers, KPI rows, stat grids, table rows, empty states and recent-form dots enter in reading order; win-rate bars fill with a bright leading edge; chart sparklines ring once on their latest point; primary buttons get one sheen on hover.
- Character wireframes idle: on a character's page the figure hovers slightly and, every seven seconds, a ring of color radiates out from its center through the wires: a bright leading edge, then the character's color shifted in hue. On the Characters grid the tile under the pointer does the same.
- Win-rate bars carry a notch at 50%, so an even record reads at a glance; progress bars that are not win rates are unchanged.
- KPI tiles no longer show a "0" while their figure is still loading: the Dashboard and the Library hold the layout with shimmering placeholders until the real number arrives. A KPI whose figure changes while on screen lights its edge once, in the same green or red its trend line is already drawn in; figures with no stated standing do not flash.
- The newest game in a recent-form strip rings once after the dots appear.
- Fix cards not lifting on hover: the entrance animation left an inline transform on every card that cancelled the stylesheet's lift.
- Fix data tables wasting width: the row hover sweep was drawn with a pseudo-element that table layout treated as an extra column, so every auto-width column was narrower than it should be. With the width back, the Library table's Stocks, Neutral, L-Cancel and Dmg/Op headers are no longer cut off.

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
