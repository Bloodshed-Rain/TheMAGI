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
  // Returns config with apiKeys map redacted to booleans.
  safeHandle("config:load", () => {
    const config = loadConfig();
    const safe: Omit<Config, "apiKeys"> & { apiKeys: Partial<Record<ProviderId, true>> } = {
      ...config,
      apiKeys: redactApiKeys(config.apiKeys),
    };
    return safe;
  });
  safeHandle("config:save", (_e, config: Partial<Config>) => saveConfig(config));
}
