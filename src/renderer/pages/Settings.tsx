import { useEffect, useState, useMemo, useCallback } from "react";
import { THEMES, THEME_ORDER } from "../themes";

interface Config {
  targetPlayer: string | null;
  connectCode: string | null;
  replayFolder: string | null;
  llmModelId: string | null;
  openrouterApiKey: string | null;
  geminiApiKey: string | null;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  localEndpoint: string | null;
}

interface ModelOption {
  id: string;
  label: string;
  provider: string;
  costPrompt?: string;   // price per token as string from API
  costCompletion?: string;
  contextLength?: number;
}

// ── Static models for direct providers ───────────────────────────────

const DIRECT_MODELS: ModelOption[] = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "anthropic" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai" },
  { id: "local", label: "Local Model (Ollama / LM Studio)", provider: "local" },
];

// Pinned OpenRouter models shown at the top (before the full fetched list)
const PINNED_OR_IDS = new Set([
  "deepseek/deepseek-chat",
  "deepseek/deepseek-reasoner",
  "anthropic/claude-sonnet-4",
  "google/gemini-2.5-flash",
  "openai/gpt-4o",
]);

const DEFAULT_MODEL_ID = "deepseek/deepseek-chat";

// ── OpenRouter model fetcher with cache ──────────────────────────────

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
  architecture?: { modality?: string };
}

let _orCache: ModelOption[] | null = null;

async function fetchOpenRouterModels(): Promise<ModelOption[]> {
  if (_orCache) return _orCache;

  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error(`OpenRouter API ${res.status}`);

  const json = (await res.json()) as { data: OpenRouterModel[] };

  // Filter to text-capable models, sort by name
  const models = json.data
    .filter((m) => {
      const mod = m.architecture?.modality ?? "";
      return mod.includes("text");
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m): ModelOption => ({
      id: m.id,
      label: m.name,
      provider: "openrouter",
      costPrompt: m.pricing.prompt,
      costCompletion: m.pricing.completion,
      contextLength: m.context_length,
    }));

  _orCache = models;
  return models;
}

/** Format per-token price string to $/1M tokens for display */
function formatCost(perToken: string | undefined): string {
  if (!perToken) return "";
  const val = parseFloat(perToken) * 1_000_000;
  if (val === 0) return "free";
  if (val < 0.01) return "<$0.01/M";
  if (val < 1) return `$${val.toFixed(2)}/M`;
  return `$${val.toFixed(1)}/M`;
}

// ── Component ────────────────────────────────────────────────────────

interface SettingsProps {
  onImport: () => void;
  themeId: string;
  onThemeChange: (id: string) => void;
}

function providerFor(modelId: string): string {
  const direct = DIRECT_MODELS.find((m) => m.id === modelId);
  if (direct) return direct.provider;
  if (modelId.includes("/")) return "openrouter";
  if (modelId.startsWith("gemini")) return "gemini";
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) return "openai";
  return "local";
}

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  "openrouter-pinned": "OpenRouter — Recommended",
  "openrouter-all": "OpenRouter — All Models",
  gemini: "Google (Gemini)",
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  local: "Local (Ollama / LM Studio)",
};

export function Settings({ onImport, themeId, onThemeChange }: SettingsProps) {
  const [config, setConfig] = useState<Config>({
    targetPlayer: null,
    connectCode: null,
    replayFolder: null,
    llmModelId: null,
    openrouterApiKey: null,
    geminiApiKey: null,
    anthropicApiKey: null,
    openaiApiKey: null,
    localEndpoint: null,
  });
  const [orModels, setOrModels] = useState<ModelOption[]>([]);
  const [orLoading, setOrLoading] = useState(false);
  const [orError, setOrError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);

  // Load user config
  useEffect(() => {
    async function load() {
      try {
        const c = await window.clippi.loadConfig();
        if (c) setConfig(c);
      } catch (err) {
        console.error("Failed to load config:", err);
      }
    }
    load();
  }, []);

  // Fetch OpenRouter models once on mount
  useEffect(() => {
    setOrLoading(true);
    fetchOpenRouterModels()
      .then((models) => {
        setOrModels(models);
        setOrError(null);
      })
      .catch((err) => {
        console.error("Failed to fetch OpenRouter models:", err);
        setOrError("Could not load models from OpenRouter");
      })
      .finally(() => setOrLoading(false));
  }, []);

  // Watcher events
  useEffect(() => {
    if (!watching) return;
    const unsub = window.clippi.onImported((result: unknown) => {
      const r = result as { skipped: boolean; filePath: string };
      if (!r.skipped) {
        setImportStatus(`Auto-imported: ${r.filePath.split("/").pop()}`);
        onImport();
      }
    });
    return unsub;
  }, [watching, onImport]);

  const selectedModel = config.llmModelId || DEFAULT_MODEL_ID;
  const activeProvider = providerFor(selectedModel);

  // Split OpenRouter models into pinned (recommended) and the rest
  const { pinned, rest } = useMemo(() => {
    const pinned: ModelOption[] = [];
    const rest: ModelOption[] = [];
    for (const m of orModels) {
      if (PINNED_OR_IDS.has(m.id)) pinned.push(m);
      else rest.push(m);
    }
    // Sort pinned in the order defined in PINNED_OR_IDS
    const order = [...PINNED_OR_IDS];
    pinned.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return { pinned, rest };
  }, [orModels]);

  // Selected model's pricing info (if from OpenRouter)
  const selectedModelInfo = useMemo(() => {
    return orModels.find((m) => m.id === selectedModel);
  }, [orModels, selectedModel]);

  const handleSave = useCallback(async () => {
    await window.clippi.saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [config]);

  const handleBrowse = async () => {
    const folder = await window.clippi.openFolder();
    if (folder) {
      setConfig({ ...config, replayFolder: folder });
    }
  };

  const handleImport = async () => {
    if (!config.replayFolder || !config.targetPlayer) {
      setImportStatus("Set replay folder and player tag first.");
      return;
    }
    setImporting(true);
    setImportStatus("Importing replays...");
    try {
      const result = await window.clippi.importFolder(
        config.replayFolder,
        config.connectCode ?? config.targetPlayer,
      );
      setImportStatus(
        `Imported ${result.imported} games, skipped ${result.skipped} duplicates (${result.total} total files).`,
      );
      onImport();
    } catch (err: unknown) {
      setImportStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setImporting(false);
  };

  const toggleWatcher = async () => {
    if (watching) {
      await window.clippi.stopWatcher();
      setWatching(false);
      setImportStatus("Watcher stopped.");
    } else {
      if (!config.replayFolder || !config.targetPlayer) {
        setImportStatus("Set replay folder and player tag first.");
        return;
      }
      await window.clippi.startWatcher(
        config.replayFolder,
        config.connectCode ?? config.targetPlayer,
      );
      setWatching(true);
      setImportStatus("Watching for new replays...");
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure? This will delete all imported games, stats, and analyses.")) {
      return;
    }
    await window.clippi.clearAllGames();
    setImportStatus("All games cleared.");
    onImport();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      {/* Theme picker */}
      <div className="card">
        <div className="card-title">Theme</div>
        <div className="theme-picker">
          {THEME_ORDER.map((id) => {
            const t = THEMES[id]!;
            return (
              <button
                key={id}
                className={`theme-swatch ${themeId === id ? "active" : ""}`}
                onClick={() => onThemeChange(id)}
              >
                <div className="theme-swatch-colors">
                  <div className="theme-swatch-color" style={{ background: t.bg }} />
                  <div className="theme-swatch-color" style={{ background: t.accent }} />
                  <div className="theme-swatch-color" style={{ background: t.secondary }} />
                </div>
                <span className="theme-swatch-name">{t.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Player</div>
        <div className="settings-field">
          <label>Display Name / Tag</label>
          <input
            value={config.targetPlayer ?? ""}
            onChange={(e) => setConfig({ ...config, targetPlayer: e.target.value || null })}
            placeholder="TheLastSlimeto"
          />
        </div>
        <div className="settings-field">
          <label>Connect Code</label>
          <input
            value={config.connectCode ?? ""}
            onChange={(e) => setConfig({ ...config, connectCode: e.target.value || null })}
            placeholder="SLMTO#123"
          />
        </div>
      </div>

      <div className="card">
        <div className="card-title">Replay Folder</div>
        <div className="settings-field">
          <div className="settings-row">
            <input
              value={config.replayFolder ?? ""}
              onChange={(e) => setConfig({ ...config, replayFolder: e.target.value || null })}
              placeholder="/path/to/slippi/replays"
            />
            <button className="btn" onClick={handleBrowse}>Browse</button>
          </div>
        </div>
        <div className="settings-row" style={{ gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? "Importing..." : "Import All"}
          </button>
          <button
            className={`btn ${watching ? "btn-danger" : ""}`}
            onClick={toggleWatcher}
          >
            {watching ? "Stop Watching" : "Watch for New Games"}
          </button>
        </div>
        {importStatus && (
          <p className="import-status">{importStatus}</p>
        )}
      </div>

      {/* LLM Provider Settings */}
      <div className="card">
        <div className="card-title">AI Model</div>
        <div className="settings-field">
          <label>
            Model
            {orLoading && <span style={{ color: "var(--text-dim)", fontSize: 12, marginLeft: 8 }}>Loading models...</span>}
            {orError && <span style={{ color: "var(--danger)", fontSize: 12, marginLeft: 8 }}>{orError}</span>}
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setConfig({ ...config, llmModelId: e.target.value })}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--card-bg)",
              color: "var(--text)",
              fontSize: 14,
            }}
          >
            {/* OpenRouter — Pinned/Recommended */}
            {pinned.length > 0 && (
              <optgroup label={PROVIDER_LABELS["openrouter-pinned"]}>
                {pinned.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({formatCost(m.costPrompt)} in / {formatCost(m.costCompletion)} out)
                  </option>
                ))}
              </optgroup>
            )}

            {/* OpenRouter — All models */}
            {rest.length > 0 && (
              <optgroup label={PROVIDER_LABELS["openrouter-all"]}>
                {rest.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({formatCost(m.costPrompt)} in / {formatCost(m.costCompletion)} out)
                  </option>
                ))}
              </optgroup>
            )}

            {/* Direct providers */}
            {(["gemini", "anthropic", "openai", "local"] as const).map((prov) => {
              const provModels = DIRECT_MODELS.filter((m) => m.provider === prov);
              if (provModels.length === 0) return null;
              return (
                <optgroup key={prov} label={PROVIDER_LABELS[prov]}>
                  {provModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        {/* Pricing + context info for selected OpenRouter model */}
        {selectedModelInfo && (
          <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "4px 0 8px" }}>
            {formatCost(selectedModelInfo.costPrompt)} input / {formatCost(selectedModelInfo.costCompletion)} output
            {selectedModelInfo.contextLength ? ` · ${Math.round(selectedModelInfo.contextLength / 1000)}k context` : ""}
          </p>
        )}

        <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "4px 0 12px" }}>
          {activeProvider === "openrouter" && "OpenRouter routes to any model with one API key. DeepSeek V3 recommended for best cost/quality."}
          {activeProvider === "gemini" && "Direct Google API access. Requires a Gemini API key."}
          {activeProvider === "anthropic" && "Direct Anthropic API access. Best output quality, higher cost."}
          {activeProvider === "openai" && "Direct OpenAI API access."}
          {activeProvider === "local" && "Connects to a local OpenAI-compatible server (Ollama, LM Studio). Free, offline, lower quality."}
        </p>

        {/* Show only the API key field relevant to the selected provider */}
        {activeProvider === "openrouter" && (
          <div className="settings-field">
            <label>OpenRouter API Key</label>
            <input
              type="password"
              value={config.openrouterApiKey ?? ""}
              onChange={(e) => setConfig({ ...config, openrouterApiKey: e.target.value || null })}
              placeholder="sk-or-..."
            />
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>
              Get one at openrouter.ai/keys
            </p>
          </div>
        )}

        {activeProvider === "gemini" && (
          <div className="settings-field">
            <label>Gemini API Key</label>
            <input
              type="password"
              value={config.geminiApiKey ?? ""}
              onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value || null })}
              placeholder="AIza..."
            />
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>
              Get one at aistudio.google.com/apikey
            </p>
          </div>
        )}

        {activeProvider === "anthropic" && (
          <div className="settings-field">
            <label>Anthropic API Key</label>
            <input
              type="password"
              value={config.anthropicApiKey ?? ""}
              onChange={(e) => setConfig({ ...config, anthropicApiKey: e.target.value || null })}
              placeholder="sk-ant-..."
            />
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>
              Get one at console.anthropic.com
            </p>
          </div>
        )}

        {activeProvider === "openai" && (
          <div className="settings-field">
            <label>OpenAI API Key</label>
            <input
              type="password"
              value={config.openaiApiKey ?? ""}
              onChange={(e) => setConfig({ ...config, openaiApiKey: e.target.value || null })}
              placeholder="sk-..."
            />
          </div>
        )}

        {activeProvider === "local" && (
          <div className="settings-field">
            <label>Local Server Endpoint</label>
            <input
              value={config.localEndpoint ?? ""}
              onChange={(e) => setConfig({ ...config, localEndpoint: e.target.value || null })}
              placeholder="http://localhost:1234/v1"
            />
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>
              Default: http://localhost:1234/v1 (LM Studio). Ollama uses port 11434.
            </p>
          </div>
        )}
      </div>

      <button className="btn btn-primary" onClick={handleSave}>
        {saved ? "Saved!" : "Save Settings"}
      </button>

      <div className="card" style={{ marginTop: 32 }}>
        <div className="card-title">Danger Zone</div>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 12 }}>
          This will delete all imported games, stats, and coaching analyses from the local database.
          Your replay files will not be touched.
        </p>
        <button className="btn btn-danger" onClick={handleClearAll}>
          Clear All Games
        </button>
      </div>
    </div>
  );
}
