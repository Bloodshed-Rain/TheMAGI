import type { PlayLayout } from "../playMode";

export interface PlayPreferences {
  playLayout: PlayLayout;
  playFocus: string;
  playNotes: string;
}
// Shared across route mounts: a quick exit/re-entry must await the outgoing
// draft before reading configuration, rather than restoring an older layout.
let pending: Promise<unknown> = Promise.resolve();
export function savePlayPreferences(draft: PlayPreferences): Promise<unknown> {
  pending = pending.catch(() => {}).then(() => window.clippi.saveConfig(draft));
  return pending;
}
export async function loadPlayPreferences(): Promise<any> {
  await pending.catch(() => {});
  return window.clippi.loadConfig();
}
