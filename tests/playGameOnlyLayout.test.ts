import { describe, expect, it } from "vitest";
import { gameOnlyLayout } from "../src/playGameOnlyLayout";

describe("fullscreen side space", () => {
  it.each([
    [1920, 1080, 1440, 240],
    [2560, 1440, 1920, 320],
    [3440, 1440, 1920, 760],
    [1280, 720, 960, 160],
  ])("uses existing side bars at %s×%s without shrinking the game", (width, height, gameWidth, gutter) => {
    const pinned = gameOnlyLayout(width!, height!, "visible");
    expect(pinned.gameWidth).toBe(gameWidth);
    expect(pinned.gutter).toBe(gutter);
    expect(pinned.autoHide).toBe(false);
    expect(pinned.gameHeight).toBe(height);
    expect(gameOnlyLayout(width!, height!, "auto-hide").gameWidth).toBe(pinned.gameWidth);
    expect(gameOnlyLayout(width!, height!, "auto-hide").autoHide).toBe(true);
  });
  it("uses edge reveal when a 4:3 screen or narrow bars cannot fit readable panels", () => {
    expect(gameOnlyLayout(1024, 768, "visible")).toEqual({
      gameWidth: 1024,
      gameHeight: 768,
      gutter: 0,
      autoHide: true,
    });
    expect(gameOnlyLayout(1200, 800, "visible").autoHide).toBe(true);
    expect(gameOnlyLayout(800, 1200, "visible").gutter).toBe(0);
  });
  it("does not produce invalid geometry before a viewport has been measured", () => {
    expect(gameOnlyLayout(NaN, Infinity, "visible")).toEqual({
      gameWidth: 0,
      gameHeight: 0,
      gutter: 0,
      autoHide: true,
    });
  });
});
