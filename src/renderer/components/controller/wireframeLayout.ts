import { GC_BUTTONS, finiteClamp, type ControllerButton, type ControllerInput } from "./controllerInput";

/** Pixel size of `assets/gamecube-wireframe.webp`; every coordinate below is in this space. */
export const WIREFRAME_WIDTH = 1536;
export const WIREFRAME_HEIGHT = 1024;

export type WireframeStick = "stick" | "cStick";
export type WireframeControl = ControllerButton | WireframeStick;

export type WireframeShape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; rotate: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number }
  | { kind: "polygon"; points: string };

const mirror = (points: string) =>
  points
    .split(" ")
    .map((pair) => {
      const [x, y] = pair.split(",");
      return `${WIREFRAME_WIDTH - Number(x)},${y}`;
    })
    .join(" ");

// The right shoulder as drawn: the bump above the body's top edge.
const R_SHOULDER =
  "1042,160 1055,136 1076,126 1101,123 1128,127 1155,137 1183,149 1209,170 1225,198 1234,229 1200,217 1150,199 1100,181 1046,166";

/**
 * Where each button's lines are in the artwork. A shape only selects which
 * wireframe lines light up; it is slightly larger than the button's outline and
 * never reaches a neighbouring button's outline.
 *
 * The artwork is a front view with no separate Z button, so Z is the strip of
 * the body's top edge directly under the R shoulder, where Z sits on the pad.
 */
export const WIREFRAME_BUTTON_SHAPES: Record<ControllerButton, WireframeShape> = {
  A: { kind: "circle", cx: 1130.5, cy: 417.5, r: 76 },
  B: { kind: "circle", cx: 999.5, cy: 466, r: 47 },
  X: { kind: "ellipse", cx: 1244.5, cy: 373, rx: 64, ry: 42, rotate: 70 },
  Y: { kind: "ellipse", cx: 1089.5, cy: 293, rx: 74, ry: 44, rotate: -21 },
  Z: {
    kind: "polygon",
    points:
      "1046,166 1100,181 1150,199 1200,217 1234,229 1262,250 1256,262 1226,246 1196,232 1146,213 1096,195 1044,180",
  },
  Start: { kind: "circle", cx: 766.5, cy: 425.5, r: 28 },
  L: { kind: "polygon", points: mirror(R_SHOULDER) },
  R: { kind: "polygon", points: R_SHOULDER },
  up: { kind: "rect", x: 540, y: 549, width: 60, height: 58 },
  down: { kind: "rect", x: 540, y: 654, width: 60, height: 59 },
  left: { kind: "rect", x: 487, y: 602, width: 58, height: 58 },
  right: { kind: "rect", x: 596, y: 602, width: 58, height: 58 },
};

/** Stick caps: the disc of artwork that moves, and how far it travels at full deflection. */
export const WIREFRAME_STICKS: Record<WireframeStick, { cx: number; cy: number; cap: number; travel: number }> = {
  stick: { cx: 416, cy: 403, cap: 80, travel: 34 },
  cStick: { cx: 967.5, cy: 640, cap: 64, travel: 24 },
};

/** Where the added "Z" letter is drawn; the artwork labels every other face control itself. */
export const WIREFRAME_Z_LABEL = { x: 1284, y: 222 };

/** The colors of a stock GameCube controller's controls. Grey controls light white. */
export const GC_CONTROL_COLORS: Record<WireframeControl, string> = {
  A: "#19d38c",
  B: "#ff4055",
  X: "#f1f3f7",
  Y: "#f1f3f7",
  Z: "#8f6cff",
  Start: "#f1f3f7",
  L: "#f1f3f7",
  R: "#f1f3f7",
  up: "#f1f3f7",
  down: "#f1f3f7",
  left: "#f1f3f7",
  right: "#f1f3f7",
  stick: "#f1f3f7",
  cStick: "#ffd23d",
};

export const WIREFRAME_BUTTONS = Object.keys(GC_BUTTONS) as ControllerButton[];

export interface WireframeState {
  /** How brightly each control's lines are lit, 0 to 1. */
  level: Record<WireframeControl, number>;
  /** Digital presses only. An analog trigger pull is a level, never a press. */
  pressed: Record<ControllerButton, boolean>;
  /** Stick cap displacement in artwork pixels; positive y is down, as SVG draws. */
  offset: Record<WireframeStick, { x: number; y: number }>;
}

/**
 * What the display shows for one input snapshot. Nothing is inferred:
 * - a button is lit only when its own digital bit is set;
 * - L/R are lit by their analog travel, or fully by their digital click (a
 *   click with no analog reading, as on a controller with its trigger springs
 *   removed, is still a full press);
 * - a stick is lit by how far it is deflected, with no deadzone, and its cap
 *   moves by the same axes. Positive Y is up in the input and up on screen.
 */
export function wireframeState(input: ControllerInput = {}): WireframeState {
  const pressed = Object.fromEntries(
    WIREFRAME_BUTTONS.map((button) => [button, input.buttons?.[button] === true]),
  ) as Record<ControllerButton, boolean>;
  const level = Object.fromEntries(WIREFRAME_BUTTONS.map((button) => [button, pressed[button] ? 1 : 0])) as Record<
    WireframeControl,
    number
  >;
  for (const side of ["L", "R"] as const) level[side] = pressed[side] ? 1 : finiteClamp(input.triggers?.[side], 0, 1);
  const offset = {} as WireframeState["offset"];
  for (const name of ["stick", "cStick"] as const) {
    const x = finiteClamp(input[name]?.x);
    const y = finiteClamp(input[name]?.y);
    level[name] = Math.min(1, Math.hypot(x, y));
    // `|| 0` keeps a neutral axis at 0 rather than the -0 that negating it gives.
    offset[name] = { x: x * WIREFRAME_STICKS[name].travel || 0, y: -y * WIREFRAME_STICKS[name].travel || 0 };
  }
  return { level, pressed, offset };
}
