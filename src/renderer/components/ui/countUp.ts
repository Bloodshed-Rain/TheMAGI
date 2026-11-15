/**
 * Count-up for KPI figures. The rule that matters: the animation only ever
 * shows interpolated numbers on the way, and the caller renders the original
 * string once it ends, so a figure can never settle on a rounded or
 * re-formatted value.
 */

export interface CountTarget {
  /** The number the text states. */
  value: number;
  /** Digits after the decimal point in the text. */
  decimals: number;
  /** True when the integer part uses thousands separators ("1,204"). */
  grouped: boolean;
  /** "%" or "x" when the text ends in one, otherwise "". */
  suffix: string;
}

// A plain non-negative number, optionally grouped, with an optional % or x.
// Anything else ("12-4", "3:42", "taken 2 · missed 1", "n/a") is not counted:
// animating part of a record or a time would show values that were never measured.
const COUNTABLE = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(%|x)?$/;

/** Parse a KPI string into a count-up target, or null if it is not a single plain figure. */
export function parseCountTarget(text: string): CountTarget | null {
  const m = COUNTABLE.exec(text.trim());
  if (!m) return null;
  const whole = m[1]!;
  const fraction = m[2] ?? "";
  const value = Number(whole.replace(/,/g, "") + (fraction ? `.${fraction}` : ""));
  if (!Number.isFinite(value)) return null;
  return { value, decimals: fraction.length, grouped: whole.includes(","), suffix: m[3] ?? "" };
}

export type KpiTone = "good" | "bad" | "neutral";

/**
 * Which color a KPI tile flashes when its figure changes while on screen:
 * "win" for a good tone, "loss" for a bad one. The color is the figure's
 * current standing (the same one its sub line is drawn in), not the direction
 * of the change: a KPI does not know whether up is better. No flash when there
 * was no figure before (first reveal), when the text did not change, or when
 * the tone is neutral: a figure with no stated standing must not be painted as
 * good or bad.
 */
export function kpiFlashTone(before: string | null, after: string | null, tone: KpiTone): "win" | "loss" | null {
  if (before == null || after == null || before === after) return null;
  if (tone === "good") return "win";
  if (tone === "bad") return "loss";
  return null;
}

/** Quartic ease-out: fast start, long settle, no overshoot (a figure must never pass its target). */
export function easeOutQuart(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return 1 - Math.pow(1 - p, 4);
}

/**
 * The text to show at `progress` (0..1) while counting from `from` to the
 * target, formatted like the target (same decimals, grouping and suffix).
 */
export function formatCountFrame(target: CountTarget, from: number, progress: number): string {
  const current = from + (target.value - from) * easeOutQuart(progress);
  const fixed = current.toFixed(target.decimals);
  if (!target.grouped) return fixed + target.suffix;
  const [whole, fraction] = fixed.split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (fraction ? `${grouped}.${fraction}` : grouped) + target.suffix;
}
