# Release notes

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
