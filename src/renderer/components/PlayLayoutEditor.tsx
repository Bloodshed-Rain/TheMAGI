import { useState } from "react";
import { PanelLeft, PanelRight, X } from "lucide-react";
import {
  PLAY_PANELS,
  PLAY_PANEL_CATEGORIES,
  PLAY_PANEL_DEFS,
  PLAY_PRESETS,
  MAX_PLAY_SCENE_NAME,
  applyPlayArrangement,
  deletePlayScene,
  placePlayPanel,
  playPanelSide,
  playPreset,
  playSceneNameError,
  removePlayPanel,
  samePlayArrangement,
  savePlayScene,
  type PlayLayout,
  type PlayPreset,
  type PlaySide,
} from "../../playMode";
import { MIN_GAME_ONLY_PANEL_WIDTH, gameOnlyLayout } from "../../playGameOnlyLayout";
import type { PlayPanelGrab } from "../hooks/usePlayPanelDrag";
import { Pill } from "./ui/Pill";

interface PlayLayoutEditorProps {
  layout: PlayLayout;
  setLayout: (update: (current: PlayLayout) => PlayLayout) => void;
  ready: boolean;
  saveState: string;
  /** Pointer handlers that let a tray card be dragged into a sidebar. */
  grab: PlayPanelGrab;
}

/** Customize strip for Play Mode: scenes, sidebar switches and the module tray.
 *  It sits above the workspace because nothing can be drawn over the hosted
 *  game window. */
export function PlayLayoutEditor({ layout, setLayout, ready, saveState, grab }: PlayLayoutEditorProps) {
  const [sceneName, setSceneName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const nameError = playSceneNameError(layout, sceneName);
  const replaces = layout.scenes.some((scene) => scene.name.toLowerCase() === sceneName.trim().toLowerCase());
  const fullscreen = gameOnlyLayout(window.screen.width, window.screen.height, "visible");
  const toggleSide = (side: PlaySide) =>
    setLayout((current) => ({ ...current, [side]: { ...current[side], collapsed: !current[side].collapsed } }));

  return (
    <div className="play-customize">
      <div className="play-customize-bar">
        <span className="play-customize-label">Scenes</span>
        <div className="play-scenes">
          {(Object.keys(PLAY_PRESETS) as PlayPreset[]).map((preset) => (
            <Pill
              key={preset}
              active={samePlayArrangement(layout, playPreset(preset))}
              onClick={() => setLayout((current) => applyPlayArrangement(current, playPreset(preset)))}
            >
              {PLAY_PRESETS[preset]}
            </Pill>
          ))}
          {layout.scenes.map((scene) =>
            deleting === scene.name ? (
              <span className="play-scene-confirm" key={scene.name}>
                Delete “{scene.name}”?
                <button
                  className="btn btn-danger btn-icon-small"
                  onClick={() => {
                    setLayout((current) => deletePlayScene(current, scene.name));
                    setDeleting(null);
                  }}
                >
                  Delete
                </button>
                <button className="btn btn-ghost btn-icon-small" onClick={() => setDeleting(null)}>
                  Keep
                </button>
              </span>
            ) : (
              <span className="play-scene" key={scene.name}>
                <Pill
                  active={samePlayArrangement(layout, scene.arrangement)}
                  onClick={() => setLayout((current) => applyPlayArrangement(current, scene.arrangement))}
                >
                  {scene.name}
                </Pill>
                <button
                  className="btn btn-ghost btn-icon-small"
                  aria-label={`Delete scene ${scene.name}`}
                  title="Delete scene"
                  onClick={() => setDeleting(scene.name)}
                >
                  <X size={12} />
                </button>
              </span>
            ),
          )}
        </div>
        <form
          className="play-scene-save"
          onSubmit={(event) => {
            event.preventDefault();
            if (nameError) return;
            setLayout((current) => savePlayScene(current, sceneName));
            setSceneName("");
          }}
        >
          <label className="form-field">
            <span className="sr-only">Scene name</span>
            <input
              value={sceneName}
              maxLength={MAX_PLAY_SCENE_NAME}
              placeholder="Name this layout"
              disabled={!ready}
              aria-describedby="play-scene-hint"
              onChange={(event) => setSceneName(event.target.value)}
            />
          </label>
          <button className="btn" disabled={!ready || nameError !== null}>
            {replaces ? "Replace scene" : "Save scene"}
          </button>
          <small id="play-scene-hint" role="status">
            {sceneName.trim() ? nameError : ""}
          </small>
        </form>
        <div className="play-sidebar-toggles">
          <button
            className="btn btn-ghost"
            aria-label="Toggle left sidebar"
            aria-pressed={!layout.left.collapsed}
            disabled={!ready}
            onClick={() => toggleSide("left")}
          >
            <PanelLeft size={15} /> Left panels
          </button>
          <button
            className="btn btn-ghost"
            aria-label="Toggle right sidebar"
            aria-pressed={!layout.right.collapsed}
            disabled={!ready}
            onClick={() => toggleSide("right")}
          >
            <PanelRight size={15} /> Right panels
          </button>
        </div>
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
        <small className="play-customize-status">
          {fullscreen.gutter >= MIN_GAME_ONLY_PANEL_WIDTH
            ? `Fullscreen side bars on this display: ${Math.round(fullscreen.gutter)}px each.`
            : "This display has no room beside the game in fullscreen, so panels appear on edge hover."}{" "}
          {saveState}
        </small>
      </div>
      <ul className="play-module-tray" aria-label="Modules">
        {PLAY_PANEL_DEFS.map((def) => {
          const side = playPanelSide(layout, def.id);
          return (
            <li key={def.id} className={`play-module-card${side ? " is-placed" : ""}`} {...(ready ? grab(def.id) : {})}>
              <div className="play-module-head">
                <strong>{PLAY_PANELS[def.id]}</strong>
                <span>{PLAY_PANEL_CATEGORIES[def.category]}</span>
              </div>
              <p>{def.description}</p>
              {def.needsLive && <small>Needs a live session</small>}
              <div className="play-module-actions">
                {side ? (
                  <>
                    <span>In the {side} sidebar</span>
                    <button
                      className="btn btn-ghost btn-icon-small"
                      aria-label={`Remove ${PLAY_PANELS[def.id]} from the ${side} sidebar`}
                      disabled={!ready}
                      onClick={() => setLayout((current) => removePlayPanel(current, def.id))}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  (["left", "right"] as const).map((target) => (
                    <button
                      className="btn btn-icon-small"
                      key={target}
                      aria-label={`Add ${PLAY_PANELS[def.id]} to the ${target} sidebar`}
                      disabled={!ready}
                      onClick={() => setLayout((current) => placePlayPanel(current, def.id, target))}
                    >
                      Add {target}
                    </button>
                  ))
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
