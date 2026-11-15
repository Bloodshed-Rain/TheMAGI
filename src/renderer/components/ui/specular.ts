/** Most a specular card tilts toward the pointer, in degrees, on each axis. */
export const SPECULAR_MAX_TILT_DEG = 3;

export interface SpecularState {
  /** Pointer position inside the card, in px from its top-left corner (clamped to the card). */
  mx: number;
  my: number;
  /** Tilt in degrees. Positive rotateX lifts the top edge toward the viewer; positive rotateY lifts the right edge. */
  rotateX: number;
  rotateY: number;
}

/** Cards up to this long on their longer side tilt the full amount; longer ones tilt proportionally less. */
export const SPECULAR_FULL_TILT_SIZE_PX = 480;

/**
 * Most a card of this size may tilt. A fixed angle moves the edges of a
 * page-wide card several times farther than those of a small one, so the limit
 * shrinks with the longer side to keep edge travel about the same.
 */
export function tiltLimitForSize(width: number, height: number): number {
  const longer = Math.max(width, height);
  if (!(longer > 0)) return 0;
  return SPECULAR_MAX_TILT_DEG * Math.min(1, SPECULAR_FULL_TILT_SIZE_PX / longer);
}

/**
 * Where the light sits and how far the plate tilts for a pointer at (x, y)
 * inside a card of the given size. The card tilts toward the pointer: zero at
 * the center, `maxTilt` at an edge. A card with no area does not tilt.
 */
export function specularFromPointer(
  width: number,
  height: number,
  x: number,
  y: number,
  maxTilt: number = SPECULAR_MAX_TILT_DEG,
): SpecularState {
  if (!(width > 0) || !(height > 0)) return { mx: 0, my: 0, rotateX: 0, rotateY: 0 };
  const mx = Math.min(width, Math.max(0, x));
  const my = Math.min(height, Math.max(0, y));
  return {
    mx,
    my,
    rotateX: (0.5 - my / height) * 2 * maxTilt,
    rotateY: (mx / width - 0.5) * 2 * maxTilt,
  };
}
