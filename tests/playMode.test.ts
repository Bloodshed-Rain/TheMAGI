import { describe, expect, it } from "vitest";
import { playPreset, resolvePlayLayout, validatePlayBounds } from "../src/playMode";

describe("Play Mode preferences", () => {
  it("restores safe defaults for a new or invalid profile", () => {
    expect(resolvePlayLayout(null)).toEqual(playPreset("coaching"));
    expect(resolvePlayLayout("invalid")).toEqual(playPreset("coaching"));
  });
  it("keeps fullscreen panels visible by default, including older saved layouts", () => {
    expect(playPreset("coaching").gameOnlyPanelMode).toBe("visible");
    expect(resolvePlayLayout({ left: { panels: ["stats"] } }).gameOnlyPanelMode).toBe("visible");
    expect(resolvePlayLayout({ gameOnlyPanelMode: "auto-hide" }).gameOnlyPanelMode).toBe("auto-hide");
    expect(resolvePlayLayout({ gameOnlyPanelMode: "invalid" }).gameOnlyPanelMode).toBe("visible");
  });
  it("preserves empty sidebars, order, hidden state, and selected stats", () => {
    const layout = playPreset("practice");
    layout.left.panels = [];
    layout.right.panels = ["notes", "oracle", "focus"];
    layout.right.collapsed = true;
    layout.statIds = ["wavedashes", "neutralWins"];
    expect(resolvePlayLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  });
  it("drops unknown IDs and duplicates, and clamps sidebar widths", () => {
    const layout = resolvePlayLayout({
      left: { panels: ["notes", "__proto__", "notes", "bogus", 1], width: -100, collapsed: "true" },
      right: { width: 9000 },
      statIds: ["wavedashes", "bogus", "wavedashes", null],
    });
    expect(layout.left).toEqual({ panels: ["notes"], width: 200, collapsed: false });
    expect(layout.right.width).toBe(380);
    expect(layout.statIds).toEqual(["wavedashes"]);
  });
  it("does not share mutable defaults between presets", () => {
    const first = playPreset("coaching");
    first.left.panels.length = 0;
    expect(playPreset("coaching").left.panels).toEqual(["set", "stats"]);
    expect(playPreset("minimal").left.collapsed).toBe(true);
    expect(playPreset("minimal").right.collapsed).toBe(true);
  });
  it.each([NaN, Infinity, 0, -1, 20001])("rejects invalid viewport width %s", (width) => {
    expect(() => validatePlayBounds({ x: 0, y: 0, width, height: 480 })).toThrow("Invalid game window bounds");
  });
});
