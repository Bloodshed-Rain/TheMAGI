import type { PreFrameUpdateType } from "@slippi/slippi-js";

/** Physical button bits from project-slippi/slippi-wiki SPEC.md. */
export const GC_BUTTONS = {
  left: 0x0001,
  right: 0x0002,
  down: 0x0004,
  up: 0x0008,
  Z: 0x0010,
  R: 0x0020,
  L: 0x0040,
  A: 0x0100,
  B: 0x0200,
  X: 0x0400,
  Y: 0x0800,
  Start: 0x1000,
} as const;

export type ControllerButton = keyof typeof GC_BUTTONS;
export interface ControllerInput {
  buttons?: Partial<Record<ControllerButton, boolean>>;
  /** Signed axes, -1 to 1. Positive Y points up. No deadzone is applied. */
  stick?: { x: number; y: number };
  cStick?: { x: number; y: number };
  /** Analog travel, 0 to 1. Digital clicks are independent buttons.L / buttons.R. */
  triggers?: { L: number; R: number };
}

export function finiteClamp(value: number | null | undefined, min = -1, max = 1): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;
}

export type SlippiControllerFrame = Partial<
  Pick<
    PreFrameUpdateType,
    "physicalButtons" | "joystickX" | "joystickY" | "cStickX" | "cStickY" | "physicalLTrigger" | "physicalRTrigger"
  >
>;

/** Feed the selected player's pre-frame update; undefined clears the display.
 * Sticks are Slippi's processed axes, NOT raw hardware samples.
 * Never substitute processedButtons or the merged trigger field.
 */
export function fromSlippiPreFrame(pre?: SlippiControllerFrame | null): ControllerInput {
  const mask = pre?.physicalButtons ?? 0;
  return {
    buttons: Object.fromEntries(Object.entries(GC_BUTTONS).map(([name, bit]) => [name, (mask & bit) !== 0])),
    stick: { x: finiteClamp(pre?.joystickX), y: finiteClamp(pre?.joystickY) },
    cStick: { x: finiteClamp(pre?.cStickX), y: finiteClamp(pre?.cStickY) },
    triggers: { L: finiteClamp(pre?.physicalLTrigger, 0, 1), R: finiteClamp(pre?.physicalRTrigger, 0, 1) },
  };
}
