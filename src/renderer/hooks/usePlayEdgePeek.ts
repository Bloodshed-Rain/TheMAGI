import { useLayoutEffect, useState } from "react";
import { PlayEdgePeek, type PlayPeekSide } from "../../playEdgePeek";

export function usePlayEdgePeek(active: boolean, left: number, right: number): PlayPeekSide {
  const [side, setSide] = useState<PlayPeekSide>(null);
  useLayoutEffect(() => {
    setSide(null);
    if (!active) return;
    const tracker = new PlayEdgePeek();
    return window.clippi.onPlayCursor((cursor) => {
      setSide(tracker.update(cursor, { left, right }, performance.now()));
    });
  }, [active, left, right]);
  return active ? side : null;
}
