import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fromSlippiPreFrame, GC_BUTTONS } from "../src/renderer/components/controller/controllerInput";
import { WireframeController } from "../src/renderer/components/controller/WireframeController";
import {
  GC_CONTROL_COLORS,
  WIREFRAME_BUTTONS,
  WIREFRAME_BUTTON_SHAPES,
  WIREFRAME_HEIGHT,
  WIREFRAME_STICKS,
  WIREFRAME_WIDTH,
  wireframeState,
  type WireframeShape,
} from "../src/renderer/components/controller/wireframeLayout";

const bounds = (shape: WireframeShape): [number, number, number, number] => {
  if (shape.kind === "circle") return [shape.cx - shape.r, shape.cy - shape.r, shape.cx + shape.r, shape.cy + shape.r];
  if (shape.kind === "rect") return [shape.x, shape.y, shape.x + shape.width, shape.y + shape.height];
  if (shape.kind === "ellipse") {
    const reach = Math.max(shape.rx, shape.ry);
    return [shape.cx - reach, shape.cy - reach, shape.cx + reach, shape.cy + reach];
  }
  const points = shape.points.split(" ").map((pair) => pair.split(",").map(Number) as [number, number]);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

describe("wireframe controller layout", () => {
  it("has a region and a color for every physical button and both sticks", () => {
    expect(Object.keys(WIREFRAME_BUTTON_SHAPES).sort()).toEqual(Object.keys(GC_BUTTONS).sort());
    for (const control of [...WIREFRAME_BUTTONS, "stick", "cStick"] as const)
      expect(GC_CONTROL_COLORS[control]).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("keeps every region inside the artwork", () => {
    for (const button of WIREFRAME_BUTTONS) {
      const [left, top, right, bottom] = bounds(WIREFRAME_BUTTON_SHAPES[button]);
      expect(left, button).toBeGreaterThanOrEqual(0);
      expect(top, button).toBeGreaterThanOrEqual(0);
      expect(right, button).toBeLessThanOrEqual(WIREFRAME_WIDTH);
      expect(bottom, button).toBeLessThanOrEqual(WIREFRAME_HEIGHT);
    }
  });
  it("does not let the round face buttons or the stick caps reach each other", () => {
    const discs = [
      WIREFRAME_BUTTON_SHAPES.A,
      WIREFRAME_BUTTON_SHAPES.B,
      WIREFRAME_BUTTON_SHAPES.Start,
      { kind: "circle" as const, cx: WIREFRAME_STICKS.stick.cx, cy: WIREFRAME_STICKS.stick.cy, r: 114 },
      { kind: "circle" as const, cx: WIREFRAME_STICKS.cStick.cx, cy: WIREFRAME_STICKS.cStick.cy, r: 88 },
    ];
    for (const [i, a] of discs.entries())
      for (const b of discs.slice(i + 1)) {
        if (a.kind !== "circle" || b.kind !== "circle") throw new Error("expected circles");
        expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThan(a.r + b.r);
      }
  });
  it("draws L as the mirror image of R", () => {
    const [rLeft, rTop, rRight, rBottom] = bounds(WIREFRAME_BUTTON_SHAPES.R);
    expect(bounds(WIREFRAME_BUTTON_SHAPES.L)).toEqual([
      WIREFRAME_WIDTH - rRight,
      rTop,
      WIREFRAME_WIDTH - rLeft,
      rBottom,
    ]);
  });
});

describe("wireframe controller state", () => {
  it("lights nothing for a missing or neutral input", () => {
    for (const state of [wireframeState(), wireframeState({}), wireframeState(fromSlippiPreFrame(undefined))]) {
      expect(Object.values(state.level).every((value) => value === 0)).toBe(true);
      expect(Object.values(state.pressed).every((value) => value === false)).toBe(true);
      expect(state.offset).toEqual({ stick: { x: 0, y: 0 }, cStick: { x: 0, y: 0 } });
    }
  });
  it.each(WIREFRAME_BUTTONS)("lights only %s when only its bit is set", (button) => {
    const state = wireframeState(fromSlippiPreFrame({ physicalButtons: GC_BUTTONS[button] }));
    for (const other of WIREFRAME_BUTTONS) {
      expect(state.pressed[other], other).toBe(other === button);
      expect(state.level[other], other).toBe(other === button ? 1 : 0);
    }
    expect(state.level.stick).toBe(0);
    expect(state.level.cStick).toBe(0);
  });
  it("treats a truthy non-boolean button value as not pressed", () => {
    const state = wireframeState({ buttons: { A: 1 as unknown as boolean, B: true } });
    expect(state.pressed.A).toBe(false);
    expect(state.pressed.B).toBe(true);
  });
  it("lights a trigger by its analog travel without calling it a press", () => {
    const state = wireframeState({ triggers: { L: 0.35, R: 0 } });
    expect(state.level.L).toBe(0.35);
    expect(state.pressed.L).toBe(false);
    expect(state.level.R).toBe(0);
  });
  it("applies no trigger deadzone and clamps out-of-range travel", () => {
    expect(wireframeState({ triggers: { L: 0.02, R: 1.7 } }).level).toMatchObject({ L: 0.02, R: 1 });
    expect(wireframeState({ triggers: { L: -0.4, R: NaN } }).level).toMatchObject({ L: 0, R: 0 });
  });
  it("shows a digital trigger click as a full press even with no analog reading", () => {
    const state = wireframeState({ buttons: { R: true }, triggers: { L: 0, R: 0 } });
    expect(state.level.R).toBe(1);
    expect(state.pressed.R).toBe(true);
    expect(state.level.L).toBe(0);
  });
  it("moves a stick cap the way the stick points: up is up, right is right", () => {
    const up = wireframeState({ stick: { x: 0, y: 1 } });
    expect(up.offset.stick).toEqual({ x: 0, y: -WIREFRAME_STICKS.stick.travel });
    expect(up.level.stick).toBe(1);
    const right = wireframeState({ cStick: { x: 1, y: 0 } });
    expect(right.offset.cStick).toEqual({ x: WIREFRAME_STICKS.cStick.travel, y: 0 });
    expect(right.offset.stick).toEqual({ x: 0, y: 0 });
    expect(right.level.stick).toBe(0);
  });
  it("lights a stick by deflection with no deadzone, capped at full", () => {
    expect(wireframeState({ stick: { x: 0.05, y: 0 } }).level.stick).toBeCloseTo(0.05);
    expect(wireframeState({ stick: { x: 0.6, y: -0.8 } }).level.stick).toBeCloseTo(1);
    expect(wireframeState({ stick: { x: 1, y: 1 } }).level.stick).toBe(1);
    expect(wireframeState({ stick: { x: NaN, y: Infinity } }).level.stick).toBe(0);
  });
});

describe("wireframe controller rendering", () => {
  const render = (props: Parameters<typeof WireframeController>[0]) =>
    renderToStaticMarkup(createElement(WireframeController, props));
  const control = (markup: string, name: string) => {
    const match = new RegExp(`<[a-z]+[^>]*data-control="${name}"[^>]*>`).exec(markup);
    if (!match) throw new Error(`no element for ${name}`);
    return match[0];
  };
  it("lights a pressed button in its own color and leaves the others dark", () => {
    const markup = render({ input: { buttons: { A: true } } });
    expect(control(markup, "A")).toContain('data-level="1"');
    expect(control(markup, "A")).toContain(`fill="${GC_CONTROL_COLORS.A}"`);
    expect(control(markup, "A")).toContain("opacity:1");
    expect(control(markup, "B")).toContain('data-level="0"');
    expect(control(markup, "B")).toContain("opacity:0");
  });
  it("lights instantly and fades only on release", () => {
    const markup = render({ input: { buttons: { A: true } }, afterglowMs: 150 });
    expect(control(markup, "A")).toContain("transition:none");
    expect(control(markup, "B")).toContain("transition:opacity 150ms linear");
    expect(control(render({ afterglowMs: 0 }), "B")).toContain("transition:none");
  });
  it("uses an overridden color for that control only", () => {
    const markup = render({ input: { buttons: { A: true, B: true } }, colors: { A: "#123456" } });
    expect(control(markup, "A")).toContain('fill="#123456"');
    expect(control(markup, "B")).toContain(`fill="${GC_CONTROL_COLORS.B}"`);
  });
  it("moves the stick cap and the hole it leaves by the same offset", () => {
    const markup = render({ input: { stick: { x: 1, y: 0 } } });
    const { cx, cy, cap, travel } = WIREFRAME_STICKS.stick;
    expect(markup).toContain(`translate(${travel} 0)`);
    expect(markup).toContain(`<circle cx="${cx + travel}" cy="${cy}" r="${cap}"`);
    expect(render({})).not.toContain(`translate(${travel} 0)`);
  });
  it("outlines regions only when asked", () => {
    expect(render({})).not.toContain("#ff2bd6");
    expect(render({ showRegions: true })).toContain("#ff2bd6");
  });
  it("gives each instance its own mask and filter ids", () => {
    const markup = renderToStaticMarkup(
      createElement("div", null, createElement(WireframeController), createElement(WireframeController)),
    );
    const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});
