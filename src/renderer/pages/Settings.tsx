import { useEffect, useState, useCallback, useMemo } from "react";
import { Card } from "../components/ui/Card";
import { PROVIDERS, PROVIDER_BY_ID, type ProviderId } from "../../llmProviders";

/** Config as returned by the main process — apiKeys are redacted to booleans */
interface Config {
  targetPlayer: string | null;
  connectCode: string | null;
  replayFolder: string | null;
  dolphinPath: string | null;
  meleeIsoPath: string | null;
  llmModelId: string | null;
  apiKeys: Partial<Record<ProviderId, true>>;
  localEndpoint: string | null;
  theme: string | null;
  colorMode: string | null;
}

interface FetchedModel {
  id: string;
  label: string;
  provider: ProviderId;
}

const KEY_PROVIDERS = PROVIDERS.filter((p) => p.needsKey);

const STATIC_MODELS: FetchedModel[] = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini (default)", provider: "openai" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3", provider: "openrouter" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "anthropic" },
  { id: "local", label: "Local Model (Ollama / LM Studio)", provider: "local" },
];

const DEFAULT_MODEL_ID = "gpt-4o-mini";

/** Heuristic mirror of getModelProvider in src/llm.ts — runs in the renderer
 *  where we don't want to import llm.ts (Node deps). */
function inferProvider(modelId: string): ProviderId {
  const known = STATIC_MODELS.find((m) => m.id === modelId);
  if (known) return known.provider;
  if (modelId.includes("/")) return "openrouter";
  if (modelId.startsWith("gemini")) return "gemini";
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) return "openai";
  return "local";
}

// ── Component ────────────────────────────────────────────────────────

interface SettingsProps {
  onImport: () => void;
}

export function Settings({ onImport }: SettingsProps) {
  const [config, setConfig] = useState<Config>({
    targetPlayer: null,
    connectCode: null,
    replayFolder: null,
    dolphinPath: null,
    meleeIsoPath: null,
    llmModelId: null,
    apiKeys: {},
    localEndpoint: null,
    theme: null,
    colorMode: null,
  });
  // Write-only key inputs — never populated from main process
  const [keyEdits, setKeyEdits] = useState<Partial<Record<ProviderId, string>>>({});
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<{ filePath: string; error: string }[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    lastFile: string;
    importedSoFar: number;
    skippedSoFar: number;
    errorsSoFar: number;
    lastError?: string;
    lastFileStatus: "imported" | "skipped" | "error";
  } | null>(null);
  const [watching, setWatching] = useState(false);
  const [dynamicModels, setDynamicModels] = useState<Record<string, FetchedModel[]> | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [customModelInput, setCustomModelInput] = useState(false);

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

  // Fetch available models from configured providers
  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const result = await window.clippi.fetchAllModels();
      setDynamicModels(result);
    } catch {
      setDynamicModels(null);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Import progress events
  useEffect(() => {
    if (!importing) return;
    const unsub = window.clippi.onImportProgress((progress) => {
      setImportProgress(progress);
      const parts = [`${progress.current}/${progress.total}`];
      if (progress.importedSoFar > 0) parts.push(`${progress.importedSoFar} imported`);
      if (progress.skippedSoFar > 0) parts.push(`${progress.skippedSoFar} skipped`);
      if (progress.errorsSoFar > 0) parts.push(`${progress.errorsSoFar} failed`);
      setImportStatus(parts.join(" \u2014 "));
    });
    return () => {
      unsub();
      setImportProgress(null);
    };
  }, [importing]);

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
  const selectedProvider = useMemo(() => inferProvider(selectedModel), [selectedModel]);
  const selectedProviderInfo = PROVIDER_BY_ID[selectedProvider];
  const selectedProviderHasKey =
    !!config.apiKeys[selectedProvider] || !!keyEdits[selectedProvider]?.trim();
  const selectedModelReady =
    !selectedProviderInfo.needsKey || selectedProviderHasKey || selectedProviderInfo.proxied;

  const handleSave = useCallback(async () => {
    try {
      // Build save payload: non-secret fields + only non-empty key edits.
      // Strip the redacted apiKeys map (booleans) so saveConfig never overwrites
      // real keys with `true`.
      const payload: Record<string, unknown> = { ...config };
      delete payload.apiKeys;
      const updatedKeys: Partial<Record<ProviderId, string>> = {};
      for (const [pid, val] of Object.entries(keyEdits)) {
        if (val && val.trim()) updatedKeys[pid as ProviderId] = val.trim();
      }
      if (Object.keys(updatedKeys).length > 0) payload.apiKeys = updatedKeys;
      await window.clippi.saveConfig(payload);
      setKeyEdits({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setImportStatus(`Error saving: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [config, keyEdits]);

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
    setImportProgress(null);
    setImportErrors([]);
    setShowErrorDetails(false);
    setImportStatus("Scanning for replays...");
    try {
      const result = (await window.clippi.importFolder(
        config.replayFolder,
        config.connectCode || config.targetPlayer,
      )) as {
        imported: number;
        skipped: number;
        errors: number;
        errorDetails: { filePath: string; error: string }[];
        total: number;
        unreadableDirs: number;
      };
      setImportProgress(null);

      const parts: string[] = [];
      parts.push(`${result.imported} imported`);
      if (result.skipped > 0) parts.push(`${result.skipped} duplicates skipped`);
      if (result.errors > 0) parts.push(`${result.errors} failed`);
      parts.push(`${result.total} total files`);

      let status = parts.join(", ") + ".";
      if (result.unreadableDirs > 0) {
        status += ` (${result.unreadableDirs} subdirectories were unreadable)`;
      }
      setImportStatus(status);

      if (result.errorDetails && result.errorDetails.length > 0) {
        setImportErrors(result.errorDetails);
      }

      onImport();
    } catch (err: unknown) {
      setImportProgress(null);
      setImportStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setImporting(false);
  };

  const toggleWatcher = async () => {
    try {
      if (watching) {
        await window.clippi.stopWatcher();
        setWatching(false);
        setImportStatus("Watcher stopped.");
      } else {
        if (!config.replayFolder || !config.targetPlayer) {
          setImportStatus("Set replay folder and player tag first.");
          return;
        }
        await window.clippi.startWatcher(config.replayFolder, config.connectCode ?? config.targetPlayer);
        setWatching(true);
        setImportStatus("Watching for new replays...");
      }
    } catch (err: unknown) {
      setImportStatus(`Watcher error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure? This will delete all imported games, stats, and analyses.")) {
      return;
    }
    try {
      await window.clippi.clearAllGames();
      setImportStatus("All games cleared.");
      onImport();
    } catch (err: unknown) {
      setImportStatus(`Error clearing data: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <Card title="Player">
        <div className="settings-field">
          <label>Display Name / Tag</label>
          <input
            value={config.targetPlayer ?? ""}
            onChange={(e) => setConfig({ ...config, targetPlayer: e.target.value || null })}
            placeholder="YourTag"
          />
        </div>
        <div className="settings-field">
          <label>Connect Code</label>
          <input
            value={config.connectCode ?? ""}
            onChange={(e) => setConfig({ ...config, connectCode: e.target.value || null })}
            placeholder="TAG#123"
          />
        </div>
      </Card>

      <Card title="Replay Folder">
        <div className="settings-field">
          <div className="settings-row">
            <input
              value={config.replayFolder ?? ""}
              onChange={(e) => setConfig({ ...config, replayFolder: e.target.value || null })}
              placeholder="/path/to/slippi/replays"
            />
            <button className="btn" onClick={handleBrowse}>
              Browse
            </button>
          </div>
        </div>
        <div className="settings-row" style={{ gap: 8 }}>
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
            {importing ? "Importing..." : "Import All"}
          </button>
          <button className={`btn ${watching ? "btn-danger" : ""}`} onClick={toggleWatcher}>
            {watching ? "Stop Watching" : "Watch for New Games"}
          </button>
        </div>
        {importing && (
          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "6px 0 0" }}>
            Large replay folders may take a few minutes to process.
          </p>
        )}
        {importProgress && importing && (
          <div style={{ marginTop: 8 }}>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.round((importProgress.current / importProgress.total) * 100)}%`,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: "var(--text-dim)",
                marginTop: 4,
              }}
            >
              <span>{importProgress.lastFile}</span>
              <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
            </div>
          </div>
        )}
        {importStatus && (
          <p className={`import-status${importErrors.length > 0 ? " import-status--warn" : ""}`}>{importStatus}</p>
        )}
        {importErrors.length > 0 && !importing && (
          <div style={{ marginTop: 4 }}>
            <button
              className="btn"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={() => setShowErrorDetails((v) => !v)}
            >
              {showErrorDetails
                ? "Hide errors"
                : `Show ${importErrors.length} error${importErrors.length === 1 ? "" : "s"}`}
            </button>
            {showErrorDetails && (
              <div
                style={{
                  marginTop: 6,
                  maxHeight: 200,
                  overflowY: "auto",
                  fontSize: 11,
                  fontFamily: "var(--font-mono, monospace)",
                  background: "var(--bg-inset, rgba(0,0,0,0.2))",
                  borderRadius: 4,
                  padding: 8,
                }}
              >
                {importErrors.map((e, i) => (
                  <div key={i} style={{ marginBottom: 4, color: "var(--text-dim)" }}>
                    <span style={{ color: "var(--red, #C60707)" }}>{e.filePath.split("/").pop()}</span>
                    {" \u2014 "}
                    {e.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Dolphin Path */}
      <Card title="Slippi Dolphin">
        <div className="settings-field">
          <label>Dolphin Executable Path (optional \u2014 auto-detected if left blank)</label>
          <div className="settings-row">
            <input
              value={config.dolphinPath ?? ""}
              onChange={(e) => setConfig({ ...config, dolphinPath: e.target.value || null })}
              placeholder="Auto-detect"
            />
            <button
              className="btn"
              onClick={async () => {
                const filePath = await window.clippi.openFileDialog("Select Slippi Dolphin", [
                  { name: "All Files", extensions: ["*"] },
                ]);
                if (filePath) setConfig({ ...config, dolphinPath: filePath });
              }}
            >
              Browse
            </button>
          </div>
        </div>
        <div className="settings-field">
          <label>Melee ISO Path (vanilla NTSC 1.02 \u2014 needed for replay playback)</label>
          <div className="settings-row">
            <input
              value={config.meleeIsoPath ?? ""}
              onChange={(e) => setConfig({ ...config, meleeIsoPath: e.target.value || null })}
              placeholder="Falls back to Slippi Launcher ISO if blank"
            />
            <button
              className="btn"
              onClick={async () => {
                const filePath = await window.clippi.openFileDialog("Select Melee ISO", [
                  { name: "ISO Files", extensions: ["iso", "gcm"] },
                ]);
                if (filePath) setConfig({ ...config, meleeIsoPath: filePath });
              }}
            >
              Browse
            </button>
          </div>
        </div>
      </Card>

      {/* AI Model — custom header (title + inline controls), so render header manually */}
      <Card>
        <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>AI Model</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btn"
              style={{ padding: "3px 8px", fontSize: 10 }}
              onClick={() => setCustomModelInput(!customModelInput)}
            >
              {customModelInput ? "Dropdown" : "Custom ID"}
            </button>
            <button
              className="btn"
              style={{ padding: "3px 8px", fontSize: 10 }}
              onClick={fetchModels}
              disabled={modelsLoading}
            >
              {modelsLoading ? "Fetching..." : "Refresh"}
            </button>
          </div>
        </div>
        <div className="settings-field">
          <label>
            Model{" "}
            {modelsLoading && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(loading models...)</span>}
          </label>
          {customModelInput ? (
            <input
              value={selectedModel}
              onChange={(e) => setConfig({ ...config, llmModelId: e.target.value || null })}
              placeholder="e.g. gemini-2.5-flash or anthropic/claude-sonnet-4"
            />
          ) : (
            <select
              className="model-select"
              value={selectedModel}
              onChange={(e) => setConfig({ ...config, llmModelId: e.target.value })}
            >
              {dynamicModels
                ? Object.entries(dynamicModels)
                    .filter(([, models]) => models.length > 0)
                    .map(([provider, models]) => (
                      <optgroup
                        key={provider}
                        label={PROVIDER_BY_ID[provider as ProviderId]?.label ?? provider}
                      >
                        {models.map((m) => (
                          <option key={`${provider}-${m.id}`} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </optgroup>
                    ))
                : STATIC_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
            </select>
          )}
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 11, margin: "4px 0 0", fontFamily: "var(--font-mono)" }}>
          Current: {selectedModel}
        </p>
        <p style={{ fontSize: 11, margin: "6px 0 0" }}>
          Uses your <strong>{selectedProviderInfo.label}</strong> key —{" "}
          {selectedModelReady ? (
            <span style={{ color: "var(--green, #4caf50)" }}>
              {selectedProviderInfo.proxied && !selectedProviderHasKey
                ? "ready (provided by MAGI)"
                : "set"}
            </span>
          ) : (
            <span style={{ color: "var(--orange, #f59e0b)" }}>
              not set — add it below
            </span>
          )}
        </p>
      </Card>

      {/* API Keys */}
      <Card title="API Keys">
        <p style={{ color: "var(--text-dim)", fontSize: 11, margin: "0 0 12px", fontFamily: "var(--font-mono)" }}>
          OpenAI is bundled — MAGI provides a default key for GPT models. Add your own keys to use any other
          provider, or to override the bundled OpenAI key.
        </p>
        {KEY_PROVIDERS.map((p) => {
          const isSet = !!config.apiKeys[p.id];
          const editValue = keyEdits[p.id] ?? "";
          return (
            <div key={p.id} className="settings-field">
              <label>
                {p.label}{" "}
                {isSet && <span style={{ color: "var(--green, #4caf50)", fontSize: 10 }}>(configured)</span>}
                {p.proxied && !isSet && (
                  <span style={{ color: "var(--text-muted)", fontSize: 10 }}>(bundled — optional override)</span>
                )}
                {p.signupUrl && (
                  <a
                    href={p.signupUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ marginLeft: 8, fontSize: 10, color: "var(--text-muted)" }}
                  >
                    get a key →
                  </a>
                )}
              </label>
              <input
                type="password"
                value={editValue}
                onChange={(e) => setKeyEdits({ ...keyEdits, [p.id]: e.target.value })}
                placeholder={isSet ? "Enter new key to replace" : p.keyPlaceholder}
              />
            </div>
          );
        })}
        <div className="settings-field">
          <label>Local Endpoint URL</label>
          <input
            type="text"
            value={config.localEndpoint ?? ""}
            onChange={(e) => setConfig({ ...config, localEndpoint: e.target.value || null })}
            placeholder="http://localhost:1234/v1"
          />
        </div>
      </Card>

      <button className="btn btn-primary" onClick={handleSave}>
        {saved ? "Saved!" : "Save Settings"}
      </button>

      <Card title="Danger Zone" style={{ marginTop: 32 }}>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 12 }}>
          This will delete all imported games, stats, and coaching analyses from the local database. Your replay files
          will not be touched.
        </p>
        <button className="btn btn-danger" onClick={handleClearAll}>
          Clear All Games
        </button>
      </Card>
    </div>
  );
}
