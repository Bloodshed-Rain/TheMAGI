import type { GameOnlyPanelMode } from "./playMode";
export const MIN_GAME_ONLY_PANEL_WIDTH = 160;
/** Measure only the unused space around the largest 4:3 game, independently
 * of panel presence. Pinned panels must never steal pixels from the game. */
export function gameOnlyLayout(width: number, height: number, mode: GameOnlyPanelMode) {
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const h = Number.isFinite(height) ? Math.max(0, height) : 0;
  const gameWidth = Math.min(w, (h * 4) / 3);
  const gutter = Math.max(0, (w - gameWidth) / 2);
  return {
    gameWidth,
    gameHeight: (gameWidth * 3) / 4,
    gutter,
    autoHide: mode === "auto-hide" || gutter < MIN_GAME_ONLY_PANEL_WIDTH,
  };
}
