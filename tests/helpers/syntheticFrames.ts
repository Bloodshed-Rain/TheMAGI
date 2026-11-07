import type { ConversionType, FramesType, PostFrameUpdateType } from "@slippi/slippi-js/node";

export type PostPatch = Partial<PostFrameUpdateType>;

/** Build a FramesType from a sparse { frame: { playerIndex: post fields } } map. */
export function framesWithPosts(entries: Record<number, Record<number, PostPatch>>): FramesType {
  const frames: FramesType = {};
  for (const [frameKey, playersForFrame] of Object.entries(entries)) {
    const frame = Number(frameKey);
    frames[frame] = {
      frame,
      start: undefined,
      players: Object.fromEntries(
        Object.entries(playersForFrame).map(([playerIndex, post]) => [
          Number(playerIndex),
          {
            pre: { frame, playerIndex: Number(playerIndex) } as never,
            post: { frame, playerIndex: Number(playerIndex), ...post } as PostFrameUpdateType,
          },
        ]),
      ),
      followers: {},
      items: [],
    } as never;
  }
  return frames;
}

/**
 * Build a dense frame range where both players hold the given post fields,
 * then apply per-frame overrides. Keeps detectors that walk every frame
 * (FIRST_PLAYABLE..lastFrame) from skipping gaps.
 */
export function denseFrames(
  from: number,
  to: number,
  base: Record<number, PostPatch>,
  overrides: Record<number, Record<number, PostPatch>> = {},
): FramesType {
  const entries: Record<number, Record<number, PostPatch>> = {};
  for (let f = from; f <= to; f++) {
    const perPlayer: Record<number, PostPatch> = {};
    for (const [idx, post] of Object.entries(base)) {
      perPlayer[Number(idx)] = { ...post, ...(overrides[f]?.[Number(idx)] ?? {}) };
    }
    entries[f] = perPlayer;
  }
  return framesWithPosts(entries);
}

export function conversion(overrides: Partial<ConversionType>): ConversionType {
  return {
    playerIndex: 1,
    lastHitBy: 0,
    startFrame: 100,
    endFrame: 300,
    startPercent: 30,
    currentPercent: 70,
    endPercent: 70,
    didKill: false,
    openingType: "neutral-win",
    moves: [],
    ...overrides,
  } as ConversionType;
}

export function move(moveId: number, frame: number, damage = 10, playerIndex = 0) {
  return { playerIndex, frame, moveId, hitCount: 1, damage };
}
