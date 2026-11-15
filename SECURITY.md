# Security policy

## Supported versions

Security fixes go into the latest [release](https://github.com/Bloodshed-Rain/TheMAGI/releases/latest). Update to the newest version before reporting a problem.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private reporting instead: open the repository's **Security** tab and choose **Report a vulnerability**. Include the MAGI version shown in Settings, your operating system, the steps to reproduce, and what an attacker could do with it.

Do not include API keys, personal databases, game images, or replay files you do not have the right to share.

## What MAGI keeps on your computer

- Replay files stay where you keep them. MAGI saves stats, notes, and reports in `~/.magi-melee/`.
- API keys are held by the main process. The interface never receives them.
- When you use an online AI or voice service, MAGI sends it the relevant game information, your question, or the text to read. It does not upload the original replay files.

## Scope

In scope: the desktop app, its IPC bridge, how it stores keys and data, and the download and install process. Out of scope: Slippi Dolphin, Melee, and the AI or voice services you connect, which have their own policies.
