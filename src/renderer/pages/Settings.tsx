import { useSearchParams } from "react-router-dom";
import { useImportStore } from "../stores/useImportStore";
import { clearReplayData, queryClient } from "../hooks/cache";
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
import { LiquidAppearanceControls } from "../components/LiquidAppearanceControls";
import { PROVIDERS, PROVIDER_BY_ID, type ProviderId } from "../../llmProviders";
import { useGlobalStore, type Density } from "../stores/useGlobalStore";
import { THEMES, THEME_ORDER, applyTheme, getResolvedTheme, type ColorMode } from "../themes";
import {
  clampCornermanOverlayTransparency,
  DEFAULT_CORNERMAN_OVERLAY_TRANSPARENCY,
} from "../../cornermanOverlayTransparency";
import {
  normalizeCornermanPopupAutoHideSeconds,
  resolveCornermanPopupSettings,
  type CornermanPopupLiveAlertMode,
} from "../../cornermanPopupSettings";
import { MAX_OVERLAY_STATS, resolveCornermanLiveStatsSettings } from "../../cornermanLiveStatsSettings";
import { LIVE_STAT_DEFS, type CornermanLiveStatId } from "../../cornermanLiveStats";
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

type SettingsSectionId = "profile" | "interface" | "cornerman" | "replays" | "playback" | "ai" | "data";

const SETTINGS_SECTIONS: {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: typeof UserCircle;
}[] = [
  { id: "profile", label: "Profile", description: "Tag and connect code", icon: UserCircle },
  { id: "interface", label: "Interface", description: "Theme and density", icon: Palette },
  { id: "cornerman", label: "Cornerman", description: "Popup and alerts", icon: Bell },
  { id: "replays", label: "Replays", description: "Folder and imports", icon: FolderOpen },
  { id: "playback", label: "Playback", description: "Dolphin and ISO", icon: Gamepad2 },
  { id: "ai", label: "AI", description: "Provider, keys, models", icon: Zap },
  { id: "data", label: "Data", description: "Local database", icon: Database },
];

const SETTINGS_SECTION_COPY: Record<SettingsSectionId, { eyebrow: string; title: string; description: string }> = {
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
    title: "Cornerman Popup",
    description: "Control what can appear over play and how long it stays there.",
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
  const [config, setConfig] = useState<Config>({
    targetPlayer: null,
    connectCode: null,
    replayFolder: null,
    dolphinPath: null,
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
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [watcherBusy, setWatcherBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const importing = useImportStore((state) => state.busy);
  const watching = useGlobalStore((state) => state.watcherActive);
  const [dynamicModels, setDynamicModels] = useState<Record<string, FetchedModel[]> | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [customModelInputs, setCustomModelInputs] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicePreviewStatus, setVoicePreviewStatus] = useState<string | null>(null);
  const voicePreviewAdapter = useRef<CornermanSpeechAdapter | null>(null);
  const activeSection = (SETTINGS_SECTIONS.some(s => s.id === params.get("section")) ? params.get("section") : "profile") as SettingsSectionId;
  const setActiveSection = (section: SettingsSectionId) => setParams({ section }, { replace: true });
  const setWatcherActive = useGlobalStore((state) => state.setWatcherActive);
  const colorMode = useGlobalStore((state) => state.colorMode);
  const setColorMode = useGlobalStore((state) => state.setColorMode);
  const density = useGlobalStore((state) => state.density);
  const setDensity = useGlobalStore((state) => state.setDensity);
  const popupSettings = resolveCornermanPopupSettings(config);
  const popupTransparency = clampCornermanOverlayTransparency(config.cornermanOverlayTransparency);
  const liveStatsSettings = resolveCornermanLiveStatsSettings(config);
  const voiceSettings = resolveCornermanVoiceSettings(config);

  const toggleOverlayStat = (id: CornermanLiveStatId) => {
    const current = liveStatsSettings.overlayStatIds;
    const next = current.includes(id)
      ? current.filter((s) => s !== id)
      : current.length < MAX_OVERLAY_STATS
        ? [...current, id]
        : current; // at the cap — ignore additional selections
    setConfig({ ...config, cornermanOverlayStatIds: next });
  };
  const activeSectionCopy = SETTINGS_SECTION_COPY[activeSection];

  // Load user config
  useEffect(() => {
    async function load() {
      try {
        const c = await window.clippi.loadConfig();
        if (c) setConfig(c);
        setLoaded(true);
        setStatus("");
      } catch (err) {
        setStatus(`Could not load settings: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    load();
  }, [loadAttempt]);

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

  const handleSave = useCallback(async () => {
    if (saving || !loaded) return;
    setSaving(true); setSaved(false); setStatus("");
    try {
      // Build save payload: non-secret fields + only non-empty key edits.
      // Strip the redacted apiKeys map (booleans) so saveConfig never overwrites
      // real keys with `true`.
      const payload: Record<string, unknown> = { ...config };
      delete payload.apiKeys;
      // Don't clobber theme/density chosen via Tweaks/Appearance with the
      // stale values captured at mount — those persist through their own setters.
      delete payload.theme;
      delete payload.density;
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
      setStatus("Settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["config"] });
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setStatus(`Could not save settings: ${err instanceof Error ? err.message : String(err)}`);
    }
    finally { setSaving(false); }
  }, [config, keyEdits, saving, loaded]);

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
    window.clippi.saveConfig({ colorMode: id }).catch((error: unknown) => setStatus(`Could not save preference: ${error instanceof Error ? error.message : String(error)}`));
  };

  const onPickDensity = (d: Density) => {
    setDensity(d);
    window.clippi.saveConfig({ density: d }).catch((error: unknown) => setStatus(`Could not save preference: ${error instanceof Error ? error.message : String(error)}`));
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
    let folder: string | null;
    try { folder = await window.clippi.openFolder(); } catch (error) { setStatus(`Could not choose folder: ${error instanceof Error ? error.message : String(error)}`); return; }
    if (folder) {
      setConfig({ ...config, replayFolder: folder });
      // Persist immediately so a user who imports without clicking Save keeps it.
      window.clippi.saveConfig({ replayFolder: folder }).catch((error: unknown) => setStatus(`Could not save preference: ${error instanceof Error ? error.message : String(error)}`));
    }
  };

  const handleImport = async () => {
    const player = config.connectCode?.trim() || config.targetPlayer?.trim();
    if (!player) { setStatus("Enter your connect code or player tag in Profile, then return to Replays."); setActiveSection("profile"); return; }
    await useImportStore.getState().run(config.replayFolder ?? "", player);
  };

  const toggleWatcher = async () => {
    if (watcherBusy) return;
    setWatcherBusy(true);
    try {
      if (watching) {
        await window.clippi.stopWatcher();
        setWatcherActive(false);
        setStatus("Watcher stopped.");
      } else {
        if (!config.replayFolder || !(config.connectCode?.trim() || config.targetPlayer?.trim())) {
          setStatus("Set replay folder and player tag first.");
          return;
        }
        await window.clippi.startWatcher(config.replayFolder, config.connectCode?.trim() || config.targetPlayer!.trim());
        setWatcherActive(true);
        setStatus("Watching for new replays...");
      }
    } catch (err: unknown) {
      setStatus(`Watcher error: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setWatcherBusy(false); }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure? This will delete all imported games, stats, and analyses.")) {
      return;
    }
    try {
      await clearReplayData();
      setStatus("All games cleared.");
      onImport();
    } catch (err: unknown) {
      setStatus(`Error clearing data: ${err instanceof Error ? err.message : String(err)}`);
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
          <p className="settings-page-subtitle">Profile, replays, Cornerman, AI, and local data.</p>
        </div>
        <button className="btn btn-primary settings-save-button" onClick={handleSave} disabled={saving || !loaded}>
          <Save size={14} aria-hidden="true" />
          {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
        </button>
      </div>

      <p className="help-copy">Profile, playback, and coaching fields use Save Settings. Appearance choices save immediately.</p>
      {status && <div className="operation-status" role="status">{status}</div>}
      {!loaded && <button className="btn" onClick={() => setLoadAttempt(n => n + 1)}>Retry loading settings</button>}
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
                {colorMode === "liquid" && (
                  <>
                    <div className="settings-divider" />
                    <div className="settings-field" style={{ marginBottom: 0 }}>
                      <label id="appearance-liquid-label">Liquid Metal</label>
                      <LiquidAppearanceControls variant="settings" />
                    </div>
                  </>
                )}
              </Card>
            )}

            {activeSection === "cornerman" && (
              <Card title="Popup Behavior">
                <div className="settings-field">
                  <label htmlFor="setting-cornerman-transparency">Transparency</label>
                  <div className="settings-row settings-row-center">
                    <input
                      id="setting-cornerman-transparency"
                      type="range"
                      min="15"
                      max="85"
                      value={popupTransparency}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          cornermanOverlayTransparency: clampCornermanOverlayTransparency(Number(e.target.value)),
                        })
                      }
                    />
                    <span className="settings-mono-value">{popupTransparency}%</span>
                  </div>
                </div>
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
                <div className="settings-field">
                  <label htmlFor="setting-cornerman-autohide">Auto-hide after notification</label>
                  <div className="settings-row settings-row-center">
                    <input
                      id="setting-cornerman-autohide"
                      type="number"
                      min="0"
                      max="120"
                      value={popupSettings.autoHideSeconds}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          cornermanPopupAutoHideSeconds: normalizeCornermanPopupAutoHideSeconds(Number(e.target.value)),
                        })
                      }
                    />
                    <span className="settings-mono-value">seconds</span>
                  </div>
                  <p className="settings-help">Use 0 to keep the popup open until dismissed.</p>
                </div>
                <div className="settings-toggle-list">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={popupSettings.coachingCards}
                      onChange={(e) => setConfig({ ...config, cornermanPopupCoachingCards: e.target.checked })}
                    />
                    <span>
                      <strong>Between-game coaching cards</strong>
                      <small>Show the generated adjustment in the popup.</small>
                    </span>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={popupSettings.errors}
                      onChange={(e) => setConfig({ ...config, cornermanPopupErrors: e.target.checked })}
                    />
                    <span>
                      <strong>Popup errors</strong>
                      <small>Show provider or analysis failures in the popup.</small>
                    </span>
                  </label>
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
                {config.cornermanOverlayTransparency === null && (
                  <p className="settings-help" style={{ marginTop: 10 }}>
                    Default transparency is {DEFAULT_CORNERMAN_OVERLAY_TRANSPARENCY}%.
                  </p>
                )}

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
                  {liveStatsSettings.enabled && (
                    <>
                      <p className="settings-help" style={{ marginTop: 10 }}>
                        Overlay shows up to {MAX_OVERLAY_STATS} ({liveStatsSettings.overlayStatIds.length}/
                        {MAX_OVERLAY_STATS} chosen); the Cornerman page always shows everything.
                      </p>
                      <div className="settings-toggle-list">
                        {LIVE_STAT_DEFS.map((def) => {
                          const checked = liveStatsSettings.overlayStatIds.includes(def.id);
                          const atCap = !checked && liveStatsSettings.overlayStatIds.length >= MAX_OVERLAY_STATS;
                          return (
                            <label
                              className="settings-toggle"
                              key={def.id}
                              style={atCap ? { opacity: 0.5 } : undefined}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={atCap}
                                onChange={() => toggleOverlayStat(def.id)}
                              />
                              <span>
                                <strong>{def.label}</strong>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
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
                      aria-label="Replay folder"
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
                  <button className={`btn ${watching ? "btn-danger" : ""}`} onClick={toggleWatcher} disabled={watcherBusy}>
                    {watching ? "Stop Watching" : "Watch for New Games"}
                  </button>
                </div>

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
