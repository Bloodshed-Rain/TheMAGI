import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Gamepad2,
  Settings2,
  PanelLeft,
  PanelRight,
  Square,
  Play,
  Maximize,
} from "lucide-react";
import Markdown from "react-markdown";
import {
  PLAY_PANELS,
  playPreset,
  resolvePlayLayout,
  type PlayLayout,
  type PlayPanel,
  type PlayPreset,
  type PlaySidebar,
  type PlayCoachingSetup,
} from "../../playMode";
import { gameOnlyLayout } from "../../playGameOnlyLayout";
import { LIVE_STAT_DEFS, formatLiveStatValue } from "../../cornermanLiveStats";
import { usePlayHost } from "../hooks/usePlayHost";
import { usePlayEdgePeek } from "../hooks/usePlayEdgePeek";
import { useCornermanLiveStats } from "../hooks/useCornermanLiveStats";
import { useGlobalStore } from "../stores/useGlobalStore";
import { CornermanLiveAlerts } from "../components/CornermanLiveAlerts";
import { PlayOracle } from "../components/PlayOracle";
import { PlayRecentForm } from "../components/PlayRecentForm";
import magiLogo from "../assets/magi-controller.png";
import { loadPlayPreferences, savePlayPreferences, type PlayPreferences } from "../playPreferences";
import "../styles/play-mode.css";

export function PlayMode({ onExit }: { onExit: () => void }) {
  const live = useCornermanLiveStats();
  const [layout, setLayout] = useState<PlayLayout>(() => playPreset("coaching"));
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cornermanEnabled, setCornermanEnabled] = useState(true);
  const [liveSetup, setLiveSetup] = useState<PlayCoachingSetup | null>(null);
  const [focus, setFocus] = useState("");
  const [notes, setNotes] = useState("");
  const [saveState, setSaveState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [corner, setCorner] = useState<CornermanStatus | null>(null);
  const [cornerBusy, setCornerBusy] = useState(false);
  const stream = useGlobalStore((state) => state.cornermanStream);
  const liveEvents = useGlobalStore((state) => state.cornermanLiveEvents);
  const coachingError = useGlobalStore((state) => state.cornermanError);
  const [now, setNow] = useState(Date.now);
  const history = useGlobalStore((state) => state.cornermanHistory);
  const area = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [size, setSize] = useState({ width: 640, height: 480 });
  const host = usePlayHost(JSON.stringify([layout, editing, error]));
  const gameOnly = gameOnlyLayout(viewport.width, viewport.height, layout.gameOnlyPanelMode);
  const peek = usePlayEdgePeek(host.gameOnly && gameOnly.autoHide, layout.left.width, layout.right.width);
  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  const running = host.status.phase === "running" || host.status.phase === "launching";
  useEffect(() => {
    if (live.snapshot?.phase !== "live") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live.snapshot?.phase]);

  useEffect(() => {
    let alive = true;
    void loadPlayPreferences()
      .then((config) => {
        if (!alive) return;
        setLayout(resolvePlayLayout(config.playLayout));
        setFocus(config.playFocus ?? "");
        setNotes(config.playNotes ?? "");
        setCornermanEnabled(config.cornermanEnabled !== false);
        setReady(true);
      })
      .catch((e) => {
        if (alive) setError(`Could not load Play Mode preferences: ${String(e)}`);
      });
    void window.clippi
      .playCoachingSetup()
      .then((value) => {
        if (alive) setLiveSetup(value);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    void window.clippi
      .cornermanStatus()
      .then((status) => {
        if (alive) setCorner(status);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    const offStatus = window.clippi.onCornermanSetUpdate(setCorner);
    const offError = window.clippi.onCornermanError((message) => {
      setError(message);
    });
    return () => {
      alive = false;
      offStatus();
      offError();
    };
  }, []);

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      const width = Math.max(1, Math.min(rect.width, (rect.height * 4) / 3));
      setSize({ width, height: (width * 3) / 4 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Serialize writes and retain the newest draft across unmounts. Navigating
  // back to the app must not lose a note typed immediately before leaving.
  const latestDraft = useRef<PlayPreferences | null>(null);
  latestDraft.current = ready ? { playLayout: layout, playFocus: focus, playNotes: notes } : null;
  useEffect(
    () => () => {
      if (latestDraft.current) void savePlayPreferences(latestDraft.current).catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (!ready) return;
    setSaveState("Saving…");
    const draft = { playLayout: layout, playFocus: focus, playNotes: notes };
    let alive = true;
    const save = () => {
      void savePlayPreferences(draft)
        .then(() => {
          if (alive) setSaveState("Saved locally");
        })
        .catch((e) => {
          if (alive) setSaveState(`Save failed: ${String(e)}`);
        });
    };
    const timer = window.setTimeout(save, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [layout, focus, notes, ready]);

  const updateSide = (side: "left" | "right", change: Partial<PlaySidebar>) =>
    setLayout((current) => ({ ...current, [side]: { ...current[side], ...change } }));
  const openPlaySettings = () => {
    window.location.hash = "/settings?section=play";
  };
  const startCorner = async () => {
    if (!cornermanEnabled) return;
    setCornerBusy(true);
    setError(null);
    try {
      if (corner?.active) {
        setCorner(await window.clippi.cornermanStop());
        return;
      }
      const prepared = await window.clippi.playPrepareCoaching();
      setLiveSetup(prepared);
      setCorner(await window.clippi.cornermanStart(prepared.replayFolder!, prepared.targetPlayer!));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCornerBusy(false);
    }
  };
  const launch = async () => {
    const result = await host.start();
    if (result && (result.phase === "launching" || result.phase === "running") && cornermanEnabled && !corner?.active)
      await startCorner();
  };
  const panel = (id: PlayPanel) => {
    if (id === "stats") {
      const target = live.snapshot?.players.find((player) => player.isTarget);
      return (
        <>
          <p className="helper-text">
            {!corner?.active
              ? "Start a live session to read replay data."
              : !live.snapshot
                ? "Waiting for a replay. Match the replay folder to Slippi’s output; live stats must be enabled in Settings."
                : live.snapshot.phase === "ended"
                  ? "Final game stats"
                  : now - live.receivedAt > 5000
                    ? "Updates paused · showing the last received replay stats"
                    : "Live replay data · updates about every 2 seconds"}
          </p>
          <div className="play-stat-grid">
            {layout.statIds.map((id) => {
              const def = LIVE_STAT_DEFS.find((item) => item.id === id)!;
              const value = target?.stats.find((item) => item.id === id);
              return (
                <div key={id}>
                  <strong>{value ? formatLiveStatValue(def, value) : "—"}</strong>
                  <small>{def.label}</small>
                </div>
              );
            })}
          </div>
          {editing && (
            <fieldset className="play-stat-picker">
              <legend>Displayed stats</legend>
              {LIVE_STAT_DEFS.map((def) => (
                <label key={def.id}>
                  <input
                    type="checkbox"
                    checked={layout.statIds.includes(def.id)}
                    onChange={(event) =>
                      setLayout((current) => ({
                        ...current,
                        statIds: event.target.checked
                          ? [...current.statIds, def.id]
                          : current.statIds.filter((id) => id !== def.id),
                      }))
                    }
                  />
                  {def.label}
                </label>
              ))}
            </fieldset>
          )}
        </>
      );
    }
    if (id === "set")
      return (
        <>
          <div className="play-set-score">
            {corner?.wins ?? 0}
            <span>—</span>
            {corner?.losses ?? 0}
          </div>
          <p>{corner?.opponentTag || "Waiting for an opponent"}</p>
          <p className="helper-text">{corner?.gamesCount ?? 0} games in current set</p>
          {live.snapshot?.players.map((player) => (
            <div key={player.playerIndex} className="play-player">
              <strong>{player.isTarget ? "You" : player.tag}</strong>
              <span>{player.character}</span>
            </div>
          ))}
        </>
      );
    if (id === "coaching" && !cornermanEnabled)
      return (
        <p>
          Cornerman is disabled. <a href="#/settings?section=play">Enable it in Play Mode settings.</a>
        </p>
      );
    if (id === "coaching")
      return (
        <>
          <CornermanLiveAlerts events={liveEvents} compact />
          {coachingError && <p role="alert">{coachingError}</p>}
          <p className="helper-text">One adjustment between games. Your practice focus stays visible while you play.</p>
          {stream ? (
            <div className="analysis-text" aria-live="polite">
              <Markdown>{stream}</Markdown>
            </div>
          ) : history[0] ? (
            <>
              <small>
                Game {history[0].gameNumber} · {history[0].opponentTag}
              </small>
              <div className="analysis-text">
                <Markdown>{history[0].text}</Markdown>
              </div>
            </>
          ) : (
            <p>
              {corner?.active
                ? "Your next completed game will give Cornerman something to work with."
                : "Start a live session in the toolbar when you’re ready."}
            </p>
          )}
        </>
      );
    if (id === "oracle") return <PlayOracle />;
    if (id === "trends") return <PlayRecentForm />;
    if (id === "focus")
      return (
        <label className="form-field">
          One thing for this session
          <textarea
            rows={3}
            maxLength={500}
            placeholder="Stay patient in the corner…"
            value={focus}
            disabled={!ready}
            onChange={(event) => setFocus(event.target.value)}
          />
        </label>
      );
    return (
      <label className="form-field">
        Session notebook
        <textarea
          rows={7}
          maxLength={12000}
          placeholder="What worked? What should you review?"
          value={notes}
          disabled={!ready}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
    );
  };
  const sidebar = (side: "left" | "right") => {
    const settings = layout[side];
    if (host.gameOnly ? gameOnly.autoHide && peek !== side : settings.collapsed) return null;
    return (
      <aside
        className={`play-sidebar play-sidebar-${side}${host.gameOnly && gameOnly.autoHide ? " play-sidebar-peek" : ""}`}
        aria-label={`${side} sidebar`}
      >
        {host.gameOnly && (
          <div className="play-game-only-panel-controls">
            <button
              className="btn"
              onClick={() =>
                setLayout((current) => ({
                  ...current,
                  gameOnlyPanelMode: current.gameOnlyPanelMode === "auto-hide" ? "visible" : "auto-hide",
                }))
              }
            >
              {layout.gameOnlyPanelMode === "auto-hide" ? "Keep panels visible" : "Auto-hide panels"}
            </button>
            <button
              className="btn"
              onClick={() => void window.clippi.playGameOnly(false).catch((e) => setError(String(e)))}
            >
              Exit fullscreen
            </button>
            <small>
              {gameOnly.autoHide
                ? layout.gameOnlyPanelMode === "visible"
                  ? "Not enough side space at this size. Hover an edge to show panels."
                  : "Hover either edge to show panels. Move away to hide."
                : "Panels use the space beside the game."}{" "}
              Ctrl+Shift+F11 returns to your layout.
            </small>
          </div>
        )}
        {editing && (
          <div className="card play-sidebar-editor">
            <h2>{side === "left" ? "Left" : "Right"} sidebar</h2>
            <label className="form-field">
              Width · {settings.width}px
              <input
                type="range"
                min={200}
                max={380}
                step={10}
                value={settings.width}
                onChange={(event) => updateSide(side, { width: Number(event.target.value) })}
              />
            </label>
            <fieldset>
              <legend>Choose panels</legend>
              {(Object.keys(PLAY_PANELS) as PlayPanel[]).map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={settings.panels.includes(id)}
                    onChange={(event) =>
                      updateSide(side, {
                        panels: event.target.checked
                          ? [...settings.panels, id]
                          : settings.panels.filter((panel) => panel !== id),
                      })
                    }
                  />
                  {PLAY_PANELS[id]}
                </label>
              ))}
            </fieldset>
          </div>
        )}
        {!settings.panels.length && <p className="helper-text">Choose panels with Customize.</p>}
        {settings.panels.map((id, index) => (
          <section className="card play-panel" key={id}>
            <header>
              <h2 className="card-title">{PLAY_PANELS[id]}</h2>
              {editing && (
                <div className="play-reorder">
                  {([-1, 1] as const).map((direction) => (
                    <button
                      className="btn btn-ghost"
                      key={direction}
                      disabled={index + direction < 0 || index + direction >= settings.panels.length}
                      aria-label={`Move ${PLAY_PANELS[id]} ${direction === -1 ? "up" : "down"}`}
                      onClick={() => {
                        const panels = [...settings.panels];
                        [panels[index], panels[index + direction]] = [panels[index + direction]!, panels[index]!];
                        updateSide(side, { panels });
                      }}
                    >
                      {direction === -1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </header>
            {panel(id)}
          </section>
        ))}
      </aside>
    );
  };

  return (
    <div
      className={`play-mode${host.gameOnly ? " play-mode-game-only" : ""}${host.gameOnly && !gameOnly.autoHide ? " play-mode-game-only-pinned" : ""}${peek ? ` play-peek-${peek}` : ""}`}
    >
      <header className="play-toolbar">
        <button className="btn btn-ghost" onClick={onExit}>
          <ArrowLeft size={16} />
          Back to MAGI
        </button>
        <div className="play-brand">
          <img className="play-brand-logo" src={magiLogo} alt="MAGI" />
          <div>
            <strong>PLAY MODE</strong>
            <small>Your game. Your corner.</small>
          </div>
        </div>
        <span className={`play-status ${running ? "is-active" : ""}`}>
          {host.status.phase === "launching" ? "Launching Melee" : running ? "Melee running" : "Ready to play"}
        </span>
        <div className="play-toolbar-actions">
          <button
            className="btn"
            disabled={host.status.phase !== "running"}
            title="Fullscreen Melee · Ctrl+Shift+F11 returns to your layout"
            onClick={() => void host.enterGameOnly()}
          >
            <Maximize size={15} /> Fullscreen
          </button>
          <button className="btn" aria-pressed={editing} disabled={!ready} onClick={() => setEditing(!editing)}>
            <Settings2 size={15} />
            {editing ? "Done" : "Customize"}
          </button>
          {ready && cornermanEnabled && (
            <button className="btn" disabled={cornerBusy} onClick={() => void startCorner()}>
              {cornerBusy ? "Please wait…" : corner?.active ? "Stop live session" : "Start live session"}
            </button>
          )}
          <button
            className={`btn ${running ? "" : "btn-primary"}`}
            disabled={!ready || host.busy}
            onClick={() => void (running ? host.stop() : launch())}
          >
            {running ? <Square size={14} /> : <Play size={14} />}
            {running ? "Stop Game" : "Launch Melee"}
          </button>
        </div>
      </header>
      {editing && (
        <div className="play-customize-bar">
          <div className="play-sidebar-toggles">
            {" "}
            <button
              className="btn btn-ghost"
              aria-label="Toggle left sidebar"
              aria-pressed={!layout.left.collapsed}
              disabled={!ready}
              onClick={() => updateSide("left", { collapsed: !layout.left.collapsed })}
            >
              <PanelLeft size={15} /> Left panels
            </button>
            <button
              className="btn btn-ghost"
              aria-label="Toggle right sidebar"
              aria-pressed={!layout.right.collapsed}
              disabled={!ready}
              onClick={() => updateSide("right", { collapsed: !layout.right.collapsed })}
            >
              <PanelRight size={15} /> Right panels
            </button>
          </div>
          <span>Starting layout</span>
          {(["minimal", "coaching", "practice"] as PlayPreset[]).map((preset) => (
            <button
              className="btn btn-ghost"
              key={preset}
              onClick={() =>
                setLayout((current) => ({ ...playPreset(preset), gameOnlyPanelMode: current.gameOnlyPanelMode }))
              }
            >
              {preset === "minimal" ? "Minimal" : preset === "coaching" ? "Live Coaching" : "Practice"}
            </button>
          ))}
          <label className="play-game-only-preference">
            Fullscreen panels
            <select
              value={layout.gameOnlyPanelMode}
              onChange={(event) =>
                setLayout((current) => ({
                  ...current,
                  gameOnlyPanelMode: event.target.value === "auto-hide" ? "auto-hide" : "visible",
                }))
              }
            >
              <option value="visible">Keep visible in side bars</option>
              <option value="auto-hide">Auto-hide until hovered</option>
            </select>
          </label>
          <small>Choose and reorder panels in either sidebar. {saveState}</small>
        </div>
      )}
      {liveSetup && cornermanEnabled && (
        <div className="play-live-setup" role="status">
          <span>{liveSetup.issue || `Replay source: ${liveSetup.replayFolder}`}</span>
          <span>{liveSetup.aiMessage}</span>
          {liveSetup.issue && (
            <button className="btn btn-ghost" onClick={openPlaySettings}>
              Play Mode settings
            </button>
          )}
        </div>
      )}
      {(error || host.error) && (
        <div className="play-error-banner" role="alert">
          {error || host.error}
          <button className="btn btn-ghost" onClick={openPlaySettings}>
            Play Mode settings
          </button>
        </div>
      )}
      <main
        className="play-workspace"
        ref={workspace}
        style={
          {
            "--play-game-only-gutter": `${gameOnly.gutter}px`,
            "--play-left": `${layout.left.collapsed ? 0 : layout.left.width}px`,
            "--play-right": `${layout.right.collapsed ? 0 : layout.right.width}px`,
            "--play-peek-left": `${layout.left.width}px`,
            "--play-peek-right": `${layout.right.width}px`,
          } as CSSProperties
        }
      >
        {sidebar("left")}
        <section className="play-center" aria-label="Melee game">
          <div className="play-center-head">
            <span>SUPER SMASH BROS. MELEE</span>
            <span>{corner?.active ? "Live tracking on" : "Live tracking off"}</span>
          </div>
          <div className="play-game-area" ref={area}>
            <div className="play-game-surface" ref={host.stageRef} style={{ width: size.width, height: size.height }}>
              {!running && (
                <div className="play-empty">
                  <Gamepad2 size={52} strokeWidth={1} />
                  <h1>Your next game starts here.</h1>
                  <p>Launch Slippi Melee, settle in, and keep your corner close.</p>
                  <button className="btn btn-primary" disabled={!ready || host.busy} onClick={() => void launch()}>
                    <Play size={16} />
                    Launch Melee
                  </button>
                  <button className="btn btn-ghost" onClick={openPlaySettings}>
                    Play Mode settings
                  </button>
                  <small>Windows hosting · use your own Melee image</small>
                </div>
              )}
              {host.status.phase === "launching" && (
                <div className="play-empty" role="status">
                  <div className="spinner" />
                  <p>Waiting for Dolphin’s game window…</p>
                </div>
              )}
            </div>
          </div>
          <footer className="play-center-foot">
            <span>
              Fullscreen: panels stay in the side bars. Change auto-hide in Customize · Ctrl+Shift+F11 returns.
            </span>
            <small role="status">{saveState}</small>
          </footer>
        </section>
        {sidebar("right")}
      </main>
    </div>
  );
}
