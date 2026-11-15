import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  fromSlippiPreFrame,
  GC_BUTTONS,
  type ControllerButton,
} from "../src/renderer/components/controller/controllerInput";
import { GameCubeController } from "../src/renderer/components/controller/GameCubeController";

describe("Slippi controller input adapter", () => {
  // Independent protocol fixtures, not values copied from the implementation at runtime.
  const physicalBits: [ControllerButton, number][] = [
    ["left", 1],
    ["right", 2],
    ["down", 4],
    ["up", 8],
    ["Z", 16],
    ["R", 32],
    ["L", 64],
    ["A", 256],
    ["B", 512],
    ["X", 1024],
    ["Y", 2048],
    ["Start", 4096],
  ];
  it.each(physicalBits)("decodes only %s from its physical bit", (name, bit) => {
    const buttons = fromSlippiPreFrame({ physicalButtons: bit }).buttons!;
    expect(GC_BUTTONS[name]).toBe(bit);
    expect(
      Object.entries(buttons)
        .filter(([, value]) => value)
        .map(([key]) => key),
    ).toEqual([name]);
  });
  it("preserves simultaneous inputs and ignores unused bits", () => {
    expect(fromSlippiPreFrame({ physicalButtons: 0x1109 }).buttons).toMatchObject({
      A: true,
      Start: true,
      up: true,
      left: true,
      B: false,
    });
    expect(Object.values(fromSlippiPreFrame({ physicalButtons: 0xe080 }).buttons!).some(Boolean)).toBe(false);
  });
  it("keeps analog travel independent of digital clicks, even at full travel", () => {
    const analog = fromSlippiPreFrame({ physicalLTrigger: 1, physicalRTrigger: 0.37 });
    expect(analog.triggers).toEqual({ L: 1, R: 0.37 });
    expect(analog.buttons).toMatchObject({ L: false, R: false });
    const click = fromSlippiPreFrame({ physicalButtons: 0x0060 });
    expect(click.buttons).toMatchObject({ L: true, R: true });
    expect(click.triggers).toEqual({ L: 0, R: 0 });
  });
  it("preserves small processed axes without a deadzone or radial normalization", () => {
    const input = fromSlippiPreFrame({ joystickX: 0.01, joystickY: -0.02, cStickX: 1, cStickY: 1 });
    expect(input.stick).toEqual({ x: 0.01, y: -0.02 });
    expect(input.cStick).toEqual({ x: 1, y: 1 });
  });
  it("neutralizes absent/nonfinite values and clamps out-of-range data", () => {
    expect(fromSlippiPreFrame(null)).toEqual(fromSlippiPreFrame({ physicalButtons: 0 }));
    expect(
      fromSlippiPreFrame({
        joystickX: NaN,
        joystickY: Infinity,
        cStickX: -2,
        cStickY: 2,
        physicalLTrigger: -1,
        physicalRTrigger: 2,
      }),
    ).toMatchObject({ stick: { x: 0, y: 0 }, cStick: { x: -1, y: 1 }, triggers: { L: 0, R: 1 } });
  });
  it("renders positive Y upward, digital/analog states separately, and unique SVG titles", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(GameCubeController, {
          input: { stick: { x: 1, y: 1 }, triggers: { L: 0.5, R: 0 }, buttons: { A: true } },
        }),
        createElement(GameCubeController),
      ),
    );
    expect(html).toContain("translate(25 -25)");
    expect(html).toContain('data-control="L" data-pressed="false" data-value="0.5"');
    expect(html).toContain('data-control="A" data-pressed="true"');
    const ids = [...html.matchAll(/<title id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
