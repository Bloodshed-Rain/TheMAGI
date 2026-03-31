import { useState, useEffect, useRef } from "react";

/**
 * Returns a function that generates stagger animation delays for list items.
 */
export function useStagger(delayMs: number = 40) {
  return (index: number): React.CSSProperties => ({
    animationDelay: `${index * delayMs}ms`,
  });
}

/**
 * Simulates a typewriter effect, revealing text character by character.
 * Used for AI streaming responses.
 */
export function useTypewriter(
  text: string,
  charsPerTick: number = 2,
  enabled: boolean = true,
): {
  displayText: string;
  isTyping: boolean;
} {
  const [index, setIndex] = useState(enabled ? 0 : text.length);
  const prevText = useRef(text);

  useEffect(() => {
    if (text !== prevText.current) {
      prevText.current = text;
      setIndex(enabled ? 0 : text.length);
    }
  }, [text, enabled]);

  useEffect(() => {
    if (!enabled || index >= text.length) return;

    const id = requestAnimationFrame(() => {
      setIndex((i) => Math.min(i + charsPerTick, text.length));
    });

    return () => cancelAnimationFrame(id);
  }, [index, text, charsPerTick, enabled]);

  return {
    displayText: text.slice(0, index),
    isTyping: index < text.length,
  };
}

/**
 * Animated counter that counts up from 0 to target with easing.
 */
export function useCountUp(target: number, duration: number = 1000) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/**
 * @deprecated No-op shim kept for backward compatibility during migration.
 * Pages that import this will just get the plain text back immediately.
 * Remove imports as pages are individually rewritten.
 */
export function useGlitchText(text: string, _durationMs: number = 600, _enabled: boolean = true) {
  return text;
}

/**
 * @deprecated No-op shim. Remove imports as pages are rewritten.
 */
export function useUptime() {
  return "00:00:00";
}

/** Format a game timestamp as a short localized date+time, e.g. "Mar 29, 7:30 PM" */
export function formatGameDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
