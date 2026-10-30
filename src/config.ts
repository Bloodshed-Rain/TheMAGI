import fs from "fs";
import path from "path";
import { type ProviderId, PROVIDER_BY_ID } from "./llmProviders";
import type { PlayLayout } from "./playMode";
import { writeConfigFile } from "./configFile";

const DATA_DIR = path.join(require("os").homedir(), ".magi-melee");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

export interface Config {
  setupCompletedAt: string | null;
  setupDeferred: boolean | null;
  setupWizardStep: number | null;
  targetPlayer: string | null;
  connectCode: string | null;
  replayFolder: string | null;
  // LLM
  llmModelId: string | null; // legacy; mirrors active model when activeProvider is set
  activeProvider: ProviderId | null; // which provider is used for LLM calls
  modelByProvider: Partial<Record<ProviderId, string>>; // remembered model selection per provider
  apiKeys: Partial<Record<ProviderId, string>>;
  localEndpoint: string | null;
  azureEndpoint: string | null;
  // Dolphin
  dolphinPath: string | null;
  meleeIsoPath: string | null;
  playDolphinPath: string | null;
  cornermanEnabled: boolean | null;
  playLayout: PlayLayout | null;
  playFocus: string | null;
  playNotes: string | null;
  // UI
  theme: string | null;
  colorMode: string | null;
  density: "comfortable" | "compact" | null;
  liquidCharacterVisibility: number | null;
  liquidCardOpacity: number | null;
  liquidCardBlur: number | null;
  cornermanOverlayTransparency: number | null;
  cornermanOverlayCorner: "top-left" | "top-right" | "bottom-left" | "bottom-right" | null;
  cornermanOverlaySize: { width: number; height: number } | null;
  cornermanPopupCoachingCards: boolean | null;
  cornermanPopupLiveAlerts: "all" | "high" | "off" | null;
  cornermanPopupErrors: boolean | null;
  cornermanDesktopNotifications: boolean | null;
  cornermanPopupAutoHideSeconds: number | null;
  cornermanLiveStatsEnabled: boolean | null;
  cornermanOverlayStatIds: string[] | null;
  cornermanVoiceEnabled: boolean | null;
  cornermanVoiceBackend: "system" | "openai" | "azure" | null;
  cornermanVoiceBetweenGameAdjustments: boolean | null;
  cornermanVoiceLiveAlerts: "all" | "high" | "off" | null;
  cornermanVoiceURI: string | null;
  cornermanVoiceModel: string | null;
  cornermanProviderVoice: string | null;
  cornermanVoiceInstructions: string | null;
  cornermanVoiceRate: number | null;
  cornermanVoiceVolume: number | null;
  cornermanVoiceCooldownSeconds: number | null;
}

const DEFAULTS: Config = {
  setupCompletedAt: null,
  setupDeferred: null,
  setupWizardStep: null,
  targetPlayer: null,
  connectCode: null,
  replayFolder: null,
  llmModelId: null,
  activeProvider: null,
  modelByProvider: {},
  apiKeys: {},
  localEndpoint: null,
  azureEndpoint: null,
  dolphinPath: null,
  meleeIsoPath: null,
  playDolphinPath: null,
  cornermanEnabled: null,
  playLayout: null,
  playFocus: null,
  playNotes: null,
  theme: null,
  colorMode: null,
  density: null,
  liquidCharacterVisibility: null,
  liquidCardOpacity: null,
  liquidCardBlur: null,
  cornermanOverlayTransparency: null,
  cornermanOverlayCorner: null,
  cornermanOverlaySize: null,
  cornermanPopupCoachingCards: null,
  cornermanPopupLiveAlerts: null,
  cornermanPopupErrors: null,
  cornermanDesktopNotifications: null,
  cornermanPopupAutoHideSeconds: null,
  cornermanLiveStatsEnabled: null,
  cornermanOverlayStatIds: null,
  cornermanVoiceEnabled: null,
  cornermanVoiceBackend: null,
  cornermanVoiceBetweenGameAdjustments: null,
  cornermanVoiceLiveAlerts: null,
  cornermanVoiceURI: null,
  cornermanVoiceModel: null,
  cornermanProviderVoice: null,
  cornermanVoiceInstructions: null,
  cornermanVoiceRate: null,
  cornermanVoiceVolume: null,
  cornermanVoiceCooldownSeconds: null,
};

const LEGACY_KEY_FIELDS: Array<{ field: string; provider: ProviderId }> = [
  { field: "openrouterApiKey", provider: "openrouter" },
  { field: "geminiApiKey", provider: "gemini" },
  { field: "anthropicApiKey", provider: "anthropic" },
  { field: "openaiApiKey", provider: "openai" },
];

/** Heuristic mirror of getModelProvider in llm.ts — kept here so config.ts
 *  doesn't pull in the LLM module (avoids circular imports). */
function inferProviderFromModelId(modelId: string): ProviderId {
  if (modelId === "pollinations") return "pollinations";
  if (modelId.includes("/")) return "openrouter";
  if (modelId.startsWith("gemini")) return "gemini";
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) return "openai";
  if (modelId === "local") return "local";
  return "local";
}

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

/** Migrate a flat `llmModelId` into the per-provider structure. */
function migrateActiveProvider(config: Config): { config: Config; migrated: boolean } {
  if (config.activeProvider || !config.llmModelId) {
    return { config, migrated: false };
  }
  const provider = inferProviderFromModelId(config.llmModelId);
  if (!PROVIDER_BY_ID[provider]) return { config, migrated: false };
  const next: Config = {
    ...config,
    activeProvider: provider,
    modelByProvider: {
      ...config.modelByProvider,
      [provider]: config.llmModelId,
    },
  };
  return { config: next, migrated: true };
}

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Record<string, unknown>;
    const { config, migrated: keysMigrated } = migrateLegacyKeys(raw);
    const merged: Config = {
      ...DEFAULTS,
      ...config,
      modelByProvider: {
        ...DEFAULTS.modelByProvider,
        ...((config as Partial<Config>).modelByProvider ?? {}),
      },
    };
    const { config: withProvider, migrated: providerMigrated } = migrateActiveProvider(merged);

    if (keysMigrated || providerMigrated) {
      try {
        writeConfigFile(CONFIG_PATH, withProvider);
      } catch {
        // Best-effort persistence — next load will retry the migration
      }
    }

    return withProvider;
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

    // Same merge semantics for modelByProvider — partial saves preserve other
    // providers' selections.
    if (config.modelByProvider) {
      const next = { ...current.modelByProvider };
      for (const [k, v] of Object.entries(config.modelByProvider)) {
        if (v && typeof v === "string") {
          next[k as ProviderId] = v;
        } else {
          delete next[k as ProviderId];
        }
      }
      merged.modelByProvider = next;
    }

    // Keep llmModelId in sync with the active provider's model so legacy
    // callers continue to work without knowing about the new shape.
    if (merged.activeProvider) {
      merged.llmModelId = merged.modelByProvider[merged.activeProvider] ?? null;
    } else {
      merged.llmModelId = null;
    }

    writeConfigFile(CONFIG_PATH, merged);
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
