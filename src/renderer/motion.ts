/**
 * TypeScript mirror of the motion tokens in styles/tokens.css, for framer-motion
 * props and requestAnimationFrame code that cannot read a CSS variable.
 * tests/motion.test.ts fails if the two drift apart: change a value in both places.
 */

/** Durations in milliseconds, keyed like `--duration-<key>`. */
export const DURATION_MS = {
  fast: 120,
  base: 150,
  exit: 180,
  moderate: 250,
  slow: 400,
  theme: 500,
  impact: 520,
  reveal: 600,
  count: 900,
} as const;

/** `--stagger`: delay between siblings entering together. */
export const STAGGER_MS = 40;

/** Cubic-bezier control points, keyed like `--ease-<key>`. */
export const EASE = {
  /** Default for anything that moves: fast settle, no overshoot. */
  spring: [0.22, 1, 0.36, 1],
  /** Fades, wipes, color changes. */
  out: [0, 0, 0.2, 1],
  /** Exits only. */
  in: [0.4, 0, 1, 1],
  /** The one overshoot in the app, reserved for stock-taking events. */
  impact: [0.2, 1.3, 0.3, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** framer-motion takes seconds. */
export const seconds = (ms: number): number => ms / 1000;
