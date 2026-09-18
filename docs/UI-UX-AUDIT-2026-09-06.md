# MAGI UI/UX audit — September 6, 2026

## Assessment

**Fix trust and workflow continuity before adding more visual polish.** MAGI has a recognizable identity and valuable replay, analysis, and coaching features. However, several actions report the wrong outcome, lose context, or hide the information players need to act. These are more consequential than styling preferences.

The recommended core journey is **Import → find a relevant game → review evidence → record an adjustment → practice → compare the next sample**. Each screen should make its contribution to that journey clear.

This audit identifies **25 findings: 8 high-priority issues (P1), 16 meaningful usability issues (P2), and 1 polish issue (P3)**. Priorities reflect impact, not implementation difficulty. Small/medium/large effort estimates are relative, not delivery commitments.

## Scope and evidence

- Reviewed the current working tree of MAGI 1.7.0, including existing uncommitted UI changes. Application source was not changed.
- Source coverage includes all 11 main destinations, Game Theater, replay/coaching components, the Cornerman overlay, navigation, shared controls, query handling, themes, and styles. Large files received targeted review; this is not a claim that every control was exercised.
- A local Vite preview rendered the current React code with an isolated, synthetic `window.clippi` bridge. Real replay files, the database, saved settings, AI services, and Dolphin were not connected. Fixture failures are intentionally injected; only the UI's response to them is assessed.
- **Live** below means reproduced in that browser preview through normal controls, with DOM/accessibility inspection or screenshots. **Source** means confirmed in implementation but not reproduced against the native app. **Design assessment** means a recommendation rather than a functional defect.
- Live checks covered Dashboard, Library, Performance Lab, Settings, Trends, Oracle in Windows 2000 mode, the command palette, and a Library → missing-game → Back round trip. The review destination deliberately returned no record; that is a fixture condition, not a discovered missing replay.
- The Library minimum-size check measured a 900 × 600 renderer, with a 660px-wide main pane and no document-level overflow. Internal table truncation remained severe. A 1200 × 800 preview was also inspected. These are renderer dimensions; native window borders, OS scaling, and actual Electron launch geometry were not tested.
- Native playback/overlay behavior, actual import throughput, provider response quality, a screen-reader session, all theme/density combinations, and comprehensive composited contrast remain unverified. Installer and marketing-site UX are outside this desktop-app audit.
- No application build or unit suite was run: the deliverables are this audit and its isolated preview/evidence files. Browser reproduction is recorded below; it does not establish native integration correctness.
- The September 4 audit was used as an inventory. Findings included here were checked against current source or reproduced; earlier screenshot-only concerns are not presented as fresh measurements.

## Fix first

### 01 · P1 · Training saves produce a false failure

**Live + source · Small.** [PerformanceLab.tsx:71](C:/Users/MC/Desktop/MAGI/src/renderer/pages/PerformanceLab.tsx:71)

Submitting a training block with a successful delayed fixture response displays `Cannot read properties of null (reading 'reset')`. The write is awaited before `event.currentTarget.reset()`, but React no longer supplies that event target after asynchronous dispatch. The form remains open and refresh is skipped, inviting a duplicate submission.

**Fix:** Capture the form element before awaiting or use a ref. Separate write failure from reset/refresh failure. **Acceptance:** A delayed successful save creates one entry, clears/closes the form, and refreshes the log; a rejected save retains the draft.

### 02 · P1 · Enter executes a different command from the highlighted result

**Live + source · Small.** [CommandPalette.tsx:378](C:/Users/MC/Desktop/MAGI/src/renderer/components/CommandPalette.tsx:378), [activation:423](C:/Users/MC/Desktop/MAGI/src/renderer/components/CommandPalette.tsx:423)

Reproduction: open search, enter `s`, press Down five times. **Characters** is selected, but Enter opens **Settings**. Search results are ranked, then regrouped for display; activation still indexes the original ranking. Accessibility active-descendant state also uses that original order.

**Fix:** Build one final ordered list for rendering, highlighting, keyboard activation, and accessibility. **Acceptance:** Every highlighted result executes itself, including interleaved navigation, actions, and opponent matches. [Selected-row evidence](C:/Users/MC/Desktop/MAGI/output/playwright/ui-ux-audit-2026-09-06/palette-characters-selected.png).

### 03 · P1 · Settings hides save failures in Replays

**Live + source · Small.** [Settings.tsx:359](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Settings.tsx:359), [status rendering:1014](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Settings.tsx:1014)

With an injected save rejection, clicking Save Settings on Profile shows no error there. Opening Replays reveals the error. Save and data-clear feedback share `importStatus`, which renders only in that section. Data deletion completion/failure is similarly misplaced.

**Fix:** Add a persistent Settings status region beside Save, with pending, saved, and failed states. Keep import progress separate. **Acceptance:** Every section visibly reports its operation's result and preserves edits on failure. [Profile after failed save](C:/Users/MC/Desktop/MAGI/output/playwright/ui-ux-audit-2026-09-06/settings-hidden-error.png).

### 04 · P1 · Imports and deletion leave previously visited screens stale

**Source · Medium.** [main.tsx:14](C:/Users/MC/Desktop/MAGI/src/renderer/main.tsx:14), [Settings.tsx:317](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Settings.tsx:317), [Library.tsx:16](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Library.tsx:16)

Queries remain fresh for five minutes, focus refetching is disabled, and several pages ignore `refreshKey`. No shared query invalidation was found. Watcher event subscriptions are mounted inside Settings; its local `watching` state resets to false when remounted. The sidebar and controls can disagree, and background imports no longer trigger those page-owned refresh callbacks. Palette deletion is neither awaited nor followed by refresh/error handling.

**Fix:** Own watcher lifecycle/status at app level and invalidate affected queries after mutations and import events. Share one awaited clear-data operation. **Acceptance:** Import or clear data and immediately revisit Library, Sessions, Characters, and Trends: every count and row reflects the change. Watcher status remains correct after navigation.

### 05 · P1 · The first import has inadequate progress and recovery

**Source · Medium.** [Dashboard.tsx:79](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Dashboard.tsx:79), [empty branch:141](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Dashboard.tsx:141)

Dashboard import uses `finally` without a visible failure path and discards the result summary. Its empty-state CTA does not consume `importing`, so first-time users do not get the populated screen's disabled/loading treatment. Settings implements a substantially richer import experience for the same operation.

**Fix:** Share import progress, partial-failure counts, duplicate protection, and completion feedback across both entry points. **Acceptance:** The first import visibly starts once, reports imported/skipped/failed files, and offers a useful recovery path.

### 06 · P1 · Death-percent charts flatten all values above 100

**Live + source · Small.** [Trends.tsx:58](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Trends.tsx:58), [sparklineMath.ts](C:/Users/MC/Desktop/MAGI/src/renderer/components/ui/sparklineMath.ts)

The fixture supplied death-percent values from 110 to 167. Selecting Avg Death % produced a 161% rolling headline but a flat line at the chart's 100% ceiling. DOM inspection confirmed every main-chart point had the same y-coordinate. Damage percent is not bounded like a success rate.

**Fix:** Give damage-percent metrics a data-appropriate domain and matching axis labels. **Acceptance:** 110, 140, and 170 occupy different heights; genuine rate charts retain their bounded scales. [Chart evidence](C:/Users/MC/Desktop/MAGI/output/playwright/ui-ux-audit-2026-09-06/death-trend-clipped.png).

### 07 · P1 · Windows 2000 minimize discards unsaved work

**Live + source · Medium.** [LiquidShell.tsx:141](C:/Users/MC/Desktop/MAGI/src/renderer/components/LiquidShell.tsx:141)

Typing an Oracle draft, minimizing, and restoring through the taskbar returned an empty composer. Minimize conditionally removes the entire page subtree; Close invokes the same action. Settings drafts and local filters are exposed to the same loss. Separately, palette/keyboard navigation does not reset the shell's minimized state, so navigation can leave the content hidden.

**Fix:** Keep the page mounted when minimized, move focus to the restore control, and restore the content when navigation requests a destination. **Acceptance:** Drafts and selections survive minimize/restore; keyboard navigation opens a visible page. [Restored Oracle](C:/Users/MC/Desktop/MAGI/output/playwright/ui-ux-audit-2026-09-06/windows-restored-draft-lost.png).

### 08 · P1 · Minimum-width replay tables hide game identity

**Live + source · Medium.** [components.css:346](C:/Users/MC/Desktop/MAGI/src/renderer/styles/components.css:346), [Library.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Library.tsx)

At the supported 900 × 600 renderer size, matchup, opponent, stage, and date shrink to single-letter ellipses while numeric metrics retain space. Ordinary names such as FoxPractice become indistinguishable. The table has fixed layout and cell clipping; the horizontal-scroll wrapper does not ensure useful minimum column widths. Searching adds another column.

**Fix:** Prioritize result, matchup, opponent, date, and Open. Give identity columns minimum widths; move secondary metrics behind optional columns or game detail. **Acceptance:** Players can identify different games at minimum size, including moment-search results, without opening every row. [Measured minimum-size table](C:/Users/MC/Desktop/MAGI/output/playwright/ui-ux-audit-2026-09-06/library-table-900x600.png).

## Complete the workflows

### 09 · P2 · Setup rules differ between entry points

**Source · Medium.** [Settings.tsx:419](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Settings.tsx:419), [Dashboard.tsx:81](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Dashboard.tsx:81), [App.tsx:127](C:/Users/MC/Desktop/MAGI/src/renderer/App.tsx:127)

Dashboard accepts connect code or display tag, but Settings import/watch requires a display tag even when a code exists. Palette “Import Replays” opens Settings' default Profile section rather than import setup. **Fix:** Use one identity rule and deep-link CTAs to the missing setup step. **Acceptance:** A connect-code-only player can import through either entry point, and every setup action opens the relevant section with a clear return path.

### 10 · P2 · Review round trips lose search and selection context

**Live for Library + source elsewhere · Medium.** [Library.tsx:19](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Library.tsx:19), [Characters.tsx:395](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Characters.tsx:395), [Rivals.tsx:131](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Rivals.tsx:131)

Searching FoxPractice, opening a game, and using Back returned a blank Library search. Rival/character selection is also local state that is lost on unmount. Palette opponent results discard the chosen opponent and open generic Sessions. **Fix:** Persist filters, page, selected entity, and scroll in route state or a view store; deep-link opponent results. **Acceptance:** A review round trip returns to the exact discovery context.

### 11 · P2 · Dialog keyboard behavior is incomplete

**Live for palette containment + source · Medium.** [CommandPalette.tsx:449](C:/Users/MC/Desktop/MAGI/src/renderer/components/CommandPalette.tsx:449), [CoachingModal.tsx:103](C:/Users/MC/Desktop/MAGI/src/renderer/components/CoachingModal.tsx:103)

Shift+Tab from palette search left the dialog; DOM inspection confirmed the active element was outside it. Both palette and coaching modal lack complete focus containment/background exclusion. The coaching modal does provide initial focus, Escape, and restoration. Palette Tab focus can diverge from its selected index, and its panel intercepts Enter. **Fix:** Use a shared dialog lifecycle and one coherent combobox/listbox interaction model. **Acceptance:** Keyboard focus stays within a modal, activation follows the announced selection, and closing restores the opener.

### 12 · P2 · Some controls and charts lack usable accessible names/alternatives

**Live accessibility-tree evidence + source · Medium.** [Library.tsx:132](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Library.tsx:132), [GameReviewNotes.tsx:56](C:/Users/MC/Desktop/MAGI/src/renderer/components/GameReviewNotes.tsx:56), [Sparkline.tsx:41](C:/Users/MC/Desktop/MAGI/src/renderer/components/ui/Sparkline.tsx:41)

Library Matchup and Stage appear as unnamed comboboxes; adjacent div text is not an associated label. Oracle and review-note composition rely on placeholders. Sparkline has no named summary, data table, or keyboard point inspection. **Fix:** Add persistent associated labels and text/data alternatives for meaningful charts. **Acceptance:** A player can identify each input and understand important chart values without relying on sight or hover.

### 13 · P2 · Hardcoded colors break theme contrast; Appearance omits selection semantics

**Source + color calculation · Medium.** [rivals.css:170](C:/Users/MC/Desktop/MAGI/src/renderer/styles/rivals.css:170), [themes.ts:179](C:/Users/MC/Desktop/MAGI/src/renderer/themes.ts:179), [TweaksPanel.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/components/TweaksPanel.tsx)

Selected rival filters specify dark `#0a0f0c` text on the theme accent, which becomes navy `#000080` in Windows 2000 mode: the specified pair has **1.21:1 contrast**. This is a calculation of an opaque CSS pair, not a full composited-page audit. Appearance theme/density choices use visual active classes without consistently exposing selection; opening swaps out the focused launcher without a complete focus lifecycle. **Fix:** Introduce foreground-on-accent tokens, audit cross-theme controls, and add selected-state/focus semantics. **Acceptance:** Selections are legible and announced in every supported theme.

### 14 · P2 · Draws are presented as losses

**Live on Dashboard + source · Small.** [Dashboard.tsx:239](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Dashboard.tsx:239), [Rivals.tsx:465](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Rivals.tsx:465), [GameTheater.tsx:36](C:/Users/MC/Desktop/MAGI/src/renderer/pages/GameTheater.tsx:36)

The synthetic draw is named correctly by a recent-form button but rendered with a loss indicator; its Dashboard table exposes an image named “loss.” Rivals counts non-wins as recent losses, and Theater's presentation contract is W/L only. **Fix:** Preserve win/loss/draw everywhere and disclose which outcomes enter win rate. **Acceptance:** One draw stays a draw across every screen and never increases a loss count.

### 15 · P2 · Metrics mix samples and comparison methods without clear labels

**Source · Small–medium.** [Dashboard.tsx:100](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Dashboard.tsx:100), [Trends.tsx:76](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Trends.tsx:76), [Rivals.tsx:433](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Rivals.tsx:433)

Dashboard mixes overall win rate, 20-game technique averages, ten-game form, and five-game coaching. Trends compares halves of smoothed data while its headline shows the latest rolling value; equal game spacing is labeled with dates. Rival best-stage selection has no minimum sample. **Fix:** Name each sample/baseline and mark small-sample recommendations as tentative. **Acceptance:** Players can tell what changed, what it was compared with, and how much evidence supports it.

### 16 · P2 · Empty and failed states block useful recovery

**Live zero-data Lab + source · Medium.** [PerformanceLab.tsx:94](C:/Users/MC/Desktop/MAGI/src/renderer/pages/PerformanceLab.tsx:94), [Sessions.tsx:145](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Sessions.tsx:145), [GameTheater.tsx:182](C:/Users/MC/Desktop/MAGI/src/renderer/pages/GameTheater.tsx:182)

Zero-data Performance Lab says users can log training “below” but returns before any training controls. Dashboard can turn a failed game query into “No replays imported yet.” Theater combines fetch failure with “Game not found.” Several pages suggest retrying without a Retry control; Practice/Oracle history loading lacks full failure handling. **Fix:** Distinguish loading, empty database, empty results, and error states with real actions. **Acceptance:** Training works without replays and temporary service errors do not imply missing/deleted data. [Empty Lab](C:/Users/MC/Desktop/MAGI/output/playwright/ui-ux-audit-2026-09-06/training-empty.png).

### 17 · P2 · Session and training history stops without a way to continue

**Source · Medium.** [Sessions.tsx:77](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Sessions.tsx:77), [PerformanceLab.tsx:282](C:/Users/MC/Desktop/MAGI/src/renderer/pages/PerformanceLab.tsx:282)

Sessions exposes 16 games per day and a non-interactive +N, with a fixed 90-day query. Training fetches 30 entries, shows six, and totals fetched minutes without explaining that scope. **Fix:** Add full-day/full-log views and explicit date ranges; distinguish subset totals from lifetime totals. **Acceptance:** Every stored game/block is reachable from its history view, and totals disclose their range.

### 18 · P2 · Oracle gives weak submission confirmation

**Source · Medium.** [Oracle.tsx:48](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Oracle.tsx:48)

The submitted question appears only after its whole answer returns. Starter prompts disappear into a Thinking state without immediate confirmation of the selected text. The composer is single-line and disabled during generation; there is no partial-response or stop experience. **Fix:** Show the question immediately, provide a labeled multiline composer, and expose queued/generating states. Add cancellation with backend support. **Acceptance:** The pending question remains visible and failure preserves a recoverable draft. Keep the existing Retry behavior.

### 19 · P2 · Dashboard coaching can be stale or blank

**Source · Small–medium.** [Dashboard.tsx:375](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Dashboard.tsx:375)

New game IDs trigger the insight effect, but an existing insight prevents regeneration. One or two games yield an empty card, and failure has no retry action. **Fix:** Key insight state to its sample, expose stale/minimum-sample states, and provide Refresh/Retry with provider/sample context. **Acceptance:** Imported games update or visibly invalidate old advice, and every card state explains the next action.

### 20 · P2 · Practice stops at a checklist

**Source + design assessment · Large for the full loop; small for feedback.** [Practice.tsx:48](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Practice.tsx:48)

Plans omit their stored weakness summary and do not connect the drill to replay evidence or a later outcome comparison. “Due” means incomplete, without scheduling. Completion/deletion failures have no local feedback or duplicate-action protection. **Fix:** First add reliable action status and rename “due” to “remaining.” Then show why the drill was chosen, a replay example, setup instructions, and a measurable follow-up. **Acceptance:** Players can explain the drill's purpose and check whether the targeted measure improved.

### 21 · P2 · Streaming analysis overrides reading position

**Source · Small.** [CoachingModal.tsx:115](C:/Users/MC/Desktop/MAGI/src/renderer/components/CoachingModal.tsx:115), [CoachingPanel.tsx](C:/Users/MC/Desktop/MAGI/src/renderer/components/CoachingPanel.tsx)

Each streaming update scrolls the reader to the bottom, including while they are trying to reread an earlier adjustment. Reduced-motion handling changes animation but not the unwanted movement. **Fix:** Follow only when already near the bottom; otherwise show “New analysis below.” **Acceptance:** Scrolling up during generation preserves position and following can be resumed explicitly.

### 22 · P2 · Playback/live-coaching errors lack direct repair actions

**Source; native verification pending · Medium.** [ReplayEmbed.tsx:109](C:/Users/MC/Desktop/MAGI/src/renderer/components/ReplayEmbed.tsx:109), [Cornerman.tsx:50](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Cornerman.tsx:50)

Failed external Dolphin fallback only logs to the console. Cornerman missing setup reports text without a direct setup action; an initial status error is swallowed and can look inactive. **Fix:** Offer Configure playback, Locate replay, Retry, or Open replay setup as appropriate. Distinguish starting, waiting, generating, and failed states. **Acceptance:** Users can repair missing prerequisites from the affected screen and see an external-launch failure.

### 23 · P2 · Save Settings can revert a density choice

**Source · Small.** [Settings.tsx:340](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Settings.tsx:340), [density setter:379](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Settings.tsx:379)

Density changes update the global UI and persistence but leave the loaded local config unchanged. Generic Save spreads that stale config. It removes theme/appearance fields from the payload but omits density, despite the comment mentioning it. If the loaded config includes density, Save can overwrite the newer choice and the next launch reverts. **Fix:** Exclude independently saved fields or synchronize the draft. **Acceptance:** Choose compact, save unrelated settings, restart: compact remains selected.

### 24 · P2 · Visual hierarchy delays the primary task

**Live Library + design assessment · Medium.** [Library.tsx:108](C:/Users/MC/Desktop/MAGI/src/renderer/pages/Library.tsx:108), [App.tsx:58](C:/Users/MC/Desktop/MAGI/src/renderer/App.tsx:58), [components.css:354](C:/Users/MC/Desktop/MAGI/src/renderer/styles/components.css:354)

At 900 × 600, four large KPI cards and filters consume the initial main viewport; no replay row is visible. The shell lists ten very different activities under Analyze. Small uppercase labels, extensive translucency, and moving character art compete with reading and discovery. These are hierarchy/readability observations, not a blanket contrast verdict.

**Fix:** Lead Library with search/results and compact its summaries. Lead Dashboard with a recommended review or today's focus. Use calmer reading surfaces and larger secondary text. Group navigation by Overview, Review, Improve, and Coaching while keeping existing destinations. **Acceptance:** The initial supported-size view presents the next useful action and actionable content. [Initial Library view](C:/Users/MC/Desktop/MAGI/output/playwright/ui-ux-audit-2026-09-06/library-900x600.png).

### 25 · P3 · Decorative desktop controls promise unsupported behavior

**Source + observed controls · Small–medium.** [LiquidShell.tsx:165](C:/Users/MC/Desktop/MAGI/src/renderer/components/LiquidShell.tsx:165)

Windows 2000 File/Edit/View/Help are decorative, inaccessible spans. Close acts as Minimize. Start exposes menu roles without the expected keyboard/menu lifecycle. **Fix:** Implement the behavior implied by these controls or remove the affordances. **Acceptance:** Visible controls have predictable actions and the theme preserves normal task behavior.

## Screen-by-screen direction

| Surface | Preserve | Change first | Verification in this audit |
|---|---|---|---|
| Dashboard | Recent form, linked games, highlight discovery | Import feedback; correct outcomes/samples; insight freshness | Live populated fixture + source |
| Performance Lab | Baseline comparisons, review rationale, training context | Save defect; zero-data logging; full history | Live form and empty state + source |
| Library | Moment search, filters, pagination, Clear filters | Identity widths; context restoration; summary size | Live 900×600 and larger preview + source |
| Sessions | Calendar grouping, draw support, reports | Full-day access and history range | Source |
| Trends | Rolling average, metric selection, axes, low-sample messaging | Damage scale; comparison explanation; point inspection | Live populated fixture + source |
| Characters | Recognizable roster and contextual analytics | Preserve selection; direct retry; compact browsing option | Source |
| Rivals | Dossiers, sorting, breakdowns | Deep links, sample-aware stage claims, selected-filter contrast | Source and CSS-pair calculation |
| Practice | Concrete targets and simple completion | Reliable mutations; show rationale and outcomes | Source |
| Oracle | Starter prompts, retained failed question, Retry | Immediate sent question; multiline composer; draft preservation | Live Windows draft lifecycle + source |
| Cornerman/overlay | Between-game adjustments, live stats, voice controls | Readiness/recovery; durable event ownership | Source; native focus/audio untested |
| Settings | Section organization, labeled profile fields, redacted keys | Visible save feedback; persistence consistency | Live rejected save + source |
| Game Theater/replay | Evidence, coaching, notes, timeline seeking together | Restore origin; distinct errors; native recovery | Missing-record round trip + source; playback untested |
| Shell and shared controls | Branding, named navigation, global focus baseline | Palette ordering, modal lifecycle, theme behavior | Live palette/theme checks + source |

## What already works well

The source includes global focus-visible styles and reduced-motion support in both CSS and MotionConfig. Shared result indicators support names/shapes, shared filter pills expose selection, Library provides pagination and clearing, and coaching provides retry and some focus restoration. The 900px Library shell fit its viewport without page-level horizontal overflow, and sidebar scrolling kept navigation reachable. Preserve these foundations while repairing the remaining gaps.

Avoid a wholesale visual redesign as the first response. The strongest visual intervention is to allocate more space to game identity, readable advice, and next actions. Keep the character art and metallic identity where they help recognition.

## Implementation order and verification gates

1. **Trust:** Fix 01–08 and 14. Gate with delayed/rejected saves, mixed-category palette navigation, draw fixtures, values above 100, minimum-width tables, and real import/cache reconciliation.
2. **Continuity:** Fix setup, round trips, persistence, empty/error handling, and history access (09–10, 16–17, 19, 22–23). Gate with import → filter → review → Back, navigate during watching, and restart after preference edits.
3. **Usability/accessibility:** Complete dialogs, names, chart alternatives, theme contrast, composition, and streaming reading behavior (11–13, 15, 18, 21, 24–25). Gate with a keyboard-only workflow and a screen-reader pass.
4. **Coaching outcomes:** Connect drills to evidence and later measurements (20). Validate using actual player tasks before consolidating major destinations.

The remaining native acceptance pass should cover real first import, duplicate/unreadable replays, watcher updates away from Settings, large libraries, AI latency/failure, Dolphin/ISO/replay path recovery, overlay focus/resize/audio, both densities, all themes, and 125–200% OS scaling. Contrast checks should sample actual composited text surfaces rather than infer them from translucent color tokens.

Suggested product measures: time to first imported replay; time to find a review target; round trips preserving context; failures with visible recovery; keyboard task completion; and whether completed drills lead to a subsequent measured comparison. Establish a baseline before setting targets.

## Evidence files

Current preview screenshots and the isolated fixture harness are in [the audit evidence directory](C:/Users/MC/Desktop/MAGI/output/playwright/ui-ux-audit-2026-09-06). The harness is for UI verification only: it deliberately omits native integration and uses simplified synthetic statistics, so its counts and service availability are not product findings. The previous September 4 report remains unchanged.
