import fs from "fs";
import path from "path";
import { type ProviderId } from "./llmProviders";

const DATA_DIR = path.join(require("os").homedir(), ".magi-melee");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

export interface Config {
  targetPlayer: string | null;
  connectCode: string | null;
  replayFolder: string | null;
  // LLM
  llmModelId: string | null;
  apiKeys: Partial<Record<ProviderId, string>>;
  localEndpoint: string | null;
  // Dolphin
  dolphinPath: string | null;
  meleeIsoPath: string | null;
  // UI
  theme: string | null;
  colorMode: string | null;
  density: "comfortable" | "compact" | null;
}

const DEFAULTS: Config = {
  targetPlayer: null,
  connectCode: null,
  replayFolder: null,
  llmModelId: null,
  apiKeys: {},
  localEndpoint: null,
  dolphinPath: null,
  meleeIsoPath: null,
  theme: null,
  colorMode: null,
  density: null,
};

const LEGACY_KEY_FIELDS: Array<{ field: string; provider: ProviderId }> = [
  { field: "openrouterApiKey", provider: "openrouter" },
  { field: "geminiApiKey", provider: "gemini" },
  { field: "anthropicApiKey", provider: "anthropic" },
  { field: "openaiApiKey", provider: "openai" },
];

/** Fold legacy per-provider key fields into the unified apiKeys map. */
function migrateLegacyKeys(raw: Record<string, unknown>): {
  config: Partial<Config>;
  migrated: boolean;
} {
  const apiKeys: Partial<Record<ProviderId, string>> =
    raw.apiKeys && typeof raw.apiKeys === "object" && !Array.isArray(raw.apiKeys)
      ? { ...(raw.apiKeys as Partial<Record<ProviderId, string>>) }
      : {};

  let migrated = false;
  for (const { field, provider } of LEGACY_KEY_FIELDS) {
    const v = raw[field];
    if (typeof v === "string" && v && !apiKeys[provider]) {
      apiKeys[provider] = v;
      migrated = true;
    }
    if (field in raw) delete raw[field];
  }

  return { config: { ...(raw as Partial<Config>), apiKeys }, migrated };
}

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Record<string, unknown>;
    const { config, migrated } = migrateLegacyKeys(raw);
    const merged: Config = { ...DEFAULTS, ...config };

    if (migrated) {
      try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n");
      } catch {
        // Best-effort persistence — next load will retry the migration
      }
    }

    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config: Partial<Config>): Config {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const current = loadConfig();
    const merged: Config = { ...current, ...config };
    // Deep-merge apiKeys so partial saves (e.g. just one provider's key) don't
    // wipe the others. An explicit empty string clears that provider's key.
    if (config.apiKeys) {
      const next = { ...current.apiKeys };
      for (const [k, v] of Object.entries(config.apiKeys)) {
        if (v && typeof v === "string") {
          next[k as ProviderId] = v;
        } else {
          delete next[k as ProviderId];
        }
      }
      merged.apiKeys = next;
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n");
    return merged;
  } catch (err) {
    throw new Error(`Failed to save config: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Resolve target player: CLI arg > config > null.
 *  Uses || (not ??) so empty strings fall through correctly. */
export function resolveTarget(cliTarget: string | null): string | null {
  if (cliTarget) return cliTarget;
  const config = loadConfig();
  return config.connectCode || config.targetPlayer || null;
}

/** Resolve replay folder: CLI arg > config > null */
export function resolveReplayFolder(cliFolder: string | null): string | null {
  if (cliFolder) return cliFolder;
  return loadConfig().replayFolder;
}

export { CONFIG_PATH };
