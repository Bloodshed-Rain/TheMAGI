/**
 * Shared timestamp utilities for coaching output.
 * Converts [M:SS] timestamps into clickable in-app replay player launchers.
 */
import type { Components } from "react-markdown";
import { useReplayPlayerStore } from "../stores/useReplayPlayerStore";

const FPS = 60;
const FIRST_PLAYABLE = -123; // Frames.FIRST_PLAYABLE from slippi-js

/** Convert a "M:SS" timestamp string back to a game frame number */
export function timestampToFrame(ts: string): number {
  const parts = ts.split(":");
  if (parts.length !== 2) return 0;
  const minutes = parseInt(parts[0]!, 10);
  const seconds = parseInt(parts[1]!, 10);
  if (isNaN(minutes) || isNaN(seconds)) return 0;
  return (minutes * 60 + seconds) * FPS + FIRST_PLAYABLE;
}

/** Pre-process coaching markdown to convert [M:SS] timestamps into inline code spans */
export function injectTimestampLinks(text: string): string {
  return text.replace(/\[(\d{1,2}:\d{2})\]/g, "`ts:$1`");
}

/**
 * Create react-markdown components that render timestamp code spans as clickable buttons.
 *
 * When `onSeek` is provided, clicks call it instead of opening the global ReplayPlayer.
 * Used by GameTheater to route timestamp clicks to its inline embed.
 */
export function makeTimestampComponents(replayPath: string, onSeek?: (frame: number) => void): Components {
  return {
    code: ({ children }) => {
      const text = String(children);
      const match = text.match(/^ts:(\d{1,2}:\d{2})$/);
      if (match) {
        const ts = match[1]!;
        const frame = timestampToFrame(ts);
        const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (onSeek) {
            onSeek(frame);
          } else {
            useReplayPlayerStore.getState().openPlayer(replayPath, frame, undefined, undefined);
          }
        };
        return (
          <span
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick(e);
              }
            }}
            className="timestamp-link"
            title={`Open replay at ${ts}`}
          >
            ▶ {ts}
          </span>
        );
      }
      return <code>{children}</code>;
    },
    a: ({ href, children }) => {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.preventDefault()}>
          {children}
        </a>
      );
    },
  };
}
