import fs from "fs";
import path from "path";

const DATA_DIR = path.join(require("os").homedir(), ".coach-clippi");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

export interface Config {
  targetPlayer: string | null;
  connectCode: string | null;
  replayFolder: string | null;
  // LLM provider settings
  llmModelId: string | null;
  openrouterApiKey: string | null;
  geminiApiKey: string | null;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  localEndpoint: string | null;
  // UI
  theme: string | null;
  colorMode: string | null;
}

const DEFAULTS: Config = {
  targetPlayer: null,
  connectCode: null,
  replayFolder: null,
  llmModelId: null,
  openrouterApiKey: null,
  geminiApiKey: null,
  anthropicApiKey: null,
  openaiApiKey: null,
  localEndpoint: null,
  theme: null,
  colorMode: null,
};

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Partial<Config>;
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config: Partial<Config>): Config {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const current = loadConfig();
  const merged = { ...current, ...config };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n");
  return merged;
}

/** Resolve target player: CLI arg > config > null */
export function resolveTarget(cliTarget: string | null): string | null {
  if (cliTarget) return cliTarget;
  const config = loadConfig();
  return config.connectCode ?? config.targetPlayer;
}

/** Resolve replay folder: CLI arg > config > null */
export function resolveReplayFolder(cliFolder: string | null): string | null {
  if (cliFolder) return cliFolder;
  return loadConfig().replayFolder;
}

export { CONFIG_PATH };
