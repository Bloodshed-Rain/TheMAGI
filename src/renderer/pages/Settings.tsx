import { useEffect, useState, useCallback } from "react";
import { useGlitchText } from "../hooks";
// Themes are now controlled by the sidebar dark/light toggle

interface Config {
  targetPlayer: string | null;
  connectCode: string | null;
  replayFolder: string | null;
  dolphinPath: string | null;
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
  description: string;
}

const MODELS: ModelOption[] = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Free tier — works out of the box" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3", description: "Best cost/quality ratio (requires OpenRouter key)" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", description: "Reliable and efficient (requires OpenAI key)" },
];

const DEFAULT_MODEL_ID = "gemini-2.5-flash";

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
    llmModelId: null,
    openrouterApiKey: null,
    geminiApiKey: null,
    anthropicApiKey: null,
    openaiApiKey: null,
    localEndpoint: null,
  });
  const [saved, setSaved] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; lastFile: string } | null>(null);
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

  // Import progress events
  useEffect(() => {
    if (!importing) return;
    const unsub = window.clippi.onImportProgress((progress) => {
      setImportProgress(progress);
      setImportStatus(`Importing ${progress.current}/${progress.total}...`);
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

  const title = useGlitchText("SETTINGS", 500);
  const selectedModel = config.llmModelId || DEFAULT_MODEL_ID;

  const handleSave = useCallback(async () => {
    try {
      await window.clippi.saveConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setImportStatus(`Error saving: ${err instanceof Error ? err.message : String(err)}`);
    }
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
    setImportProgress(null);
    setImportStatus("Scanning for replays...");
    try {
      const result = await window.clippi.importFolder(
        config.replayFolder,
        config.connectCode ?? config.targetPlayer,
      );
      setImportProgress(null);
      setImportStatus(
        `Imported ${result.imported} games, skipped ${result.skipped} duplicates (${result.total} total files).`,
      );
      onImport();
    } catch (err: unknown) {
      setImportProgress(null);
      setImportStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
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
        await window.clippi.startWatcher(
          config.replayFolder,
          config.connectCode ?? config.targetPlayer,
        );
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
        <h1>{title}</h1>
      </div>



      <div className="card">
        <div className="card-title">Player</div>
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
        {importProgress && importing && (
          <div style={{ marginTop: 8 }}>
            <div style={{
              width: "100%",
              height: 6,
              background: "var(--bg-secondary, #1a1a2e)",
              borderRadius: 3,
              overflow: "hidden",
            }}>
              <div style={{
                width: `${Math.round((importProgress.current / importProgress.total) * 100)}%`,
                height: "100%",
                background: "var(--accent, #00d4aa)",
                borderRadius: 3,
                transition: "width 0.15s ease-out",
              }} />
            </div>
          </div>
        )}
        {importStatus && (
          <p className="import-status">{importStatus}</p>
        )}
      </div>

      {/* Dolphin Path */}
      <div className="card">
        <div className="card-title">Slippi Dolphin</div>
        <div className="settings-field">
          <label>Dolphin Executable Path (optional — auto-detected if left blank)</label>
          <div className="settings-row">
            <input
              value={config.dolphinPath ?? ""}
              onChange={(e) => setConfig({ ...config, dolphinPath: e.target.value || null })}
              placeholder="Auto-detect"
            />
            <button className="btn" onClick={async () => {
              const filePath = await window.clippi.openFileDialog(
                "Select Slippi Dolphin",
                [{ name: "All Files", extensions: ["*"] }],
              );
              if (filePath) setConfig({ ...config, dolphinPath: filePath });
            }}>Browse</button>
          </div>
        </div>
      </div>

      {/* AI Model */}
      <div className="card">
        <div className="card-title">AI Model</div>
        <div className="settings-field">
          <label>Model</label>
          <select
            className="model-select"
            value={selectedModel}
            onChange={(e) => setConfig({ ...config, llmModelId: e.target.value })}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "4px 0 0" }}>
          {MODELS.find((m) => m.id === selectedModel)?.description ?? ""}
        </p>
      </div>

      {/* API Keys */}
      <div className="card">
        <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          API Keys
          <button
            className="btn"
            style={{ fontSize: 11, padding: "2px 8px" }}
            onClick={() => setShowKeys((v) => !v)}
          >
            {showKeys ? "Hide" : "Show"}
          </button>
        </div>
        <div className="settings-field">
          <label>OpenRouter API Key</label>
          <input
            type={showKeys ? "text" : "password"}
            value={config.openrouterApiKey ?? ""}
            onChange={(e) => setConfig({ ...config, openrouterApiKey: e.target.value || null })}
            placeholder="sk-or-..."
          />
        </div>
        <div className="settings-field">
          <label>Gemini API Key</label>
          <input
            type={showKeys ? "text" : "password"}
            value={config.geminiApiKey ?? ""}
            onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value || null })}
            placeholder="AI..."
          />
        </div>
        <div className="settings-field">
          <label>Anthropic API Key</label>
          <input
            type={showKeys ? "text" : "password"}
            value={config.anthropicApiKey ?? ""}
            onChange={(e) => setConfig({ ...config, anthropicApiKey: e.target.value || null })}
            placeholder="sk-ant-..."
          />
        </div>
        <div className="settings-field">
          <label>OpenAI API Key</label>
          <input
            type={showKeys ? "text" : "password"}
            value={config.openaiApiKey ?? ""}
            onChange={(e) => setConfig({ ...config, openaiApiKey: e.target.value || null })}
            placeholder="sk-..."
          />
        </div>
        <div className="settings-field">
          <label>Local Endpoint URL</label>
          <input
            type="text"
            value={config.localEndpoint ?? ""}
            onChange={(e) => setConfig({ ...config, localEndpoint: e.target.value || null })}
            placeholder="http://localhost:1234/v1"
          />
        </div>
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
