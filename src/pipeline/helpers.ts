import {
  characters as characterUtils,
  moves as moveUtils,
  State,
  Frames,
  GameEndMethod,
  type GameEndType,
  type PlayerType,
} from "@slippi/slippi-js/node";

// ── Helpers ───────────────────────────────────────────────────────────

export const FPS = 60;

export function framesToSeconds(frames: number): number {
  return Math.round((frames / FPS) * 100) / 100;
}

/** Convert a game frame number to a human-readable timestamp like "1:23" */
export function frameToTimestamp(frame: number): string {
  const gameFrame = frame - Frames.FIRST_PLAYABLE;
  const totalSeconds = Math.max(0, Math.floor(gameFrame / FPS));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function getPlayerTag(player: PlayerType): string {
  return (
    player.displayName ||
    player.nametag ||
    player.connectCode ||
    `P${player.port}`
  );
}

export function getCharacterName(id: number | undefined): string {
  if (id == null) return "Unknown";
  return characterUtils.getCharacterShortName(id);
}

export function getMoveName(id: number): string {
  return moveUtils.getMoveShortName(id);
}

export function ratio(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 10000) / 10000;
}

/** Shannon entropy normalized to [0,1] for a frequency distribution */
export function entropy(options: { frequency: number }[]): number {
  const total = options.reduce((s, o) => s + o.frequency, 0);
  if (total === 0) return 0;
  const n = options.length;
  if (n <= 1) return 0;
  let h = 0;
  for (const o of options) {
    if (o.frequency === 0) continue;
    const p = o.frequency / total;
    h -= p * Math.log2(p);
  }
  return Math.round((h / Math.log2(n)) * 10000) / 10000;
}

export function endMethodString(
  gameEnd: GameEndType | undefined,
): string {
  if (!gameEnd) return "unknown";
  switch (gameEnd.gameEndMethod) {
    case GameEndMethod.TIME:
      return "timeout";
    case GameEndMethod.NO_CONTEST:
      return "LRAS";
    case GameEndMethod.GAME:
    case GameEndMethod.RESOLVED:
      return "stocks";
    default:
      return "unknown";
  }
}

// ── Action state classification ───────────────────────────────────────

export function isAirborne(actionState: number): boolean {
  // Aerial states, falling, jumping, air dodge
  return (
    (actionState >= State.CONTROLLED_JUMP_START &&
      actionState <= State.CONTROLLED_JUMP_END) ||
    (actionState >= State.FALL && actionState <= State.FALL_BACKWARD) ||
    actionState === State.DAMAGE_FALL ||
    actionState === State.AIR_DODGE ||
    (actionState >= State.AERIAL_ATTACK_START &&
      actionState <= State.AERIAL_DAIR) ||
    actionState === State.LANDING_FALL_SPECIAL
  );
}

export function isOnLedge(actionState: number): boolean {
  return actionState === State.CLIFF_CATCH || actionState === 253; // CLIFF_WAIT
}

// Lowest platform height per legal stage. If posY is above this threshold,
// the player is standing on a platform rather than the main stage.
export const PLATFORM_MIN_HEIGHT: Record<number, number> = {
  2: 15,    // Fountain of Dreams — side platforms ~15-27, top ~42
  3: 25,    // Pokemon Stadium — platforms ~25
  8: 23,    // Yoshi's Story — side platforms ~23, top ~42
  28: 27,   // Dreamland — side platforms ~27, top ~51
  31: 27,   // Battlefield — side platforms ~27, top ~54
  // FD (32) has no platforms
};

export function isOnPlatform(posY: number, stageId: number): boolean {
  const threshold = PLATFORM_MIN_HEIGHT[stageId];
  if (threshold === undefined) return false; // FD or unknown — no platforms
  return posY > threshold;
}

export function isOffstage(
  posX: number,
  posY: number,
  stageId: number,
): boolean {
  // Approximate stage boundaries for legal stages
  const bounds = stageBounds(stageId);
  return (
    Math.abs(posX) > bounds.x || posY < bounds.yMin
  );
}

export function stageBounds(stageId: number): {
  x: number;
  yMin: number;
} {
  // Approximate blast zone / ledge boundaries for common stages
  const map: Record<number, { x: number; yMin: number }> = {
    2: { x: 63, yMin: -10 }, // Fountain of Dreams
    3: { x: 88, yMin: -10 }, // Pokemon Stadium
    8: { x: 56, yMin: -10 }, // Yoshi's Story
    28: { x: 68, yMin: -10 }, // Dreamland
    31: { x: 86, yMin: -10 }, // Battlefield
    32: { x: 86, yMin: -10 }, // Final Destination
  };
  return map[stageId] ?? { x: 80, yMin: -10 };
}

// Detect "knockdown" — player is in a downed/missed-tech state
export function isKnockdown(actionState: number): boolean {
  return (
    actionState >= State.DOWN_START && actionState <= State.DOWN_END
  );
}

// Detect ledge grab
export function isLedgeGrab(actionState: number): boolean {
  return actionState === State.CLIFF_CATCH;
}

// Detect shield (guarding)
export function isShielding(actionState: number): boolean {
  return (
    actionState >= State.GUARD_START && actionState <= State.GUARD_END
  );
}

export function isDashDancing(actionState: number): boolean {
  return actionState === State.DASH || actionState === State.TURN;
}

// ── Power shield action state constants ────────────────────────────────
// 178 = GuardOn (shield activation, 1 frame), 179 = Guard (holding shield)
// 181 = GuardSetOff (shield stun from hit), 182 = GuardReflect (projectile reflect)
export const GUARD_ON = 178;
export const GUARD = 179;
export const GUARD_SET_OFF = 181;
export const GUARD_REFLECT = 182;

// ── Shield break action state constants ─────────────────────────────
// In Melee, shield break causes action states 205 (ShieldBreakFly),
// 206 (ShieldBreakFall), and 207 (ShieldBreakDownU/D).
// We detect the initial transition into 205 to count shield breaks.
export const SHIELD_BREAK_FLY = 205;
export const SHIELD_BREAK_FALL = 206;
export const SHIELD_BREAK_DOWN_U = 207;
export const SHIELD_BREAK_DOWN_D = 208;
export const SHIELD_BREAK_STAND_U = 209;
export const SHIELD_BREAK_STAND_D = 210;

/** Full shield size in Melee (60 units). */
export const FULL_SHIELD_SIZE = 60;

/** Minimum shield size at which attacks can "poke" through shield gaps. */
export const SHIELD_POKE_THRESHOLD = 15;

// Move ID → human name mapping (slippi-js uses numeric move IDs in conversions)
export const moveIdToName: Record<number, string> = {
  1: "misc",
  2: "jab",
  3: "jab",
  4: "jab",
  5: "rapid jab",
  6: "dash attack",
  7: "ftilt",
  8: "utilt",
  9: "dtilt",
  10: "fsmash",
  11: "usmash",
  12: "dsmash",
  13: "nair",
  14: "fair",
  15: "bair",
  16: "uair",
  17: "dair",
  18: "neutral b",
  19: "side b",
  20: "up b",
  21: "down b",
  50: "grab",
  51: "pummel",
  52: "fthrow",
  53: "bthrow",
  54: "uthrow",
  55: "dthrow",
};
