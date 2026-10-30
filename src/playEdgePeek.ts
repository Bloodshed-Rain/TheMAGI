export type PlayPeekSide = "left" | "right" | null;
export interface PlayCursor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A short dwell avoids accidental reveals; a grace period lets the pointer
 * cross into the revealed panel without flickering as the game resizes. */
export class PlayEdgePeek {
  private side: PlayPeekSide = null;
  private candidate: PlayPeekSide = null;
  private candidateSince = 0;
  private awaySince: number | null = null;
  update(cursor: PlayCursor | null, widths: { left: number; right: number }, now: number): PlayPeekSide {
    if (!cursor || cursor.x < 0 || cursor.y < 0 || cursor.x >= cursor.width || cursor.y >= cursor.height) {
      this.side = this.candidate = null;
      this.awaySince = null;
      return null;
    }
    const edge = cursor.x <= 2 ? "left" : cursor.x >= cursor.width - 3 ? "right" : null;
    if (edge !== this.candidate) {
      this.candidate = edge;
      this.candidateSince = now;
    }
    if (edge && now - this.candidateSince >= 150) {
      this.side = edge;
      this.awaySince = null;
    }
    const inside =
      this.side === "left"
        ? cursor.x <= widths.left + 24
        : this.side === "right"
          ? cursor.x >= cursor.width - widths.right - 24
          : false;
    if (inside) this.awaySince = null;
    else if (this.side) {
      this.awaySince ??= now;
      if (now - this.awaySince >= 350) this.side = null;
    }
    return this.side;
  }
}
