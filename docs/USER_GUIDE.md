# Using MAGI

[Back to MAGI](../README.md) · [Troubleshooting](DEVELOPMENT.md#troubleshooting)

These instructions describe source version **1.10.1**. Compare the version shown in Settings with the release you downloaded.

## Quick Start

1. Download and open MAGI from [GitHub Releases](https://github.com/Bloodshed-Rain/TheMAGI/releases).
2. Follow the **setup wizard**, which opens automatically on a fresh installation. Enter your Slippi connect code (or your player tag for offline games).
3. Choose your Slippi replay folder and select **Import my replays**. Subfolders are included; duplicates are skipped. You can also import later.
4. Optionally configure Slippi **Netplay Dolphin**, **Playback Dolphin**, and your own Melee game image. Detected paths are filled in for you. **Check setup** verifies readable paths; launching a game is the final compatibility check.
5. Open the Dashboard, launch Play Mode on Windows, or configure optional coaching in **Settings → AI**.

Use **Finish later** to save your progress. Reopen the guide with **Settings → Setup wizard**. Existing installations keep their settings and are not forced through onboarding.

For automatic imports, enable **Settings → Replays → Watch for New Games**. Configure your controller in Dolphin before playing. MAGI does not include Slippi Dolphin or a Melee game image.

Replay parsing, statistics, browsing, trends, and manual notes do not require an AI provider.

## Play Mode and Live Coaching

**Play Mode (Windows):** Open **Play Mode** from the sidebar or command palette for a dedicated workspace with Melee in the center and configurable sidebars. Use **Settings → Play Mode settings** to select Slippi **Netplay** Dolphin and your Melee image; this is separate from Playback Dolphin used by Game Theater. Slippi Launcher's usual Windows installation and ISO settings are detected when available.

Use **Customize** to select and reorder panels independently on either side, adjust sidebar widths, choose live statistics, collapse either sidebar, or apply Minimal, Live Coaching, and Practice presets. Layout, practice focus, and notes are saved locally. **Back to MAGI** hides the game while preserving its process; returning to Play Mode restores it. **Stop Game** ends the game, and quitting MAGI closes its hosted Dolphin session.

**Fullscreen:** The game keeps its 4:3 aspect ratio, with information visible in the unused space beside it by default. Choose **Customize → Fullscreen panels → Auto-hide until hovered** for edge reveal. When the side space is too narrow for readable panels, edge reveal is used automatically. **Ctrl+Shift+F11** returns to the regular layout. Sidebar visibility controls live in Customize.

Cornerman runs inside Play Mode; there is no separate popup window. Use **Settings → Play Mode settings → Enable Cornerman in Play Mode** to control its live-session button and automatic tracking. Game paths and the replay output folder are configured in the same Settings section. Voice and optional desktop notifications remain under **Settings → Cornerman**.

Play Mode uses the existing Cornerman service for live tracking and coaching. Configure your player identity in Settings first. Tracking, watching, and the game have independent controls: leaving Play Mode does not stop the live session. Oracle and Cornerman use your configured AI provider; game hosting, replay parsing, layout, notes, and focus do not require AI. Native hosting does not yet support macOS or Linux.

Launching Melee in Play Mode starts live tracking automatically when Cornerman is enabled and your player identity is configured. MAGI reads the hosted Dolphin's `SlippiReplayDir` and replay-saving setting, so an old import folder cannot silently receive the live session. **Start live session** also prepares that folder and enables live stats. The setup strip shows the replay source and AI readiness separately; **Stop live session** stops Cornerman, while the app-wide import watcher stays active.

## What MAGI Measures

MAGI parses Slippi game, frame, input, and interaction data into a local SQLite database. Depending on the replay and available sample size, it tracks:

- game result, stage, duration, stocks, characters, opponent tag, and connect code
- neutral wins and losses, neutral win rate, openings, conversions, conversion rate, damage per opening, and openings per kill
- L-cancel rate, wavedashes, dash-dance frames, platform time, airtime, and ledge time
- recovery attempts, route and landing outcomes, double-jump timing, contested recoveries, edgeguard commitment depth, and edgeguard success
- blocked-hit frame gaps, out-of-shield decisions, punish windows, pressure quality, shield breaks, shield pokes, and powershields
- whiff-punish opportunities, capture rate, reaction delay, and move-by-move whiff exposure
- measured directional influence on deaths, self-destructs, unused recovery resources, throw DI, average death percent, and survival estimates
- ledge, knockdown, shield, and other situational habits, including cornered/pressured splits and punished choices
- character-specific signature events and per-character totals across all 26 fighters
- highlight moments such as high-damage conversions, spikes, zero-to-deaths, comebacks, four-stocks, and character-specific sequences

These metrics are descriptive. MAGI displays sample counts and suppresses some conclusions until enough observations exist.

## AI Coaching and Providers

AI coaching is optional. In **Settings → AI → ChatGPT plan**, select **Continue with ChatGPT**, complete sign-in and plan-usage consent in your browser, and choose an available model. The connection supplies coaching for Cornerman, Oracle, replay reports, and practice generation. It does not grant access to your ChatGPT conversations. Tokens use OS-encrypted main-process storage; account switching, refresh, disconnect, and **Manage usage** are available. Eligibility, model access, and usage limits are determined by OpenAI. [Official sign-in documentation](https://developers.openai.com/siwc/token-sharing-open-source).

MAGI also supports API-key and local-model workflows:

| Provider           | Key required | Notes                                                                                            |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------ |
| ChatGPT plan       | No API key   | Browser sign-in and plan-usage consent; account eligibility, available models, and limits apply. |
| OpenAI             | Yes          | Coaching plus optional streamed Cornerman text-to-speech.                                        |
| Azure OpenAI       | Yes          | Requires an Azure resource endpoint and deployment name; also supports optional Cornerman voice. |
| OpenRouter         | Yes          | Select from supported hosted models or enter a custom model ID.                                  |
| Anthropic          | Yes          | Direct Anthropic model access.                                                                   |
| Google Gemini      | Yes          | Direct Gemini model access.                                                                      |
| Ollama / LM Studio | No           | Uses a local OpenAI-compatible endpoint, defaulting to `http://localhost:1234/v1`.               |
| Pollinations       | No           | Optional no-key hosted provider; availability and usage limits apply.                                          |

Provider-aware model selection and model discovery are available in Settings. Analysis requests are queued, streamed where appropriate, retried on transient failures, and cached locally when possible.

AI suggestions can be wrong. Replay timestamps and bounded clips are available for supported moments, not every AI claim. Named Melee techniques require their specific evidence; an approximate hit sequence does not confirm a technique. See the [technical accuracy policy](melee-accuracy.md).

AI appears in:

- dashboard summaries
- individual game coaching
- character analysis and identity blurbs
- session reports
- rival dossiers
- practice-plan generation
- Cornerman adjustments
- Oracle chat

Example Oracle questions:

- “Why am I losing to Marth this week?”
- “What changed in my last 20 games?”
- “Which opponent habits am I failing to punish?”
- “What should I drill today if I only have 30 minutes?”

## Replay Playback

MAGI launches Slippi Dolphin from the replay path stored during import and can seek to specific frames from stock markers, highlights, or coaching timestamps.

- **Windows:** Game Theater can position the Dolphin playback window inside MAGI and provides playback controls, timeline scrubbing, marker-based clips, and looping.
- **macOS and Linux:** the same review actions open playback externally in Slippi Dolphin; embedded playback is not available.
- **Requirements:** Slippi Dolphin and a legally obtained Melee ISO. MAGI tries common Slippi Launcher locations first, and both paths can be set manually in Settings.

Moving or deleting an imported `.slp` file leaves its statistics in MAGI, but playback for that game will be unavailable until the stored file path is valid again.

## Local Data and Privacy

MAGI does not require an account or a MAGI-hosted backend.

| Data                                | Default location                                               |
| ----------------------------------- | -------------------------------------------------------------- |
| SQLite database                     | `~/.magi-melee/magi.db`                                        |
| App configuration and provider keys | `~/.magi-melee/config.json`                                    |
| ChatGPT connection tokens           | `~/.magi-melee/chatgpt-auth.enc`, encrypted with OS credential storage |
| Development-only environment keys   | `key.env` in the repository root                               |
| Replay files                        | Your existing Slippi folder; MAGI does not copy or delete them |

Replay parsing, statistics, training logs, review notes, and cached analyses remain local. When a hosted AI provider is selected, MAGI sends the assembled coaching prompt and relevant derived game context to that provider. Raw `.slp` files are not uploaded by MAGI. Choose the local Ollama/LM Studio provider if you want the coaching request itself to remain on your machine.

**Do not commit** `key.env`, API keys, `.slp` files, or personal database files. Clearing data from Settings removes imported games, stats, notes, and generated analyses from MAGI's database; it does not delete the original replay files.

## Install a Release

Download the latest package from [GitHub Releases](https://github.com/Bloodshed-Rain/TheMAGI/releases):

- **Windows x64:** NSIS installer or portable `.exe`
- **macOS Intel / Apple Silicon:** `.dmg`
- **Linux x64:** `.AppImage`; local builds can also produce `.deb`

Package and architecture availability depends on the release. Native Play Mode hosting and embedded replay playback are Windows-only. MAGI does not include Slippi Dolphin or a Melee game image.

Packaged builds check GitHub Releases for updates when the app launches. Availability and signing behavior can vary by platform and release.
