import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { DURATION_MS } from "../../motion";
import { easeOutQuart, formatCountFrame, kpiFlashTone, parseCountTarget, type KpiTone } from "./countUp";

interface KPIProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  subTone?: KpiTone;
  /**
   * The figure is not known yet. Shows the label over shimmering placeholders
   * instead of a value, so a "0" that was never measured is never on screen.
   */
  loading?: boolean;
}

/**
 * Counts a plain figure up to `final` and returns the interim text to show, or
 * null when the caller should render `final` itself (not counting, finished,
 * reduced motion, or the text is not a single plain figure). The first reveal
 * counts from zero over --duration-count; a later change counts from the
 * previous figure over --duration-slow. A null `final` (still loading) keeps
 * the last figure in mind, so the next one counts on from it.
 */
function useCountUp(final: string | null): string | null {
  const reduceMotion = useReducedMotion();
  const [interim, setInterim] = useState<string | null>(null);
  /** The number currently on screen; null until a countable figure has been shown. */
  const shown = useRef<number | null>(null);
  /** True once a figure has finished its first reveal; later changes are updates. */
  const settled = useRef(false);

  // Layout effect: the first interim frame must be on screen before the browser
  // paints, or the final figure would flash for a frame before counting starts.
  useLayoutEffect(() => {
    if (final == null) {
      setInterim(null);
      return;
    }
    const target = parseCountTarget(final);
    if (!target) {
      shown.current = null;
      settled.current = false;
      setInterim(null);
      return;
    }
    const from = shown.current ?? 0;
    if (reduceMotion || from === target.value) {
      shown.current = target.value;
      settled.current = true;
      setInterim(null);
      return;
    }
    const duration = settled.current ? DURATION_MS.slow : DURATION_MS.count;
    const start = performance.now();
    let frame = 0;
    shown.current = from;
    setInterim(formatCountFrame(target, from, 0));
    const tick = (now: number) => {
      const progress = (now - start) / duration;
      if (progress >= 1) {
        shown.current = target.value;
        settled.current = true;
        setInterim(null);
        return;
      }
      // Track the interim number so a change mid-count continues from what is on screen.
      shown.current = from + (target.value - from) * easeOutQuart(progress);
      setInterim(formatCountFrame(target, from, progress));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // A cancelled run leaves `settled` false, so StrictMode's second pass still counts from zero.
    return () => cancelAnimationFrame(frame);
  }, [final, reduceMotion]);

  return interim;
}

export function KPI({ label, value, sub, subTone = "neutral", loading = false }: KPIProps) {
  const subColor = subTone === "good" ? "var(--win)" : subTone === "bad" ? "var(--loss)" : "var(--text-secondary)";
  const text = !loading && (typeof value === "string" || typeof value === "number") ? String(value) : null;
  const interim = useCountUp(text);

  // Live change: when a figure that is already on screen changes, the tile's
  // edge lights once in the color of its current standing, the same one the sub
  // line uses (motion.css). It does not claim the change itself was good or bad.
  // Neutral figures do not flash.
  const previousText = useRef<string | null>(null);
  const [flash, setFlash] = useState<"win" | "loss" | null>(null);
  useEffect(() => {
    if (text == null) return;
    const tone = kpiFlashTone(previousText.current, text, subTone);
    previousText.current = text;
    if (tone) setFlash(tone);
  }, [text, subTone]);

  if (loading) {
    return (
      <div className="kpi" aria-busy="true">
        <div className="kpi-label">{label}</div>
        <span className="anim-shimmer skeleton-line kpi-skeleton-value" aria-hidden="true" />
        <span className="anim-shimmer skeleton-line kpi-skeleton-sub" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <div
      className={flash ? `kpi kpi-flash-${flash}` : "kpi"}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setFlash(null);
      }}
    >
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {interim != null ? (
          <>
            {/* Assistive tech reads the real figure from the first frame; the counting digits are visual only. */}
            <span aria-hidden="true">{interim}</span>
            <span className="sr-only">{text}</span>
          </>
        ) : (
          value
        )}
      </div>
      {sub !== undefined && (
        <div className="kpi-sub" style={{ color: subColor }}>
          {sub}
        </div>
      )}
    </div>
  );
}
