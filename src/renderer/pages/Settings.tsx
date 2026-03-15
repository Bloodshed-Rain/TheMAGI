import { useEffect, useState } from "react";
import { THEMES, THEME_ORDER } from "../themes";

interface Config {
  targetPlayer: string | null;
  connectCode: string | null;
  replayFolder: string | null;
  geminiApiKey: string | null;
}

interface SettingsProps {
  onImport: () => void;
  themeId: string;
  onThemeChange: (id: string) => void;
}

export function Settings({ onImport, themeId, onThemeChange }: SettingsProps) {
  const [config, setConfig] = useState<Config>({
    targetPlayer: null,
    connectCode: null,
    replayFolder: null,
    geminiApiKey: null,
  });
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);

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

  const handleSave = async () => {
    await window.clippi.saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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
    onImport(); // trigger refresh on other pages
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
