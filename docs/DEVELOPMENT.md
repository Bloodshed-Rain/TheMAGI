# Development and troubleshooting

[Back to MAGI](../README.md) · [User guide](USER_GUIDE.md)

## Development Setup

### Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`
- npm
- Git
- A platform compiler toolchain if a native dependency does not have a compatible prebuilt binary

### Clone and run

```bash
git clone https://github.com/Bloodshed-Rain/TheMAGI.git
cd TheMAGI
npm ci
npx electron-rebuild
npm run dev
```

`electron-rebuild` compiles native dependencies such as `better-sqlite3` and `koffi` for Electron's ABI. Run it again after changing Electron versions or when startup reports a native module version mismatch.

### Commands

| Command                  | Purpose                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `npm run dev`            | Compile main/preload code, start Vite, and launch Electron.     |
| `npm run typecheck`      | Type-check both the Electron and renderer TypeScript projects.  |
| `npm test`               | Run the complete Vitest suite once.                             |
| `npm run test:watch`     | Run Vitest in watch mode.                                       |
| `npm run lint`           | Check `src/` with ESLint.                                       |
| `npm run lint:fix`       | Apply safe ESLint fixes.                                        |
| `npm run format:check`   | Check TypeScript/TSX formatting with Prettier.                  |
| `npm run format`         | Format TypeScript/TSX source files.                             |
| `npm run build:renderer` | Create a production renderer bundle without packaging Electron. |
| `npm run build`          | Type-check, build, and package for the current platform.        |
| `npm run build:win`      | Build Windows installer and portable packages.                  |
| `npm run build:mac`      | Build macOS Intel and Apple Silicon DMGs.                       |
| `npm run build:linux`    | Build Linux AppImage and Debian packages.                       |

CI runs type checking, tests, lint, and formatting on pull requests and pushes to `main`. Version tags (`v*`) build release artifacts for Windows, macOS, and Linux.

## Historical Replay Backfill

New imports automatically populate MAGI's detailed event tables. Games imported before those tables were introduced need a one-time backfill for the full Character analytics suite, including measured DI, recovery routes, shield decisions, habit instances, and whiff-punish data.

Close MAGI before running the backfill. The command is safe to rerun: each game's event rows are replaced transactionally, and the replay hash is checked before data is attached to an existing database row.

**PowerShell:**

```powershell
$env:ELECTRON_RUN_AS_NODE = "1"
npx electron --require tsx/cjs src/backfill-cli.ts
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

**macOS / Linux:**

```bash
ELECTRON_RUN_AS_NODE=1 npx electron --require tsx/cjs src/backfill-cli.ts
```

Append either option to the platform-specific command above before clearing `ELECTRON_RUN_AS_NODE`:

```bash
# Process only the first 25 candidates as a smoke test
npx electron --require tsx/cjs src/backfill-cli.ts --limit 25

# Rebuild event rows for every imported game
npx electron --require tsx/cjs src/backfill-cli.ts --force
```

Keep `ELECTRON_RUN_AS_NODE=1` set when using either option. Missing replay files and files whose current hash no longer matches the imported replay are reported and skipped rather than misattributed.

## CLI Workflows

The desktop app is the primary interface. These source-only utilities are useful for development and diagnostics:

```bash
# Parse one or more replays without an AI call
npx tsx src/pipeline-cli.ts path/to/game.slp --target "TAG#123"

# Print structured JSON
npx tsx src/pipeline-cli.ts path/to/game.slp --target "TAG#123" --json

# Detect sets in a directory, then analyze one set
npx tsx src/pipeline-cli.ts --dir path/to/replays --sets
npx tsx src/pipeline-cli.ts --dir path/to/replays --set 3 --target "TAG#123"

# Save source-development configuration
npx tsx src/setup.ts --tag YourTag --code "TAG#123" --folder path/to/replays

# Watch a replay folder outside the desktop UI
npx tsx src/watcher.ts path/to/replays --target "TAG#123"
```

Database-backed Node CLIs can report `NODE_MODULE_VERSION` after native packages have been rebuilt for Electron. The backfill command above deliberately runs through Electron's Node runtime to avoid that mismatch.

The repository also includes a standalone read-only MCP server in `src/mcp-server.ts` for advanced local integrations. It is not started by the desktop app.

## Architecture

```text
.slp replay files
  → parallel Slippi parsing
  → game summaries + frame-derived events + highlights
  → local SQLite database in ~/.magi-melee
  → typed Electron IPC/preload bridge
  → React query layer and desktop UI
  → optional queued LLM coaching + local cache
```

MAGI uses three application layers:

1. **Electron main process** owns filesystem access, SQLite, replay parsing, AI requests, file watching, Dolphin launch/embedding, updates, and IPC handlers.
2. **Preload bridge** exposes a typed, deliberately limited `window.clippi` API to the renderer.
3. **React renderer** provides the Vite-built interface, routes, local UI state, and query-backed views.

### Project layout

| Path                                 | Responsibility                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/`                          | Electron startup, IPC registration, handlers, updater, dialogs, native Windows game and replay embedding, and the application window.                |
| `src/preload/`                       | Typed bridge between Electron and React.                                                                                                    |
| `src/renderer/`                      | React pages, components, hooks, stores, themes, assets, and styles.                                                                         |
| `src/pipeline/`                      | Slippi parsing, frame/event extraction, derived insights, character data, signatures, highlights, and prompt assembly.                      |
| `src/db.ts`                          | SQLite schema, migrations, transactions, inserts, and application queries.                                                                  |
| `src/importer.ts`                    | Replay hashing, deduplication, parallel parsing, persistence, sessions, and progress reporting.                                             |
| `src/llm.ts` / `src/llmProviders.ts` | Provider abstraction, streaming, response validation, and provider metadata.                                                                |
| `src/backfill.ts`                    | Transactional historical event-data backfill engine.                                                                                        |
| `tests/`                             | Vitest coverage for parsing, event extraction, database behavior, imports, LLM handling, replay review, settings, UI utilities, and stores. |
| `site/`                              | Static project website.                                                                                                                     |
| `screenshots/`                       | README and marketing screenshots.                                                                                                           |

## Troubleshooting

### Reopen setup or recover from a failed step

Choose **Settings → Setup wizard**. Progress is saved when you continue or finish later. Canceling a file picker preserves your current selection; failed imports and checks leave the guide open so you can fix the location and retry. AI is optional and never blocks setup.

An empty folder can be readable without containing games. If import finds no `.slp` files, play a game with replay saving enabled, then import again. If files are skipped because the player cannot be found, check your connect code before importing more games.

### Play Mode cannot launch or live stats stay empty

Hosted Play Mode currently requires Windows. Choose the **Netplay** Dolphin executable for live play; Game Theater uses a separate **Playback** executable. Both need a readable Melee game image. The wizard checks file access, not game-image integrity, controller configuration, network access, or provider availability.

Enable replay saving in Dolphin, and use its replay output folder for live tracking. Set your player identity before launching a live session. AI coaching additionally needs a configured, available provider; live parsing and stats do not.

### MAGI does not recognize my player

Set your connect code in **Settings → Profile** and import again. Tags can change or collide; a connect code is generally the strongest identifier. Existing incorrectly attributed games may need to be cleared and reimported.

### Import reports skipped games

MAGI hashes every replay and skips duplicates, including duplicate files discovered within the same import batch. Skips are expected when re-importing a folder.

### Detailed Character cards are missing or empty

Some cards require minimum sample sizes. If the games were imported by an older MAGI version, run the [historical replay backfill](#historical-replay-backfill).

### Replay playback cannot find Dolphin or the ISO

Set both paths under **Settings → Playback**. MAGI can auto-detect common Slippi Launcher locations, but custom installations may need explicit paths. Embedded playback is Windows-only.

### Cornerman is not receiving games

Confirm player identity and enable Cornerman in Settings → Play Mode settings. Launching Melee starts tracking automatically when configured; Start live session also prepares the hosted Dolphin replay folder. The Cornerman page offers Corner Sessions. The folder must be writable by Slippi and readable by MAGI. Live voice is opt-in and must be enabled separately in Settings.

### A hosted AI provider fails

Confirm that the selected provider has a valid key, endpoint where required, and model or Azure deployment name. Local providers must expose an OpenAI-compatible endpoint. Core replay analytics remain available while AI is unavailable.

### Development startup reports `NODE_MODULE_VERSION`

Rebuild native modules for the installed Electron version:

```bash
npx electron-rebuild
```

Then rerun `npm run dev`.

## Current Boundaries

- Native Play Mode hosting and embedded Game Theater playback are Windows-only; macOS and Linux use external Slippi Dolphin playback.
- Detailed event cards are sample-gated and cannot recover data from replay files that were moved, replaced, or deleted before a historical backfill.
- Hosted-provider availability, pricing, model IDs, quotas, and output quality are controlled by those providers.
- Pollinations is an optional no-key hosted provider; availability and usage limits depend on the provider.
- MAGI is a local desktop application, not a hosted replay-storage service.

## Contributing

Issues and pull requests are welcome. Keep changes focused, add regression coverage for parsing/database/import behavior, and include screenshots or a short recording for visible UI changes.

Before opening a pull request, run:

```bash
npm run typecheck
npm test
npm run lint
npm run format:check
npm run verify:docs
npm run verify:release
```

## Release Process

1. Select the semantic version for the app changes. Update `package.json`, both root/package version entries in `package-lock.json`, the README source version, the user-guide version, the website feature-tour version, and `CHANGELOG.md` together. Label unpublished work as unreleased.
2. Run `npm run verify:docs`, `npm run verify:release`, `npm run typecheck`, `npm test`, `npm run lint`, and `npm run format:check`. The documentation checks validate local links and source version consistency; they do not certify packaged artifacts or live AI providers.
3. Build locally with the platform-specific build command. These commands use `--publish never`. Confirm the packaged version, version shown in Settings, executable metadata, and installer/portable filenames all agree. Test a fresh setup and an existing-data upgrade, plus native game/replay hosting on Windows and external playback on other supported platforms.
4. Review the README, website feature tour, screenshots, and platform requirements against the build users will receive. A download of an older published version must not be described as containing newer source features. Verify that release assets include the promised operating systems and architectures.
5. Publishing a release/tag and deploying the website are separate actions from committing source. Publish only when authorized. Once a release is published, verify downloads and update metadata, then deploy the matching website content using the existing Cloudflare configuration in `site/wrangler.jsonc`.

## License

[MIT](../LICENSE) © 2026 Bloodshed-Rain
