import { HTMLAttributes } from "react";

export type GameResult = "win" | "loss" | "draw";

/**
 * Outcome dot. Shape (not just color) carries the result: win = filled,
 * loss = ring, draw = caution (see components.css). Defaults to role="img"
 * with an accessible name so standalone use is screen-reader legible; callers
 * whose parent already labels the outcome can pass aria-hidden via `...rest`.
 */
export function ResultDot({
  result,
  latest = false,
  ...rest
}: {
  result: GameResult;
  /** The newest game in a strip: rings once after it pops in (motion.css). */
  latest?: boolean;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      role="img"
      aria-label={result}
      className={latest ? `result-dot ${result} is-latest` : `result-dot ${result}`}
      {...rest}
    />
  );
}
