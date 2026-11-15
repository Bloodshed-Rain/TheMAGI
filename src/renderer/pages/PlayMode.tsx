import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Gamepad2,
  GripVertical,
  Settings2,
  Square,
  Play,
  Maximize,
  X,
} from "lucide-react";
import Markdown from "react-markdown";
import {
  MAX_PLAY_SIDEBAR_WIDTH,
  MIN_PLAY_SIDEBAR_WIDTH,
  PLAY_PANELS,
  clampPlaySidebarWidth,
  placePlayPanel,
  playPreset,
  removePlayPanel,
  resolvePlayLayout,
  type PlayLayout,
  type PlayPanel,
  type PlaySide,
  type PlaySidebar,
  type PlayCoachingSetup,
} from "../../playMode";
import { gameOnlyLayout } from "../../playGameOnlyLayout";
import { LIVE_STAT_DEFS, formatLiveStatValue } from "../../cornermanLiveStats";
import { usePlayHost } from "../hooks/usePlayHost";
import { usePlayEdgePeek } from "../hooks/usePlayEdgePeek";
import { usePlayPanelDrag } from "../hooks/usePlayPanelDrag";
import { useCornermanLiveStats } from "../hooks/useCornermanLiveStats";
import { useGlobalStore } from "../stores/useGlobalStore";
import { CornermanLiveAlerts } from "../components/CornermanLiveAlerts";
import { PlayLayoutEditor } from "../components/PlayLayoutEditor";
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

  const updateSide = (side: PlaySide, change: Partial<PlaySidebar>) =>
    setLayout((current) => ({ ...current, [side]: { ...current[side], ...change } }));
  // Arranging happens in the windowed layout only; fullscreen shows the result.
  const arranging = editing && !host.gameOnly;
  const { dragging, drop, grab, sidebarRef, ghostRef } = usePlayPanelDrag(arranging, (id, side, index) =>
    setLayout((current) => placePlayPanel(current, id, side, index)),
  );
  const resizer = (side: PlaySide) => {
    const width = layout[side].width;
    const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
    const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
    return (
      <div
        key={side}
        className={`play-resizer play-resizer-${side}`}
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={`Resize ${side} sidebar`}
        aria-valuemin={MIN_PLAY_SIDEBAR_WIDTH}
        aria-valuemax={MAX_PLAY_SIDEBAR_WIDTH}
        aria-valuenow={width}
        title="Drag to resize"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId) || !workspace.current) return;
          const rect = workspace.current.getBoundingClientRect();
          const next = clampPlaySidebarWidth(side === "left" ? event.clientX - rect.left : rect.right - event.clientX);
          if (next !== width) updateSide(side, { width: next });
        }}
        onKeyDown={(event) => {
          if (event.key !== grow && event.key !== shrink) return;
          event.preventDefault();
          updateSide(side, { width: clampPlaySidebarWidth(width + (event.key === grow ? 10 : -10)) });
        }}
      />
    );
  };
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
    const dropLine = (index: number) =>
      drop?.side === side && drop.index === index ? <div className="play-drop-line" aria-hidden="true" /> : null;
    return (
      <aside
        className={`play-sidebar play-sidebar-${side}${host.gameOnly && gameOnly.autoHide ? " play-sidebar-peek" : ""}${dragging ? " is-drop-target" : ""}`}
        aria-label={`${side} sidebar`}
        ref={sidebarRef(side)}
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
        {!settings.panels.length &&
          (arranging ? (
            <p className="play-drop-empty">Drag a module here, or use Add in the tray above.</p>
          ) : (
            <p className="helper-text">Choose modules with Customize.</p>
          ))}
        {settings.panels.map((id, index) => {
          const label = PLAY_PANELS[id];
          const folded = layout.collapsedPanels.includes(id);
          const other: PlaySide = side === "left" ? "right" : "left";
          return (
            <Fragment key={id}>
              {dropLine(index)}
              <section
                className={`card play-panel${folded ? " is-folded" : ""}${dragging === id ? " is-dragging" : ""}`}
              >
                <header className={arranging ? "is-draggable" : undefined} {...grab(id)}>
                  {arranging && <GripVertical className="play-grip" size={14} aria-hidden="true" />}
                  <h2 className="card-title">{label}</h2>
                  <button
                    className="btn btn-ghost btn-icon-small"
                    aria-expanded={!folded}
                    aria-label={`${folded ? "Expand" : "Fold"} ${label}`}
                    title={folded ? "Expand" : "Fold to title"}
                    onClick={() =>
                      setLayout((current) => ({
                        ...current,
                        collapsedPanels: folded
                          ? current.collapsedPanels.filter((panel) => panel !== id)
                          : [...current.collapsedPanels, id],
                      }))
                    }
                  >
                    {folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                </header>
                {arranging && (
                  <div className="play-panel-tools" role="group" aria-label={`Arrange ${label}`}>
                    <button
                      className="btn btn-ghost btn-icon-small"
                      disabled={index === 0}
                      aria-label={`Move ${label} up`}
                      title="Move up"
                      onClick={() => setLayout((current) => placePlayPanel(current, id, side, index - 1))}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon-small"
                      disabled={index === settings.panels.length - 1}
                      aria-label={`Move ${label} down`}
                      title="Move down"
                      onClick={() => setLayout((current) => placePlayPanel(current, id, side, index + 2))}
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon-small"
                      aria-label={`Move ${label} to the ${other} sidebar`}
                      title={`Move to the ${other} sidebar`}
                      onClick={() => setLayout((current) => placePlayPanel(current, id, other))}
                    >
                      <ArrowLeftRight size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon-small"
                      aria-label={`Remove ${label}`}
                      title="Remove"
                      onClick={() => setLayout((current) => removePlayPanel(current, id))}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
                {!folded && panel(id)}
              </section>
            </Fragment>
          );
        })}
        {dropLine(settings.panels.length)}
      </aside>
    );
  };

  return (
    <div
      className={`play-mode${dragging ? " is-dragging-module" : ""}${host.gameOnly ? " play-mode-game-only" : ""}${host.gameOnly && !gameOnly.autoHide ? " play-mode-game-only-pinned" : ""}${peek ? ` play-peek-${peek}` : ""}`}
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
        <PlayLayoutEditor layout={layout} setLayout={setLayout} ready={ready} saveState={saveState} grab={grab} />
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
        {arranging && (["left", "right"] as const).filter((side) => !layout[side].collapsed).map(resizer)}
      </main>
      {dragging && (
        <div className="play-drag-ghost" ref={ghostRef} aria-hidden="true">
          {PLAY_PANELS[dragging]}
        </div>
      )}
    </div>
  );
}
