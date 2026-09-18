# MAGI UI and UX audit

Audited: September 4, 2026. Scope: MAGI desktop app, current working tree (package version 1.7.0).

## Assessment

MAGI has a distinctive visual identity and a useful collection of coaching tools. Its largest weakness is continuity: setup, replay discovery, analysis, and practice do not consistently carry the player's context forward. Several failures also look like success, missing data, or inactivity. Fix these trust and workflow defects before adding more visual effects or top-level destinations.

Recommended product spine: **Import → choose a review target → watch the evidence → record an adjustment → practice it → compare the next sample.** Make the next action visible at every step.

## Evidence and limits

- Reviewed all 11 main destinations, Game Theater, the Cornerman overlay, shared navigation, query handling, coaching components, replay controls, forms, chart helpers, and styles. Some large components were reviewed through targeted source excerpts.
- Visually inspected all eight saved `app-*.png` screenshots. They are historical evidence: navigation, chart axes, result indicators, coaching placement, and text colors have changed since those captures. Screenshot-only concerns below are candidates for current visual verification, not claims about a freshly running build.
- Live browser inspection failed because the browser-control runtime could not initialize its Windows sandbox. No live clicks, screen-reader session, viewport measurements, native Dolphin testing, or current contrast measurements were completed.
- Reproduced the command-palette ordering mismatch and death-chart clamping with isolated calculations matching the source logic. These are logic checks, not end-to-end tests.
- Existing uncommitted changes were included in the review and preserved. This audit changes no app code. No build or application test suite was run.
- Marketing site, installer UX, and real coaching-output quality across providers are outside this desktop audit.

Evidence labels: **Source** = directly visible in current implementation; **Logic check** = additionally checked in isolation; **Visual hypothesis** = needs a current screenshot or live session. P1 = high-impact incorrect or misleading behavior; P2 = meaningful usability gap; P3 = polish. Effort estimates are relative: S = local change, M = shared behavior or several screens, L = product flow spanning layers.

## Findings

### 01 · P1 · Save and deletion feedback is hidden in another Settings section

**Evidence: Source. Effort: S.** [Settings.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Settings.tsx:335)

`handleSave` stores failures in `importStatus`, but that message is only rendered under Replays. Clearing data also writes success/failure there while the user remains in Data. An AI-key save failure can therefore leave the visible screen unchanged; a successful deletion can have no visible confirmation.

**Fix:** Give Settings a persistent status region beside Save. Keep import progress within Replays, and give Data its own completion/error feedback. Preserve edits on failure; prevent duplicate saves while pending.

**Accept when:** A rejected save is visible from every Settings section. A successful deletion updates the visible screen and counts; a failed deletion says nothing was cleared.

### 02 · P1 · Training can save successfully and then report an error

**Evidence: Source; live reproduction pending. Effort: S.** [PerformanceLab.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/PerformanceLab.tsx:57)

The submit handler awaits `createTrainingLog` and then calls `event.currentTarget.reset()`. React's event `currentTarget` is only available during dispatch; retaining the event does not retain that target across the await. The reset can throw after the write succeeds, skipping form closure and data refresh. Retrying may create duplicate blocks.

**Fix:** Capture the form element before awaiting, or use a form ref. Separate write failures from post-save refresh failures.

**Accept when:** A delayed successful save creates exactly one block, closes/resets the form, refreshes the log, and shows no error. A rejected write preserves the draft.

### 03 · P1 · Data changes do not reliably refresh the interface

**Evidence: Source. Effort: M.** [main.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/main.tsx:14), [Settings.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Settings.tsx:317), [CommandPalette.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/components/CommandPalette.tsx:312)

Queries stay fresh for five minutes and do not refetch on window focus. Several pages ignore `refreshKey`, and renderer code contains no shared query invalidation. Watcher import/error subscriptions live inside Settings and are removed when that page unmounts. Command-palette deletion neither awaits completion nor refreshes data. Recently visited screens can consequently show old games after import or deletion until another refetch occurs.

Settings also initializes its local watcher state to false on every mount, independently of the global status; returning after starting a watcher can present the wrong control state.

**Fix:** Own import/watcher subscriptions at app level, reconcile watcher state with the main process, and invalidate affected queries after successful mutations/events. Route all deletion entry points through the same awaited action.

**Accept when:** Visit Library, import games, return immediately, and see the new count. Start watching, leave Settings, import a replay, and see refreshed data. Clear data from either entry point and see consistent empty states everywhere.

### 04 · P1 · Death-percent trends flatten valid values above 100

**Evidence: Source + logic check. Effort: S.** [Trends.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Trends.tsx:58), [sparklineMath.ts](C:/Users/MC/Desktop/MAGI/src/renderer/components/ui/sparklineMath.ts:1)

Average death percent uses a fixed `[0, 100]` domain. The plotting helper clamps out-of-range values. The isolated calculation maps 110, 140, and 170 to the same top coordinate. The headline can show a changing value while the graph appears flat.

**Fix:** Use a domain appropriate to damage percent, with enough headroom for the actual sample. Keep the fixed 0–100% treatment for true rates only.

**Accept when:** A sample containing 110, 140, and 170 displays three distinct heights, with matching axis labels and no silent clipping.

### 05 · P1 · Command-palette Enter can execute a different highlighted action

**Evidence: Source + logic check. Effort: S.** [CommandPalette.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/components/CommandPalette.tsx:378)

Results are ranked in a flat array, regrouped by category for display, and assigned a new visual index. Enter and `aria-activedescendant` still use the original ranked array. Those orders differ when categories interleave.

The isolated check, without opponent results, found that query `s` highlights Characters at row 6 while Enter selects Open Settings. Query `r` highlights MAGI Oracle at row 8 while Enter selects Import Replays. Actual opponent matches can change row positions, but not the underlying defect.

**Fix:** Derive rendered rows, selected item, keyboard action, and accessibility state from one final ordered list.

**Accept when:** Every arrow-key-highlighted result executes that exact result with Enter, including mixed navigation/action/opponent searches.

### 06 · P1 · Dashboard import lacks failure feedback and first-import progress

**Evidence: Source. Effort: M.** [Dashboard.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Dashboard.tsx:79)

The import handler has `finally` but no catch or visible error. Its successful result summary is discarded. On the empty dashboard, the CTA does not consume the `importing` state, so the first and most consequential import lacks even the populated page's disabled/loading button treatment. Settings has detailed progress and failed-file feedback, creating different experiences for the same operation.

**Fix:** Share the existing import progress/result experience between entry points. Show scanning, processed/total, imported, skipped, and failed counts; prevent duplicate starts and keep status available across navigation.

**Accept when:** First import visibly starts once, reports partial failures, and exposes a retry/recovery path. A rejected operation never silently returns to an unchanged button.

### 07 · P2 · Setup requirements and destination labels are inconsistent

**Evidence: Source. Effort: M.** [Dashboard.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Dashboard.tsx:79), [Settings.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Settings.tsx:419), [App.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/App.tsx)

Dashboard accepts a connect code or display tag, but Settings import/watcher requires a display tag even with a connect code. “Import Replays” in the palette only opens Settings, which starts on Profile. Empty screens use “Open Settings” rather than taking users to the missing step. Theme/folder changes auto-save while profile/provider fields require Save, without a consistent pending-change model.

**Fix:** Use one identity rule and a short first-run sequence: identify player, select folder, import, open first review. Deep-link to the relevant Settings section, explain prerequisites inline, and make saving behavior explicit. Keep optional AI/playback setup separate from basic replay import.

**Accept when:** A connect-code-only player can complete the same import through every entry point. Every setup CTA opens the required section, with a clear return to the original task.

### 08 · P2 · Reviewing a game loses the discovery context

**Evidence: Source. Effort: M.** [Library.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Library.tsx:19), [Rivals.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Rivals.tsx), [Characters.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Characters.tsx)

Library filters/page and selected rival/character are local component state. Leaving for a game unmounts the originating page. Game Theater's Back restores the route but not those selections. Separately, selecting a named opponent in the palette opens generic Sessions and discards the opponent key.

**Fix:** Put filters and selected entities into route/search state or a persistent view store. Restore scroll position. Open the selected opponent's dossier directly.

**Accept when:** Filter Library, open a game, press Back, and return to the same page/filter/row. A rival-game round trip restores that rival. Palette opponent results open the named opponent.

### 09 · P2 · Dashboard numbers refer to different unlabeled samples

**Evidence: Source. Effort: S–M.** [Dashboard.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Dashboard.tsx:114)

Win Rate uses the overall record; technique averages use up to 20 recent games; Recent Form uses 10; Oracle receives five. These are defensible choices, but the UI does not consistently disclose them. Users can interpret differing coaching and KPI numbers as contradictions. Delta labels also omit the comparison sample.

**Fix:** Label each scope explicitly or use a shared sample selector. Explain the delta baseline and percentage-point abbreviation. Show sample size beside coaching, not just numeric tiles.

**Accept when:** Every headline metric and coaching summary identifies the games/time range it describes and the baseline used for a delta.

### 10 · P2 · Draws become losses in some views

**Evidence: Source. Effort: S.** [Dashboard.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Dashboard.tsx:239), [Rivals.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Rivals.tsx:465), [GameTheater.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/GameTheater.tsx)

Dashboard passes every non-win to the loss indicator. Rival Recent Form counts `recentGames.length - recentWins` as losses. Theater similarly renders W/L only. Shared ResultDot and Sessions already support draws, so one replay can be represented differently between screens.

**Fix:** Preserve win/loss/draw throughout presentation and state which outcomes contribute to win rate.

**Accept when:** A draw remains a draw in the library, dashboard, rival dossier, session, and theater, and does not increase a loss count.

### 11 · P2 · Empty, loading, and failed states are conflated

**Evidence: Source. Effort: M.** [PerformanceLab.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/PerformanceLab.tsx:94), [Practice.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Practice.tsx), [Trends.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Trends.tsx:197)

Performance Lab's zero-data branch says training can be logged “below,” then returns before rendering the form. Practice starts with an empty list and has no load/error state for listing plans. Dashboard can treat a query failure as no imported replays. Sessions, Trends, and Rivals tell users to retry without providing an actual Retry control. Game Theater treats both fetch errors and absent records as “Game not found.”

**Fix:** Standardize loading, zero-data, zero-results, and failure components with distinct messages and working actions. Keep data-independent actions available during zero-data states.

**Accept when:** Slow requests do not flash false empty states; failed requests provide Retry; zero-data Performance Lab can log training; a temporary fetch failure does not claim a game was deleted.

### 12 · P2 · Session history has inaccessible overflow

**Evidence: Source. Effort: M.** [Sessions.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Sessions.tsx:77)

Only 16 games are exposed as buttons; remaining games appear as a non-interactive `+N`. There is no “View all games in this session” action. The page requests only 90 days without offering a date range or explaining the limit. Calendar-day grouping is disclosed, but cannot distinguish two separate play sessions on one day.

**Fix:** Make the full day openable in a filtered Library or detail view. Add a history range. Treat gap-based sessions as a later enhancement if players need them.

**Accept when:** Every game in a 25-game day is reachable from that card and older imported dates can be found without manually searching unrelated screens.

### 13 · P2 · Oracle submission gives weak confirmation and restricts composition

**Evidence: Source. Effort: M.** [Oracle.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Oracle.tsx:56)

The sent question appears in history only after the entire answer returns. Until then the UI shows Thinking, and the single-line input is disabled. Starter questions are particularly opaque because the submitted text is not shown while waiting. There is no stop control or partial response. Retry and question preservation already exist and should be retained.

**Fix:** Display the submitted question immediately, use a labeled multiline composer, and expose meaningful queued/generating states. Add cancellation only with backend support. Keep the next draft separate from the pending question.

**Accept when:** Clicking a starter immediately shows its exact question, a long answer has visible progress, and a failed request retains a recoverable draft without duplicating conversation entries.

### 14 · P2 · Dashboard coaching can stay stale or remain blank

**Evidence: Source. Effort: S–M.** [Dashboard.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Dashboard.tsx:375)

The insight effect reacts to a changed game key but only runs when `!insight`; an existing insight is not invalidated when new games arrive. With one or two games the card has no message at all. On failure it shows raw error text without a retry action. Analysis starts automatically on mount without identifying its current provider/model in the card.

**Fix:** Key stored insights to their sample, mark old insight stale while updating, show the minimum-sample state, and provide Refresh/Retry. Make automatic generation behavior clear in preferences and identify the analysis source.

**Accept when:** Importing another game changes or explicitly marks the prior insight; two-game accounts see a helpful message; failures offer recovery.

### 15 · P2 · Practice records completion without closing the improvement loop

**Evidence: Source/product assessment. Effort: L.** [Practice.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Practice.tsx)

Plans show drill names, targets, checkboxes, and deletion. The stored weakness summary is not displayed. There is no visible link to the supporting replay, guided drill setup, or later comparison against the original weakness. “Due” means incomplete, although no due date exists. Completion and delete handlers also lack visible failure handling.

**Fix:** Show “Why this drill,” a linked example, setup instructions, and a measurable target. Rename “due” to “remaining” until scheduling exists. Link plan completion to a later replay comparison; add local pending/error states first.

**Accept when:** Players can explain why a drill was chosen, start it without reconstructing the analysis, and see whether the relevant measure improved. Failed checkboxes do not silently do nothing.

### 16 · P2 · Modal focus management is incomplete

**Evidence: Source; assistive-technology verification pending. Effort: M.** [CoachingModal.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/components/CoachingModal.tsx:136), [CommandPalette.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/components/CommandPalette.tsx:455)

The coaching modal has initial focus, Escape, and restoration, but neither it nor the command palette traps focus or makes the background inert. The palette also lacks explicit trigger-focus restoration. `aria-modal` alone does not implement those behaviors. The non-modal Tweaks panel has its own partial interaction model.

**Fix:** Use a shared dialog implementation with containment, background exclusion, restoration, and a clear policy for nested replay/coaching surfaces. Treat Tweaks consistently as a non-modal panel or a modal.

**Accept when:** Tab/Shift+Tab stay within modal controls; Escape closes the topmost layer; focus returns to the opener; background actions cannot be accidentally activated.

### 17 · P2 · Form names and chart alternatives are incomplete

**Evidence: Source. Effort: M.** [Library.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Library.tsx:128), [Oracle.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Oracle.tsx:137), [GameReviewNotes.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/components/GameReviewNotes.tsx), [Sparkline.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/components/ui/Sparkline.tsx)

Library selects use nearby div text rather than associated labels. Oracle input and review-note textarea rely on placeholders. Sparkline has no accessible name, summary, data table, or keyboard inspection. Rival/Tweaks selection buttons do not consistently expose their selected state, unlike shared Pill.

**Fix:** Add persistent programmatic labels, selected-state semantics, and a textual chart summary/table. Announce operation completion/errors without reading every streaming chunk.

**Accept when:** Controls have meaningful names without placeholders, selected filters are announced, and the important chart information is available without vision or a mouse.

### 18 · P2 · Streaming coaching pulls readers away from earlier text

**Evidence: Source. Effort: S.** [CoachingModal.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/components/CoachingModal.tsx:120), [CoachingPanel.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/components/CoachingPanel.tsx)

Every incoming chunk scrolls to the bottom while loading. A player trying to reread the first adjustment is pulled back down. Reduced motion changes the scroll style, but does not prevent this loss of reading position.

**Fix:** Auto-follow only while the reader is near the bottom; otherwise expose “New analysis below.”

**Accept when:** Scrolling upward during a streamed answer keeps the reading position stable, and one action resumes following.

### 19 · P2 · Library sacrifices identifying information to numeric columns

**Evidence: Source + historical screenshot. Effort: M.** [components.css](C:/Users/MC/Desktop/MAGI/src/renderer/styles/components.css:354), [Library.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Library.tsx:208)

The saved Library screenshot truncates matchup, opponent, stage, and column names. Current tables still use fixed layout and ellipsis; search adds a 220px moments column alongside four fixed statistic columns. Although a horizontal-scroll wrapper exists, shrinking unspecified identity columns can still hide the information needed to recognize a game.

**Fix:** Prioritize result, matchup, opponent, date, and review action. Put secondary metrics behind a column chooser or detail view; enforce sensible minimum widths and expose full text on focus as well as hover. Clarify that the Matchup filter selects opponent character if that is the intended behavior.

**Accept when:** At the supported minimum desktop width, long tags and matchups can be identified without opening each row, including while searching moments.

### 20 · P2 · Visual hierarchy gives decoration and summary cards too much weight

**Evidence: Visual hypothesis + source. Effort: M.** [Saved dashboard](C:/Users/MC/Desktop/MAGI/screenshots/app-dashboard.png), [Saved library](C:/Users/MC/Desktop/MAGI/screenshots/app-library.png), [Saved characters](C:/Users/MC/Desktop/MAGI/screenshots/app-characters.png)

The historical design uses large rounded translucent cards, a prominent background mark, many uppercase labels, and substantial space before actionable content. Dashboard's long Oracle panel stretches the adjacent Recent Form area; Library emphasizes four KPI cards before discovery; Characters gives artwork most of each tile. Small 9–11px labels remain in current styles and Practice targets.

**Fix:** Preserve the metallic identity in the shell and character art. Use calmer, more opaque reading surfaces; promote one “Review this game” or “Today's focus” action above the fold; reduce summary-card height and use 12–14px secondary text as a design target. Offer denser character browsing while retaining richer detail pages.

**Accept when:** A current 1366×768 capture shows the primary next action and useful content immediately. Measure actual text contrast over composited surfaces; do not infer accessibility from color tokens alone.

### 21 · P2 · Playback and live-coaching recovery stops at an error message

**Evidence: Source; native behavior pending. Effort: M.** [ReplayEmbed.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/components/ReplayEmbed.tsx:113), [Cornerman.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Cornerman.tsx)

ReplayEmbed offers an external fallback, but failure of that fallback only logs to the console. Cornerman tells users to set the folder/tag in Settings without a direct setup action. Status-load failure is swallowed. “Watcher idle” and “Inactive” communicate implementation states better than what players should do next.

**Fix:** Add context-specific recovery: Configure playback, Locate replay, Retry, and Open replay setup. Separate starting, waiting for a replay, generating coaching, and failed states. Keep native overlay voice/transparency controls and verify they do not interrupt gameplay focus.

**Accept when:** A missing Dolphin path or failed external launch gives an actionable visible message. Missing Cornerman setup has a direct repair action. A failed status check is distinguishable from inactive coaching.

### 22 · P2 · A theme changes behavior and can discard the current page state

**Evidence: Source. Effort: M.** [LiquidShell.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/components/LiquidShell.tsx:155)

Windows 2000 mode adds File/Edit/View/Help text with no behavior. Close runs the same minimize action as Minimize. Minimizing removes the page subtree, so restoring can reset unsaved/local state. Clicking the active navigation item also minimizes the page, whereas other themes keep it open or reset character selection.

**Fix:** Keep page state mounted while hidden and define predictable controls. Remove nonfunctional menu affordances or implement them. If desktop simulation is intentional, expose it as a distinct interaction mode with deliberate semantics rather than a purely cosmetic theme.

**Accept when:** Minimizing/restoring retains an Oracle draft, Settings edits, and Library filters. Every visible menu/control does what its label implies.

### 23 · P2 · Training history is silently truncated

**Evidence: Source. Effort: S–M.** [PerformanceLab.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/PerformanceLab.tsx:282)

The page fetches 30 training entries, totals their minutes, and renders only six, with no View all action. “Minutes tracked” does not disclose that it refers to the fetched subset. Players cannot inspect older work from this view and may read the number as lifetime effort.

**Fix:** Label the sample and provide paginated history or a full-log view. Use a separate aggregate for a lifetime total if needed.

**Accept when:** All saved entries are accessible and every total clearly states its range.

### 24 · P2 · Trend and scouting conclusions need more interpretation context

**Evidence: Source/product assessment. Effort: M.** [Trends.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Trends.tsx:76), [Rivals.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Rivals.tsx:433)

The Trends headline is the latest five-game rolling value, but its delta compares the first and second halves of the smoothed sample. The difference is not explained. Points are spaced by game index while axis labels are dates, which can imply elapsed-time spacing. Charts cannot reveal the underlying game on hover/focus. Rival “Best current stage” selects the highest win rate without a minimum sample, allowing one win to dominate a recommendation.

**Fix:** Explain the comparison directly, label game-index spacing, and expose point values/sample dates. Use sample-aware wording for scouting, such as “Highest observed win rate: 1 game; limited evidence,” before recommending a stage.

**Accept when:** A player can identify what changed, what it was compared against, and which replays support it. One-game records are visibly tentative.

## Screen-by-screen direction

| Surface | Keep | Change first |
|---|---|---|
| Dashboard | Recent form, game links, highlight discovery | One next review action; explicit samples; shared import state |
| Performance Lab | Baseline comparison, review rationale, training context | Repair save and empty state; expose full log; promote review queue |
| Library | Moment search and direct seeking, pagination, Clear filters | Preserve search context; prioritize identity columns; label filters |
| Sessions | Calendar grouping and reports | Open full day; explain/extend history range |
| Trends | Metric selection, rolling average, low-sample message | Correct death scale; disclose comparison; inspect data points |
| Characters | Recognizable art, played/unplayed distinction, contextual analytics | Preserve selected character; provide compact browsing; label metric meaning |
| Rivals | Dossiers, sorting, stage/character breakdown | Direct deep links; preserve context; sample-aware scouting |
| Practice | Simple completion model and generated targets | Connect evidence, instructions, and outcome; handle failures |
| Oracle | Starter questions, retained failed question, Retry | Immediate sent message, multiline draft, progress/source context |
| Cornerman/overlay | Between-game focus, voice toggle, transparency, live events | Setup readiness and recovery; verify native focus behavior |
| Settings | Section navigation, associated profile labels, redacted stored keys | Global save state, consistent prerequisites, predictable persistence |
| Game Theater | Replay/coaching/notes together; timestamp links and review markers | Restore origin context; recover native failures; distinguish draws |
| Global shell | Consistent branding, labeled navigation, keyboard palette | Group by player task; repair palette ordering; preserve theme behavior |

## Recommended information architecture

There are ten peer destinations under Analyze. The label includes playback discovery, live coaching, practice, and a conversational assistant, so it offers little help deciding where to go.

Keep the existing pages initially, but group them by purpose:

- **Overview:** Dashboard.
- **Review:** Library, Sessions, Characters, Rivals.
- **Improve:** Performance Lab, Trends, Practice.
- **Coaching:** Cornerman, MAGI Oracle.
- **Settings:** setup and preferences.

Use descriptive subtitles for the branded destinations. Over time, make Performance Lab the place where a player chooses what to improve, with direct actions into review and practice. Validate any page consolidation with actual task completion before removing destinations.

## What should not be reported as missing

The current implementation already contains several improvements absent from the historical screenshots: global focus-visible styles; OS reduced-motion support through MotionConfig and CSS; shape/name support for ResultDot; accessible shared Pill selection state; Library pagination and moment search; Trends axes and low-sample messaging; a scrollable sidebar; coaching retry and modal focus restoration; and replay keyboard seeking. Preserve these and complete the remaining gaps rather than replacing them indiscriminately.

## Recommended implementation order

1. **Restore trust:** 01–06, plus 10. Correct feedback, save behavior, refresh propagation, chart values, command selection, and outcome labels.
2. **Make workflows continuous:** 07–08, 11–14, and 21–23. Complete setup, round trips, history access, empty/error states, and native recovery.
3. **Make the interface easier to understand and operate:** 09, 16–20, and 24. Unify sample language, accessibility, reading behavior, and visual hierarchy.
4. **Close the training loop:** 15 and the information architecture proposal. Connect recommendations to evidence and measurable follow-up.

## Live acceptance pass still required

| Scenario | Required checks |
|---|---|
| Fresh install / zero replays | Identity-only setup, connect-code-only setup, canceled folder picker, first import, training without replays |
| Import and watcher | Duplicate files, unreadable files, partial failures, repeated clicks, navigation during import, watcher after leaving Settings |
| Discovery/review | Long tags, more than 100 games, moment search, filters + pagination + Back, rival and character round trips |
| Analytics | 1/4/5/20-game samples, draws, values above 100 damage percent, sparse dates, low-volume stage records |
| AI | Missing configuration, slow/failed response, queued work, streaming while reading older text, new games during an insight |
| Persistence | Delayed/rejected save, theme changes, unsaved navigation, training duplicates, deletion from both entry points |
| Keyboard/assistive tech | Complete core workflow without mouse; dialogs, palette mixed results, accessible names, chart alternatives, focus restoration |
| Native playback/overlay | Missing Dolphin/ISO/replay, failed external launch, resize, focus ownership, voice/mute, overlay dismissal |
| Layout | 1920×1080, 1366×768, supported minimum window, 125/150/200% scaling; Liquid/Indigo/Windows 2000; both densities |
| Visual accessibility | Current composited contrast, long text, focus visibility, reduced motion, timeline marker hit areas, independent pane scrolling |

Suggested success measures: time to first imported replay; time to open a relevant review; round trips retaining context; completion rate of a suggested drill; visibility/recoverability of failures; and keyboard completion of the import → review → note workflow. Establish baselines before setting numerical targets.

