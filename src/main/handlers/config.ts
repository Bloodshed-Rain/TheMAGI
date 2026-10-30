import { getMainWindow } from "../state";
import { app } from "electron";
import { loadConfig, saveConfig, type Config } from "../../config.js";
import { type ProviderId } from "../../llmProviders.js";
import type { SafeHandleFn } from "../ipc.js";

/** Convert apiKeys map to a redacted map: {providerId: true} for set, omit unset. */
function redactApiKeys(apiKeys: Partial<Record<ProviderId, string>>): Partial<Record<ProviderId, true>> {
  const redacted: Partial<Record<ProviderId, true>> = {};
  for (const [k, v] of Object.entries(apiKeys)) {
    if (v) redacted[k as ProviderId] = true;
  }
  return redacted;
}

export function registerConfigHandlers(safeHandle: SafeHandleFn): void {
  safeHandle("app:version", () => app.getVersion());
  // Both reads and writes return only key-presence flags to the renderer.
  const redactConfig = (config: Config): Omit<Config, "apiKeys"> & { apiKeys: Partial<Record<ProviderId, true>> } => {
    return {
      ...config,
      apiKeys: redactApiKeys(config.apiKeys),
    };
  };
  safeHandle("config:load", () => redactConfig(loadConfig()));
  safeHandle("config:save", (_e, config: Partial<Config>) => {
    const saved = saveConfig(config);
    if (Object.keys(config).some((key) => key.startsWith("cornerman"))) {
      try {
        getMainWindow()?.webContents.send("cornerman:settings-changed");
      } catch {
        /* Closing renderer. */
      }
    }
    return redactConfig(saved);
  });
}
