import { describe, expect, it } from "vitest";
import { selectDolphinGameSurface, type DolphinTopWindow } from "../src/main/dolphinWindowSelection";

const library = (overrides: Partial<DolphinTopWindow> = {}): DolphinTopWindow => ({
  hwnd: 1n,
  title: "Faster Melee - Slippi (3.6.4)",
  className: "wxWindowNR",
  width: 1600,
  height: 1000,
  hasMenu: true,
  children: [{ hwnd: 2n, title: "", className: "SysListView32", width: 1500, height: 800 }],
  ...overrides,
});
const game = (overrides: Partial<DolphinTopWindow> = {}): DolphinTopWindow => ({
  hwnd: 3n,
  title: "Dolphin",
  className: "wxWindowNR",
  width: 640,
  height: 480,
  hasMenu: false,
  children: [],
  ...overrides,
});
describe("Dolphin game-window selection", () => {
  it("waits when only the game library has appeared", () => {
    expect(selectDolphinGameSurface([library()])).toBeNull();
    expect(selectDolphinGameSurface([library()], true)).toBeNull();
  });
  it("hosts the smaller render frame and hides the larger library", () => {
    expect(selectDolphinGameSurface([library(), game()])).toEqual({
      mainHwnd: 3n,
      renderHwnd: 3n,
      renderIsChild: false,
      shellHwnds: [1n],
    });
  });
  it("does not depend on enumeration order", () => {
    expect(selectDolphinGameSurface([game(), library()])?.mainHwnd).toBe(3n);
  });
  it("never treats a generic Dolphin list window as a renderer", () => {
    expect(selectDolphinGameSurface([library({ title: "Dolphin", className: "Dolphin" })], true)).toBeNull();
  });
  it("waits for a lone ambiguous wx render frame to settle", () => {
    expect(selectDolphinGameSurface([game()])).toBeNull();
    expect(selectDolphinGameSurface([game()], true)?.mainHwnd).toBe(3n);
  });
  it("recognizes a dedicated render class without a library window", () => {
    expect(selectDolphinGameSurface([game({ className: "Dolphin" })])?.mainHwnd).toBe(3n);
  });
  it("finds an embedded graphics child instead of choosing a list control by area", () => {
    const top = library({
      children: [
        { hwnd: 2n, title: "", className: "SysListView32", width: 1500, height: 800 },
        { hwnd: 4n, title: "", className: "wxGLCanvas", width: 640, height: 480 },
      ],
    });
    expect(selectDolphinGameSurface([top])).toEqual({
      mainHwnd: 1n,
      renderHwnd: 4n,
      renderIsChild: true,
      shellHwnds: [],
    });
  });
  it("does not attach a startup error dialog instead of a game", () => {
    expect(selectDolphinGameSurface([library(), game({ title: "Error", className: "#32770" })], true)).toBeNull();
  });
  it("hosts the wx game panel when emulation replaces the library in the main window", () => {
    const children = [
      { hwnd: 4n, title: "", className: "ToolbarWindow32", width: 1054, height: 58 },
      { hwnd: 5n, title: "panel", className: "wxWindowNR", width: 1054, height: 663 },
    ];
    expect(selectDolphinGameSurface([library({ children })], true)).toEqual({
      mainHwnd: 1n,
      renderHwnd: 5n,
      renderIsChild: true,
      shellHwnds: [],
    });
    expect(selectDolphinGameSurface([library({ children })])).toBeNull();
    expect(selectDolphinGameSurface([library({ children: [...children, ...library().children] })], true)).toBeNull();
  });
  it("rejects unknown menu windows and tiny overlays", () => {
    expect(
      selectDolphinGameSurface(
        [game({ hasMenu: true }), game({ hwnd: 4n, title: "FPS: 60", width: 100, height: 50 })],
        true,
      ),
    ).toBeNull();
  });
});
