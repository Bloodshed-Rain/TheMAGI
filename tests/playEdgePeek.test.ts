import { describe, expect, it } from "vitest";
import { PlayEdgePeek } from "../src/playEdgePeek";

const widths = { left: 250, right: 290 };
const cursor = (x: number, y = 400) => ({ x, y, width: 1920, height: 1080 });
const open = (peek: PlayEdgePeek, x = 0) => {
  peek.update(cursor(x), widths, 0);
  return peek.update(cursor(x), widths, 150);
};
describe("fullscreen sidebar edge reveals", () => {
  it("requires a short dwell at either extreme edge", () => {
    for (const [x, side] of [
      [0, "left"],
      [1919, "right"],
    ] as const) {
      const peek = new PlayEdgePeek();
      expect(peek.update(cursor(x), widths, 0)).toBeNull();
      expect(peek.update(cursor(x), widths, 149)).toBeNull();
      expect(peek.update(cursor(x), widths, 150)).toBe(side);
    }
  });
  it("does not reveal panels from ordinary movement near an edge", () => {
    const peek = new PlayEdgePeek();
    expect(peek.update(cursor(10), widths, 0)).toBeNull();
    expect(peek.update(cursor(10), widths, 1000)).toBeNull();
  });
  it("cancels a fleeting edge touch", () => {
    const peek = new PlayEdgePeek();
    peek.update(cursor(0), widths, 0);
    peek.update(cursor(100), widths, 100);
    expect(peek.update(cursor(0), widths, 200)).toBeNull();
    expect(peek.update(cursor(0), widths, 350)).toBe("left");
  });
  it("stays open while reading or interacting anywhere in the panel", () => {
    const peek = new PlayEdgePeek();
    open(peek);
    expect(peek.update(cursor(240), widths, 1000)).toBe("left");
    expect(peek.update(cursor(270), widths, 2000)).toBe("left");
  });
  it("hides after moving back into the game with a grace period", () => {
    const peek = new PlayEdgePeek();
    open(peek);
    expect(peek.update(cursor(700), widths, 200)).toBe("left");
    expect(peek.update(cursor(700), widths, 549)).toBe("left");
    expect(peek.update(cursor(700), widths, 550)).toBeNull();
  });
  it("cancels hiding when the pointer returns to the panel", () => {
    const peek = new PlayEdgePeek();
    open(peek, 1919);
    peek.update(cursor(1000), widths, 200);
    expect(peek.update(cursor(1700), widths, 400)).toBe("right");
    expect(peek.update(cursor(1700), widths, 1000)).toBe("right");
  });
  it("switches directly to the opposite edge after dwelling there", () => {
    const peek = new PlayEdgePeek();
    open(peek);
    peek.update(cursor(1919), widths, 200);
    expect(peek.update(cursor(1919), widths, 350)).toBe("right");
  });
  it("closes immediately when another app is foreground or the pointer leaves the display", () => {
    for (const outside of [null, cursor(-1), cursor(1920), cursor(0, -1), cursor(0, 1080)]) {
      const peek = new PlayEdgePeek();
      open(peek);
      expect(peek.update(outside, widths, 200)).toBeNull();
      expect(peek.update(cursor(0), widths, 210)).toBeNull();
    }
  });
  it("uses the current display width and custom panel width", () => {
    const peek = new PlayEdgePeek();
    const small = (x: number) => ({ x, y: 300, width: 1280, height: 720 });
    peek.update(small(1279), widths, 0);
    expect(peek.update(small(1279), widths, 150)).toBe("right");
    expect(peek.update(small(900), { left: 200, right: 380 }, 200)).toBe("right");
    expect(peek.update(small(900), { left: 200, right: 380 }, 1000)).toBe("right");
  });
});
