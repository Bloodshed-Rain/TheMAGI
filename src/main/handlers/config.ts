import { loadConfig, saveConfig, type Config } from "../../config.js";
import type { SafeHandleFn } from "../ipc.js";

/** Keys that must never be sent to the renderer process. */
const SECRET_KEYS: (keyof Config)[] = [
  "openrouterApiKey",
  "geminiApiKey",
  "anthropicApiKey",
  "openaiApiKey",
];

export function registerConfigHandlers(safeHandle: SafeHandleFn): void {
  // Returns config with API keys replaced by booleans (true = set, null = not set)
  safeHandle("config:load", () => {
    const config = loadConfig();
    const safe: Record<string, unknown> = { ...config };
    for (const key of SECRET_KEYS) {
      safe[key] = config[key] ? true : null;
    }
    return safe;
  });
  safeHandle("config:save", (_e, config: Partial<Config>) => saveConfig(config));
}
