import { applyTheme, type Theme } from "./themes";

export interface RevealOrigin {
  x: number;
  y: number;
}

/**
 * Radius of the circle that, centered on (x, y), exactly covers a
 * width × height viewport: the distance to the farthest corner.
 */
export function revealRadius(x: number, y: number, width: number, height: number): number {
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
}

/**
 * Where a theme choice came from: the pointer position for a mouse or touch
 * click, the center of the control for a keyboard activation (which reports
 * no coordinates).
 */
export function revealOriginFromClick(
  click: { clientX: number; clientY: number; detail: number },
  controlRect: { left: number; top: number; width: number; height: number },
): RevealOrigin {
  if (click.detail === 0) {
    return { x: controlRect.left + controlRect.width / 2, y: controlRect.top + controlRect.height / 2 };
  }
  return { x: click.clientX, y: click.clientY };
}

/**
 * Apply a theme. With an origin, the new theme opens as a circle from that
 * point (View Transitions API; styles in motion.css) instead of every color
 * changing at once. Falls back to a plain `applyTheme` when there is no
 * origin, the theme is already active, the OS asks for reduced motion, the API
 * is missing, or a replay is embedded: the Dolphin window is not part of the
 * page, so it would sit outside the wipe.
 */
export function applyThemeWithReveal(theme: Theme, origin: RevealOrigin | null): void {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const replayEmbedded = document.querySelector(".replay-embed, .replay-player-modal") != null;
  if (
    !origin ||
    reduceMotion ||
    replayEmbedded ||
    typeof document.startViewTransition !== "function" ||
    root.getAttribute("data-theme") === theme.id
  ) {
    applyTheme(theme);
    return;
  }

  root.style.setProperty("--reveal-x", `${origin.x}px`);
  root.style.setProperty("--reveal-y", `${origin.y}px`);
  root.style.setProperty("--reveal-r", `${revealRadius(origin.x, origin.y, window.innerWidth, window.innerHeight)}px`);
  // Freeze CSS color transitions (body's 0.5s cross-fade among them) for the
  // duration: the new snapshot is live, so they would replay inside the wipe.
  root.classList.add("theme-revealing");
  const done = () => root.classList.remove("theme-revealing");
  try {
    document.startViewTransition(() => applyTheme(theme)).finished.then(done, done);
  } catch {
    done();
    applyTheme(theme);
  }
}
