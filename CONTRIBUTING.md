# Contributing to MAGI

Start with the [development guide](docs/DEVELOPMENT.md) for setup, commands, architecture, and troubleshooting. [Issues](https://github.com/Bloodshed-Rain/TheMAGI/issues/new/choose) and focused pull requests are welcome.

## Before submitting

- Describe the problem and resulting behavior. Include screenshots or a short recording for visible changes.
- Add positive and negative regression coverage for parsing, importer, database, configuration, and pipeline behavior.
- Follow the mandatory [Melee accuracy policy](AGENTS.md) and [current evidence notes](docs/melee-accuracy.md). Describe an observed sequence when evidence does not establish every condition for a named technique.
- Keep API keys, local config, personal databases, game images, and user replay data out of commits and attachments. Only the existing small replay fixtures belong in the repository.
- Run `npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check`, `npm run verify:docs`, and `npm run verify:release`.

For bug reports, include the MAGI version shown in Settings, operating system, steps, expected result, actual result, and whether Dolphin playback or Play Mode is involved. Remove private information from logs and screenshots. Do not include credentials or a Melee game image.

## Releases

Use a new semantic version for meaningful app changes. Keep package versions, the README version, and the current changelog entry aligned. Verify Settings, packaged metadata, and artifact filenames before distributing. Local builds do not authorize publishing or tagging. See the [release process](docs/DEVELOPMENT.md#release-process).
