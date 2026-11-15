// Live controller input for Play Mode. Pure module with no runtime imports, so
// the main process and the renderer can both bundle it.

/**
 * One player's controller as the game read it on one frame: the fields of the
 * Slippi pre-frame update that describe the physical pad. Sticks are the
 * game's processed axes (-1 to 1), triggers are 0 to 1, and `physicalButtons`
 * is the raw button bitmask. A field is undefined only when the stream did
 * not carry it.
 */
export interface PlayInputSample {
  frame: number;
  playerIndex: number;
  physicalButtons: number | undefined;
  joystickX: number | undefined;
  joystickY: number | undefined;
  cStickX: number | undefined;
  cStickY: number | undefined;
  physicalLTrigger: number | undefined;
  physicalRTrigger: number | undefined;
}

export type PlayInputStatus =
  /** Melee is not running in Play Mode, or nothing is showing the display. */
  | { phase: "off" }
  /** This Dolphin has its spectator stream turned off, so there is nothing to read. */
  | { phase: "disabled" }
  | { phase: "connecting" }
  /** Connected to Dolphin; no game is in progress. */
  | { phase: "waiting" }
  /** A game is in progress and these are `playerIndex`'s inputs. */
  | { phase: "live"; playerIndex: number }
  /** A game is in progress but none of its players could be identified as the user. */
  | { phase: "unidentified" };

/** Samples sent to the display in one message. A longer backlog (joining a
 *  game in progress) is old news, so only its tail is sent. */
export const MAX_PLAY_INPUT_BATCH = 8;

/**
 * Collapse the samples that arrived since the last paint into one to draw.
 * Sticks and triggers are the newest sample's. Buttons are every button that
 * was down on ANY of the samples, so a press that began and ended between two
 * paints is still drawn once instead of vanishing. The next paint draws the
 * newest sample alone.
 */
export function mergePlayInputSamples(samples: readonly PlayInputSample[]): PlayInputSample | null {
  const latest = samples[samples.length - 1];
  if (!latest) return null;
  let buttons: number | undefined;
  for (const sample of samples)
    if (sample.physicalButtons !== undefined) buttons = (buttons ?? 0) | sample.physicalButtons;
  return { ...latest, physicalButtons: buttons };
}

/**
 * One paint of the display. `draw` is what to show now (null when nothing
 * arrived). When more than one sample was merged into it, `carry` holds the
 * newest sample so the following paint shows the true current state alone.
 */
export function nextPlayInputPaint(queue: readonly PlayInputSample[]): {
  draw: PlayInputSample | null;
  carry: PlayInputSample[];
} {
  const draw = mergePlayInputSamples(queue);
  return { draw, carry: queue.length > 1 ? [queue[queue.length - 1]!] : [] };
}

/** Add newly arrived samples to the paint queue. The queue keeps only its
 *  tail, so it cannot grow while the window is hidden and nothing paints. */
export function queuePlayInputSamples(
  queue: readonly PlayInputSample[],
  samples: readonly PlayInputSample[],
): PlayInputSample[] {
  return [...queue, ...samples].slice(-MAX_PLAY_INPUT_BATCH);
}

/** What the feed is doing, in the player's terms. */
export function playInputStatusText(status: PlayInputStatus): string {
  switch (status.phase) {
    case "off":
      return "Launch Melee to see your inputs.";
    case "disabled":
      return "This Dolphin's spectator stream is off. Set SlippiEnableSpectator = True in its Dolphin.ini, then relaunch.";
    case "connecting":
      return "Connecting to Dolphin…";
    case "waiting":
      return "Connected. Your inputs appear when a game starts.";
    case "unidentified":
      return "Could not tell which player is you in this game. Check your connect code in Settings → Profile.";
    case "live":
      return `Port ${status.playerIndex + 1} · the inputs the game read each frame`;
  }
}
