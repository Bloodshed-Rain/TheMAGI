import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Database,
  FolderOpen,
  Gamepad2,
  Palette,
  Save,
  SlidersHorizontal,
  Trash2,
  UserCircle,
  Volume2,
  Zap,
} from "lucide-react";
import { Card } from "../components/ui/Card";
import { ChatGPTConnection } from "../components/ChatGPTConnection";
import { LiquidAppearanceControls } from "../components/LiquidAppearanceControls";
import { PROVIDERS, PROVIDER_BY_ID, type ProviderId } from "../../llmProviders";
import { useGlobalStore, type Density } from "../stores/useGlobalStore";
import { THEMES, THEME_ORDER, applyTheme, getResolvedTheme, type ColorMode } from "../themes";
import { resolveCornermanPopupSettings, type CornermanPopupLiveAlertMode } from "../../cornermanPopupSettings";
import { resolveCornermanLiveStatsSettings } from "../../cornermanLiveStatsSettings";
import {
  normalizeCornermanVoiceCooldownSeconds,
  resolveCornermanVoiceSettings,
  type CornermanVoiceLiveAlertMode,
} from "../../cornermanVoiceSettings";
import { PROVIDER_VOICE_OPTIONS, type CornermanVoiceBackend } from "../../providerVoice";
import { createHybridCornermanSpeechAdapter, type CornermanSpeechAdapter } from "../utils/cornermanSpeech";

/** Config as returned by the main process — apiKeys are redacted to booleans */
interface Config {
  targetPlayer: string | null;
  connectCode: string | null;
  replayFolder: string | null;
  dolphinPath: string | null;
  playDolphinPath: string | null;
  cornermanEnabled: boolean | null;
  meleeIsoPath: string | null;
  activeProvider: ProviderId | null;
  modelByProvider: Partial<Record<ProviderId, string>>;
  apiKeys: Partial<Record<ProviderId, true>>;
  localEndpoint: string | null;
  azureEndpoint: string | null;
  theme: string | null;
  colorMode: string | null;
  liquidCharacterVisibility: number | null;
  liquidCardOpacity: number | null;
  liquidCardBlur: number | null;
  cornermanOverlayTransparency: number | null;
  cornermanOverlayCorner: "top-left" | "top-right" | "bottom-left" | "bottom-right" | null;
  cornermanOverlaySize: { width: number; height: number } | null;
  cornermanPopupCoachingCards: boolean | null;
  cornermanPopupLiveAlerts: CornermanPopupLiveAlertMode | null;
  cornermanPopupErrors: boolean | null;
  cornermanDesktopNotifications: boolean | null;
  cornermanPopupAutoHideSeconds: number | null;
  cornermanLiveStatsEnabled: boolean | null;
  cornermanOverlayStatIds: string[] | null;
  cornermanVoiceEnabled: boolean | null;
  cornermanVoiceBackend: CornermanVoiceBackend | null;
  cornermanVoiceBetweenGameAdjustments: boolean | null;
  cornermanVoiceLiveAlerts: CornermanVoiceLiveAlertMode | null;
  cornermanVoiceURI: string | null;
  cornermanVoiceModel: string | null;
  cornermanProviderVoice: string | null;
  cornermanVoiceInstructions: string | null;
  cornermanVoiceRate: number | null;
  cornermanVoiceVolume: number | null;
  cornermanVoiceCooldownSeconds: number | null;
}

interface FetchedModel {
  id: string;
  label: string;
  provider: ProviderId;
}

type SettingsSectionId = "play" | "profile" | "interface" | "cornerman" | "replays" | "playback" | "ai" | "data";

const SETTINGS_SECTIONS: {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: typeof UserCircle;
}[] = [
  { id: "profile", label: "Profile", description: "Tag and connect code", icon: UserCircle },
  { id: "interface", label: "Interface", description: "Theme and density", icon: Palette },
  { id: "play", label: "Play Mode settings", description: "Game paths & Cornerman", icon: Gamepad2 },
  { id: "cornerman", label: "Cornerman", description: "Coaching, alerts, voice", icon: Bell },
  { id: "replays", label: "Replays", description: "Folder and imports", icon: FolderOpen },
  { id: "playback", label: "Playback", description: "Dolphin and ISO", icon: Gamepad2 },
  { id: "ai", label: "AI", description: "Provider, keys, models", icon: Zap },
  { id: "data", label: "Data", description: "Local database", icon: Database },
];

const SETTINGS_SECTION_COPY: Record<SettingsSectionId, { eyebrow: string; title: string; description: string }> = {
  play: {
    eyebrow: "Play",
    title: "Play Mode settings",
    description: "Slippi Netplay, your game image, and integrated Cornerman coaching.",
  },
  profile: {
    eyebrow: "Account",
    title: "Player Profile",
    description: "The identity MAGI uses to recognize your games and Slippi profile.",
  },
  interface: {
    eyebrow: "Display",
    title: "Interface",
    description: "Theme and layout density for the main app.",
  },
  cornerman: {
    eyebrow: "In-Game",
    title: "Cornerman",
    description: "Coaching and live alerts live inside Play Mode. Configure notifications and voice here.",
  },
  replays: {
    eyebrow: "Import",
    title: "Replay Library",
    description: "Choose the replay folder, import old games, or watch for new ones.",
  },
  playback: {
    eyebrow: "Playback",
    title: "Slippi Dolphin",
    description: "Paths used when MAGI opens replay playback.",
  },
  ai: {
    eyebrow: "Models",
    title: "AI Provider",
    description: "Pick which model powers coaching, sessions, oracle, and practice plans.",
  },
  data: {
    eyebrow: "Storage",
    title: "Local Data",
    description: "Database maintenance for imported games and generated analysis.",
  },
};

/** Per-provider fallback when the dynamic fetch hasn't run yet (or no key set). */
const FALLBACK_MODELS: Record<ProviderId, FetchedModel[]> = {
  chatgpt: [],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
    { id: "gpt-4o", label: "GPT-4o", provider: "openai" },
  ],
  azure: [],
  openrouter: [
    { id: "deepseek/deepseek-chat", label: "DeepSeek V3", provider: "openrouter" },
    { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4 (via OpenRouter)", provider: "openrouter" },
  ],
  anthropic: [{ id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "anthropic" }],
  gemini: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini" },
  ],
  local: [{ id: "local", label: "Local Model", provider: "local" }],
  pollinations: [{ id: "pollinations", label: "Pollinations Free AI", provider: "pollinations" }],
};

// ── Component ────────────────────────────────────────────────────────

interface SettingsProps {
  onImport: () => void;
}

export function Settings({ onImport }: SettingsProps) {
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    let active = true;
    void window.clippi
      .getAppVersion()
      .then((version) => {
        if (active) setAppVersion(version);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [config, setConfig] = useState<Config>({
    targetPlayer: null,
    connectCode: null,
    replayFolder: null,
    dolphinPath: null,
    playDolphinPath: null,
    cornermanEnabled: null,
    meleeIsoPath: null,
    activeProvider: null,
    modelByProvider: {},
    apiKeys: {},
    localEndpoint: null,
    azureEndpoint: null,
    theme: null,
    colorMode: null,
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
  const [customModelInputs, setCustomModelInputs] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicePreviewStatus, setVoicePreviewStatus] = useState<string | null>(null);
  const voicePreviewAdapter = useRef<CornermanSpeechAdapter | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() =>
    new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("section") === "play" ? "play" : "profile",
  );
  const setWatcherActive = useGlobalStore((state) => state.setWatcherActive);
  const colorMode = useGlobalStore((state) => state.colorMode);
  const setColorMode = useGlobalStore((state) => state.setColorMode);
  const density = useGlobalStore((state) => state.density);
  const setDensity = useGlobalStore((state) => state.setDensity);
  const popupSettings = resolveCornermanPopupSettings(config);
  const liveStatsSettings = resolveCornermanLiveStatsSettings(config);
  const voiceSettings = resolveCornermanVoiceSettings(config);

  const activeSectionCopy = SETTINGS_SECTION_COPY[activeSection];

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

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const refreshVoices = () => setSpeechVoices(window.speechSynthesis.getVoices());
    refreshVoices();
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
  }, []);

  useEffect(
    () => () => {
      voicePreviewAdapter.current?.dispose?.();
      voicePreviewAdapter.current = null;
    },
    [],
  );

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
      setImportStatus(parts.join(" — "));
    });
    return () => {
      unsub();
      setImportProgress(null);
    };
  }, [importing]);

  // Watcher events
  useEffect(() => {
    if (!watching) return;
    const unsubImported = window.clippi.onImported((result: unknown) => {
      const r = result as { skipped: boolean; filePath: string };
      if (!r.skipped) {
        setImportStatus(`Auto-imported: ${r.filePath.split("/").pop()}`);
        onImport();
      }
    });
    const unsubWatcherError = window.clippi.onWatcherError((message) => {
      setWatching(false);
      setWatcherActive(false);
      setImportStatus(`Watcher error: ${message}`);
    });
    return () => {
      unsubImported();
      unsubWatcherError();
    };
  }, [watching, onImport, setWatcherActive]);

  const handleSave = useCallback(async () => {
    try {
      // Build save payload: non-secret fields + only non-empty key edits.
      // Strip the redacted apiKeys map (booleans) so saveConfig never overwrites
      // real keys with `true`.
      const payload: Record<string, unknown> = { ...config };
      delete payload.apiKeys;
      // Don't clobber theme/density chosen via Tweaks/Appearance with the
      // stale values captured at mount — those persist through their own setters.
      delete payload.theme;
      delete payload.colorMode;
      delete payload.liquidCharacterVisibility;
      delete payload.liquidCardOpacity;
      delete payload.liquidCardBlur;
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

  const setActiveProvider = (p: ProviderId) => setConfig({ ...config, activeProvider: p });
  const setProviderModel = (p: ProviderId, modelId: string | null) =>
    setConfig({
      ...config,
      modelByProvider: {
        ...config.modelByProvider,
        ...(modelId ? { [p]: modelId } : { [p]: undefined }),
      },
    });

  const onPickTheme = (id: ColorMode) => {
    setColorMode(id);
    applyTheme(getResolvedTheme(id, id));
    window.clippi.saveConfig({ colorMode: id }).catch(() => {});
  };

  const onPickDensity = (d: Density) => {
    setDensity(d);
    window.clippi.saveConfig({ density: d }).catch(() => {});
  };

  const previewCornermanVoice = () => {
    voicePreviewAdapter.current?.dispose?.();
    let previewFailed = false;
    const adapter = createHybridCornermanSpeechAdapter({
      purpose: "preview",
      onError: (message) => {
        previewFailed = true;
        setVoicePreviewStatus(message);
      },
    });
    voicePreviewAdapter.current = adapter;
    if (!adapter) {
      setVoicePreviewStatus("Voice playback is unavailable.");
      return;
    }
    setVoicePreviewStatus(voiceSettings.backend === "system" ? "Playing preview…" : "Generating preview…");
    adapter.speak(
      "Cornerman is ready. Stay patient, control center, and look for the same opening.",
      voiceSettings,
      () => {
        if (!previewFailed) setVoicePreviewStatus("Preview finished.");
      },
    );
  };

  const handleBrowse = async () => {
    const folder = await window.clippi.openFolder();
    if (folder) {
      setConfig({ ...config, replayFolder: folder });
      // Persist immediately so a user who imports without clicking Save keeps it.
      window.clippi.saveConfig({ replayFolder: folder }).catch(() => {});
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
      // Persist the folder/tag that produced a successful import so they survive
      // even if the user never clicks Save. Fire-and-forget so a save failure
      // doesn't get reported as an import failure.
      window.clippi
        .saveConfig({ replayFolder: config.replayFolder, targetPlayer: config.targetPlayer })
        .catch(() => {});
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
        setWatcherActive(false);
        setImportStatus("Watcher stopped.");
      } else {
        if (!config.replayFolder || !config.targetPlayer) {
          setImportStatus("Set replay folder and player tag first.");
          return;
        }
        await window.clippi.startWatcher(config.replayFolder, config.connectCode ?? config.targetPlayer);
        setWatching(true);
        setWatcherActive(true);
        setImportStatus("Watching for new replays...");
      }
    } catch (err: unknown) {
      setWatcherActive(false);
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

  const handlePickSection = (sectionId: SettingsSectionId) => {
    setActiveSection(sectionId);
    requestAnimationFrame(() => {
      document.querySelector(".main-content")?.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  return (
    <div className="settings-page">
      <div className="page-header settings-page-header">
        <div>
          <h1>Settings</h1>
          <p className="settings-page-subtitle">
            Profile, replays, Cornerman, AI, and local data.{appVersion && ` · MAGI ${appVersion}`}
          </p>
        </div>
        <button className="btn btn-primary settings-save-button" onClick={handleSave}>
          <Save size={14} aria-hidden="true" />
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>

      <button
        className="btn"
        style={{ marginBottom: 20 }}
        onClick={() => {
          window.location.hash = "/setup";
        }}
      >
        Setup wizard
      </button>

      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                className={`settings-nav-button${isActive ? " settings-nav-button-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => handlePickSection(section.id)}
              >
                <span className="settings-nav-icon">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="settings-nav-copy">
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <main className="settings-panel" aria-labelledby="settings-section-title">
          <div className="settings-section-head">
            <span className="settings-section-eyebrow">{activeSectionCopy.eyebrow}</span>
            <h2 id="settings-section-title">{activeSectionCopy.title}</h2>
            <p>{activeSectionCopy.description}</p>
          </div>

          <div className="settings-section-content">
            {activeSection === "profile" && (
              <Card title="Player Identity">
                <div className="settings-field">
                  <label htmlFor="setting-target-player">Display Name / Tag</label>
                  <input
                    id="setting-target-player"
                    value={config.targetPlayer ?? ""}
                    onChange={(e) => setConfig({ ...config, targetPlayer: e.target.value || null })}
                    placeholder="YourTag"
                  />
                </div>
                <div className="settings-field">
                  <label htmlFor="setting-connect-code">Connect Code</label>
                  <input
                    id="setting-connect-code"
                    value={config.connectCode ?? ""}
                    onChange={(e) => setConfig({ ...config, connectCode: e.target.value || null })}
                    placeholder="TAG#123"
                  />
                </div>
              </Card>
            )}

            {activeSection === "interface" && (
              <Card title="Appearance">
                <div className="settings-field">
                  <label id="appearance-theme-label">Theme</label>
                  <div className="settings-row settings-wrap-row" role="group" aria-labelledby="appearance-theme-label">
                    {THEME_ORDER.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`btn ${colorMode === id ? "btn-primary" : ""}`}
                        aria-pressed={colorMode === id}
                        onClick={() => onPickTheme(id as ColorMode)}
                      >
                        {THEMES[id]!.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-field" style={{ marginBottom: 0 }}>
                  <label id="appearance-density-label">Density</label>
                  <div className="settings-row" role="group" aria-labelledby="appearance-density-label">
                    {(["comfortable", "compact"] as Density[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`btn ${density === d ? "btn-primary" : ""}`}
                        aria-pressed={density === d}
                        onClick={() => onPickDensity(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-field" style={{ marginBottom: 0 }}>
                  <label id="appearance-liquid-label">Liquid Metal</label>
                  <LiquidAppearanceControls variant="settings" />
                </div>
              </Card>
            )}

            {activeSection === "cornerman" && (
              <Card title="Coaching & live alerts">
                <p className="settings-help">
                  Cornerman lives in Play Mode’s panels. Choose and arrange panels with Customize.
                </p>
                <div className="settings-field">
                  <label htmlFor="setting-cornerman-live-alerts">Live Alerts</label>
                  <select
                    id="setting-cornerman-live-alerts"
                    className="model-select"
                    value={popupSettings.liveAlerts}
                    onChange={(e) =>
                      setConfig({ ...config, cornermanPopupLiveAlerts: e.target.value as CornermanPopupLiveAlertMode })
                    }
                  >
                    <option value="all">Show all live alerts</option>
                    <option value="high">Only high-impact alerts</option>
                    <option value="off">Do not show live alerts</option>
                  </select>
                </div>
                <div className="settings-toggle-list">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={popupSettings.desktopNotifications}
                      onChange={(e) => setConfig({ ...config, cornermanDesktopNotifications: e.target.checked })}
                    />
                    <span>
                      <strong>Desktop notification</strong>
                      <small>Send an OS notification when a coaching card is ready.</small>
                    </span>
                  </label>
                </div>
                <div className="settings-subsection">
                  <h4 className="settings-subhead">Voice coaching</h4>
                  <div className="settings-toggle-list">
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={voiceSettings.enabled}
                        onChange={(e) => setConfig({ ...config, cornermanVoiceEnabled: e.target.checked })}
                      />
                      <span>
                        <strong>Speak coaching tips</strong>
                        <small>Hear short callouts without taking your eyes off the game.</small>
                      </span>
                    </label>
                    {voiceSettings.enabled && (
                      <label className="settings-toggle">
                        <input
                          type="checkbox"
                          checked={voiceSettings.betweenGameAdjustments}
                          onChange={(e) =>
                            setConfig({ ...config, cornermanVoiceBetweenGameAdjustments: e.target.checked })
                          }
                        />
                        <span>
                          <strong>Read the between-game adjustment</strong>
                          <small>Speak only the final “Adjustment” sentence, not the full coaching card.</small>
                        </span>
                      </label>
                    )}
                  </div>
                  {voiceSettings.enabled && (
                    <>
                      <div className="settings-field" style={{ marginTop: 12 }}>
                        <label htmlFor="setting-cornerman-voice-alerts">Live callouts</label>
                        <select
                          id="setting-cornerman-voice-alerts"
                          className="model-select"
                          value={voiceSettings.liveAlerts}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              cornermanVoiceLiveAlerts: e.target.value as CornermanVoiceLiveAlertMode,
                            })
                          }
                        >
                          <option value="high">Only high-impact tips</option>
                          <option value="all">All detected tips</option>
                          <option value="off">No in-game callouts</option>
                        </select>
                      </div>
                      <div className="settings-field">
                        <label htmlFor="setting-cornerman-voice-backend">Voice engine</label>
                        <select
                          id="setting-cornerman-voice-backend"
                          className="model-select"
                          value={voiceSettings.backend}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              cornermanVoiceBackend: e.target.value as CornermanVoiceBackend,
                            })
                          }
                        >
                          <option value="system">System voice</option>
                          <option value="openai">OpenAI voice</option>
                          <option value="azure">Azure OpenAI voice</option>
                        </select>
                      </div>
                      {voiceSettings.backend === "system" ? (
                        <div className="settings-field">
                          <label htmlFor="setting-cornerman-voice">Voice</label>
                          <select
                            id="setting-cornerman-voice"
                            className="model-select"
                            value={voiceSettings.voiceURI ?? ""}
                            onChange={(e) => setConfig({ ...config, cornermanVoiceURI: e.target.value || null })}
                          >
                            <option value="">System default</option>
                            {speechVoices.map((voice) => (
                              <option value={voice.voiceURI} key={voice.voiceURI}>
                                {voice.name} ({voice.lang})
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <>
                          <div className="settings-field">
                            <label htmlFor="setting-cornerman-voice-model">
                              {voiceSettings.backend === "azure" ? "Azure TTS deployment" : "Voice model"}
                            </label>
                            <input
                              id="setting-cornerman-voice-model"
                              className="model-select"
                              value={voiceSettings.model}
                              onChange={(e) => setConfig({ ...config, cornermanVoiceModel: e.target.value })}
                              placeholder="gpt-4o-mini-tts"
                            />
                          </div>
                          <div className="settings-field">
                            <label htmlFor="setting-cornerman-provider-voice">Provider voice</label>
                            <select
                              id="setting-cornerman-provider-voice"
                              className="model-select"
                              value={voiceSettings.providerVoice}
                              onChange={(e) => setConfig({ ...config, cornermanProviderVoice: e.target.value })}
                            >
                              {PROVIDER_VOICE_OPTIONS.map((voice) => (
                                <option value={voice} key={voice}>
                                  {voice.charAt(0).toUpperCase() + voice.slice(1)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="settings-field">
                            <label htmlFor="setting-cornerman-voice-instructions">Speaking style</label>
                            <textarea
                              id="setting-cornerman-voice-instructions"
                              className="model-select"
                              rows={3}
                              value={voiceSettings.instructions}
                              onChange={(e) => setConfig({ ...config, cornermanVoiceInstructions: e.target.value })}
                            />
                          </div>
                          <p className="settings-help">
                            Provider voices are AI-generated. Save the{" "}
                            {voiceSettings.backend === "azure" ? "Azure" : "OpenAI"} API key
                            {voiceSettings.backend === "azure" ? " and endpoint" : ""} in AI settings before testing.
                          </p>
                        </>
                      )}
                      <div className="settings-field">
                        <label htmlFor="setting-cornerman-voice-rate">Speech speed</label>
                        <div className="settings-row settings-row-center">
                          <input
                            id="setting-cornerman-voice-rate"
                            type="range"
                            min="0.75"
                            max="1.5"
                            step="0.05"
                            value={voiceSettings.rate}
                            onChange={(e) => setConfig({ ...config, cornermanVoiceRate: Number(e.target.value) })}
                          />
                          <span className="settings-mono-value">{voiceSettings.rate.toFixed(2)}×</span>
                        </div>
                      </div>
                      <div className="settings-field">
                        <label htmlFor="setting-cornerman-voice-volume">Voice volume</label>
                        <div className="settings-row settings-row-center">
                          <input
                            id="setting-cornerman-voice-volume"
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={voiceSettings.volume}
                            onChange={(e) => setConfig({ ...config, cornermanVoiceVolume: Number(e.target.value) })}
                          />
                          <span className="settings-mono-value">{Math.round(voiceSettings.volume * 100)}%</span>
                        </div>
                      </div>
                      <div className="settings-field">
                        <label htmlFor="setting-cornerman-voice-cooldown">Minimum time between callouts</label>
                        <div className="settings-row settings-row-center">
                          <input
                            id="setting-cornerman-voice-cooldown"
                            type="number"
                            min="5"
                            max="30"
                            value={voiceSettings.cooldownSeconds}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                cornermanVoiceCooldownSeconds: normalizeCornermanVoiceCooldownSeconds(
                                  Number(e.target.value),
                                ),
                              })
                            }
                          />
                          <span className="settings-mono-value">seconds</span>
                        </div>
                      </div>
                      <button type="button" className="btn" onClick={previewCornermanVoice}>
                        <Volume2 size={14} aria-hidden="true" />
                        Test voice
                      </button>
                      {voicePreviewStatus && <p className="settings-help">{voicePreviewStatus}</p>}
                      <p className="settings-help" style={{ marginTop: 10 }}>
                        High-impact tips replace lower-priority queued tips. Repeated alerts are suppressed.
                      </p>
                    </>
                  )}
                </div>

                <div className="settings-subsection">
                  <h4 className="settings-subhead">Live stats</h4>
                  <div className="settings-toggle-list">
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={liveStatsSettings.enabled}
                        onChange={(e) => setConfig({ ...config, cornermanLiveStatsEnabled: e.target.checked })}
                      />
                      <span>
                        <strong>Show live stats during games</strong>
                        <small>Running L-cancel %, openings/kill and more, updated as you play.</small>
                      </span>
                    </label>
                  </div>
                  <p className="settings-help">Select the stats shown in Play Mode under Customize.</p>
                </div>
              </Card>
            )}

            {activeSection === "replays" && (
              <Card title="Replay Import">
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
                <div className="settings-row settings-wrap-row">
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
                    <div className="settings-progress-caption">
                      <span>{importProgress.lastFile}</span>
                      <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                    </div>
                  </div>
                )}
                {importStatus && (
                  <p className={`import-status${importErrors.length > 0 ? " import-status--warn" : ""}`}>
                    {importStatus}
                  </p>
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
                      <div className="settings-error-list">
                        {importErrors.map((e, i) => (
                          <div key={i} style={{ marginBottom: 4, color: "var(--text-dim)" }}>
                            <span style={{ color: "var(--red, #C60707)" }}>{e.filePath.split("/").pop()}</span>
                            {" — "}
                            {e.error}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            {activeSection === "play" && (
              <Card title="Play Mode settings">
                <p className="settings-help">
                  Live play uses Slippi Netplay Dolphin. Replay review uses the separate Playback copy.
                </p>
                <div className="settings-field">
                  <label htmlFor="play-setting-dolphin">Slippi Netplay Dolphin</label>
                  <div className="settings-row">
                    <input
                      id="play-setting-dolphin"
                      value={config.playDolphinPath ?? ""}
                      placeholder="Auto-detect Slippi Launcher’s Netplay Dolphin"
                      onChange={(e) => setConfig({ ...config, playDolphinPath: e.target.value || null })}
                    />
                    <button
                      className="btn"
                      onClick={async () => {
                        const file = await window.clippi.openFileDialog("Select Slippi Netplay Dolphin", [
                          { name: "Dolphin executable", extensions: ["exe", "AppImage", "*"] },
                        ]);
                        if (file) setConfig({ ...config, playDolphinPath: file });
                      }}
                    >
                      Browse
                    </button>
                  </div>
                </div>
                <div className="settings-field">
                  <label htmlFor="play-setting-iso">Melee game image</label>
                  <div className="settings-row">
                    <input
                      id="play-setting-iso"
                      value={config.meleeIsoPath ?? ""}
                      placeholder="Choose your legally obtained game image"
                      onChange={(e) => setConfig({ ...config, meleeIsoPath: e.target.value || null })}
                    />
                    <button
                      className="btn"
                      onClick={async () => {
                        const file = await window.clippi.openFileDialog("Select Melee game image", [
                          { name: "Game image", extensions: ["iso", "gcm", "rvz"] },
                        ]);
                        if (file) setConfig({ ...config, meleeIsoPath: file });
                      }}
                    >
                      Browse
                    </button>
                  </div>
                </div>
                <div className="settings-field">
                  <label htmlFor="play-setting-replays">Slippi replay output folder</label>
                  <div className="settings-row">
                    <input
                      id="play-setting-replays"
                      value={config.replayFolder ?? ""}
                      onChange={(e) => setConfig({ ...config, replayFolder: e.target.value || null })}
                    />
                    <button
                      className="btn"
                      onClick={async () => {
                        const folder = await window.clippi.openFolder();
                        if (folder) setConfig({ ...config, replayFolder: folder });
                      }}
                    >
                      Browse
                    </button>
                  </div>
                  <p className="settings-help">Use the folder Dolphin writes to and enable replay saving in Dolphin.</p>
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={config.cornermanEnabled !== false}
                    onChange={(e) => setConfig({ ...config, cornermanEnabled: e.target.checked })}
                  />
                  <span>
                    <strong>Enable Cornerman in Play Mode</strong>
                    <small>
                      Show live-session controls and start tracking when Melee launches. Coaching and alerts appear in
                      Play Mode panels.
                    </small>
                  </span>
                </label>
                <p className="settings-help">
                  Save Settings to apply changes. Configure coaching providers under AI and voice and alert preferences
                  under Cornerman.
                </p>
              </Card>
            )}

            {activeSection === "playback" && (
              <Card title="Slippi Dolphin">
                <div className="settings-field">
                  <label htmlFor="setting-dolphin-path">
                    Dolphin Executable Path (optional — auto-detected if left blank)
                  </label>
                  <div className="settings-row">
                    <input
                      id="setting-dolphin-path"
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
                  <label htmlFor="setting-melee-iso">
                    Melee ISO Path (vanilla NTSC 1.02 — needed for replay playback)
                  </label>
                  <div className="settings-row">
                    <input
                      id="setting-melee-iso"
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
            )}

            {activeSection === "ai" && (
              <Card>
                <div className="settings-card-title-row">
                  <div className="card-title">AI Provider</div>
                  <button className="btn settings-small-button" onClick={fetchModels} disabled={modelsLoading}>
                    <SlidersHorizontal size={12} aria-hidden="true" />
                    {modelsLoading ? "Fetching..." : "Refresh models"}
                  </button>
                </div>
                <p className="settings-card-intro">
                  Bring your own key for any provider. Pick one as the active provider — that's the one MAGI will use.
                </p>

                <div className="provider-list">
                  {PROVIDERS.map((p) => {
                    const isActive = config.activeProvider === p.id;
                    if (p.id === "chatgpt")
                      return (
                        <div key={p.id} className={`provider-option${isActive ? " provider-option-active" : ""}`}>
                          <label className="provider-option-label">
                            <input
                              type="radio"
                              name="active-provider"
                              checked={isActive}
                              onChange={() => setActiveProvider(p.id)}
                            />
                            ChatGPT plan{isActive && <span className="provider-active-pill">Active</span>}
                          </label>
                          <ChatGPTConnection
                            onChanged={async () => {
                              const saved = await window.clippi.loadConfig();
                              setConfig((previous) => ({
                                ...previous,
                                activeProvider: saved.activeProvider,
                                modelByProvider: {
                                  ...previous.modelByProvider,
                                  chatgpt: saved.modelByProvider.chatgpt,
                                },
                              }));
                            }}
                          />
                        </div>
                      );
                    const isSet = !!config.apiKeys[p.id];
                    const keyEdit = keyEdits[p.id] ?? "";
                    const fetched = dynamicModels?.[p.id] ?? [];
                    const models = fetched.length > 0 ? fetched : FALLBACK_MODELS[p.id];
                    const selectedModel = config.modelByProvider[p.id] ?? "";
                    const customMode = p.id === "azure" || (customModelInputs[p.id] ?? false);
                    const ready = !p.needsKey || isSet || !!keyEdit.trim();

                    return (
                      <div key={p.id} className={`provider-option${isActive ? " provider-option-active" : ""}`}>
                        <div className="provider-option-head">
                          <label className="provider-option-label">
                            <input
                              type="radio"
                              name="active-provider"
                              checked={isActive}
                              onChange={() => setActiveProvider(p.id)}
                            />
                            {p.label}
                            {isActive && <span className="provider-active-pill">Active</span>}
                          </label>
                          {p.signupUrl && (
                            <a className="provider-signup-link" href={p.signupUrl} target="_blank" rel="noreferrer">
                              get a key -&gt;
                            </a>
                          )}
                        </div>

                        {p.needsKey && (
                          <div className="settings-field" style={{ marginBottom: 8 }}>
                            <label htmlFor={`apikey-${p.id}`} style={{ fontSize: 11 }}>
                              API Key {isSet && <span className="provider-key-set">(configured)</span>}
                            </label>
                            <input
                              id={`apikey-${p.id}`}
                              type="password"
                              value={keyEdit}
                              onChange={(e) => setKeyEdits({ ...keyEdits, [p.id]: e.target.value })}
                              placeholder={isSet ? "Enter new key to replace" : p.keyPlaceholder}
                            />
                          </div>
                        )}

                        {p.id === "local" && (
                          <div className="settings-field" style={{ marginBottom: 8 }}>
                            <label htmlFor={`local-endpoint-${p.id}`} style={{ fontSize: 11 }}>
                              Local Endpoint URL
                            </label>
                            <input
                              id={`local-endpoint-${p.id}`}
                              type="text"
                              value={config.localEndpoint ?? ""}
                              onChange={(e) => setConfig({ ...config, localEndpoint: e.target.value || null })}
                              placeholder="http://localhost:1234/v1"
                            />
                          </div>
                        )}

                        {p.id === "azure" && (
                          <div className="settings-field" style={{ marginBottom: 8 }}>
                            <label htmlFor="azure-endpoint" style={{ fontSize: 11 }}>
                              Azure resource endpoint
                            </label>
                            <input
                              id="azure-endpoint"
                              type="url"
                              value={config.azureEndpoint ?? ""}
                              onChange={(e) => setConfig({ ...config, azureEndpoint: e.target.value || null })}
                              placeholder="https://your-resource.openai.azure.com"
                            />
                          </div>
                        )}

                        <div className="settings-field" style={{ marginBottom: 0 }}>
                          <div className="provider-model-head">
                            <label htmlFor={`model-${p.id}`} style={{ fontSize: 11 }}>
                              {p.id === "azure" ? "Deployment name" : "Model"}
                              {p.id !== "azure" && p.needsKey && !ready && (
                                <span className="provider-model-hint">(add a key to load live models)</span>
                              )}
                            </label>
                            {p.id !== "azure" && (
                              <button
                                className="btn settings-small-button"
                                onClick={() => setCustomModelInputs({ ...customModelInputs, [p.id]: !customMode })}
                              >
                                {customMode ? "Dropdown" : "Custom ID"}
                              </button>
                            )}
                          </div>
                          {customMode ? (
                            <input
                              id={`model-${p.id}`}
                              value={selectedModel}
                              onChange={(e) => setProviderModel(p.id, e.target.value || null)}
                              placeholder={p.id === "azure" ? "your-deployment-name" : (models[0]?.id ?? "model-id")}
                            />
                          ) : (
                            <select
                              id={`model-${p.id}`}
                              className="model-select"
                              value={selectedModel}
                              onChange={(e) => setProviderModel(p.id, e.target.value || null)}
                            >
                              <option value="">— select a model —</option>
                              {models.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="provider-active-summary">
                  Active:{" "}
                  {config.activeProvider
                    ? `${PROVIDER_BY_ID[config.activeProvider].label} -> ${
                        config.modelByProvider[config.activeProvider] ?? "(no model selected)"
                      }`
                    : "(none — pick a provider above)"}
                </p>
              </Card>
            )}

            {activeSection === "data" && (
              <Card title="Danger Zone">
                <p className="settings-card-intro">
                  This will delete all imported games, stats, and coaching analyses from the local database. Your replay
                  files will not be touched.
                </p>
                <button className="btn btn-danger settings-danger-button" onClick={handleClearAll}>
                  <Trash2 size={14} aria-hidden="true" />
                  Clear All Games
                </button>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
