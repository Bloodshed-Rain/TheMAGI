import { describe, expect, it } from "vitest";
import {
  MAX_PLAY_SCENES,
  PLAY_PANELS,
  PLAY_PANEL_DEFS,
  applyPlayArrangement,
  clampPlaySidebarWidth,
  deletePlayScene,
  placePlayPanel,
  playArrangement,
  playPanelSide,
  playPreset,
  playSceneNameError,
  removePlayPanel,
  resolvePlayLayout,
  samePlayArrangement,
  savePlayScene,
  validatePlayBounds,
  type PlayPanel,
} from "../src/playMode";

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

describe("Play Mode module catalog", () => {
  it("describes every module exactly once", () => {
    expect(PLAY_PANEL_DEFS.map((def) => def.id).sort()).toEqual(Object.keys(PLAY_PANELS).sort());
    for (const def of PLAY_PANEL_DEFS) expect(def.description.length).toBeGreaterThan(0);
  });
  it("clamps and rounds a dragged sidebar width", () => {
    expect(clampPlaySidebarWidth(12)).toBe(200);
    expect(clampPlaySidebarWidth(9000)).toBe(380);
    expect(clampPlaySidebarWidth(263.6)).toBe(264);
  });
});

describe("Play Mode module placement", () => {
  const base = () => {
    const layout = playPreset("coaching");
    layout.left.panels = ["set", "stats", "trends"];
    layout.right.panels = ["coaching", "focus"];
    return layout;
  };
  it("reorders within a sidebar by the insertion slot the player dropped on", () => {
    expect(placePlayPanel(base(), "set", "left", 3).left.panels).toEqual(["stats", "trends", "set"]);
    expect(placePlayPanel(base(), "set", "left", 2).left.panels).toEqual(["stats", "set", "trends"]);
    expect(placePlayPanel(base(), "trends", "left", 0).left.panels).toEqual(["trends", "set", "stats"]);
  });
  it("leaves the order alone when a module is dropped on either side of itself", () => {
    expect(placePlayPanel(base(), "stats", "left", 1).left.panels).toEqual(["set", "stats", "trends"]);
    expect(placePlayPanel(base(), "stats", "left", 2).left.panels).toEqual(["set", "stats", "trends"]);
  });
  it("moves a module across sidebars without leaving a copy behind", () => {
    const moved = placePlayPanel(base(), "stats", "right", 1);
    expect(moved.left.panels).toEqual(["set", "trends"]);
    expect(moved.right.panels).toEqual(["coaching", "stats", "focus"]);
    expect(playPanelSide(moved, "stats")).toBe("right");
  });
  it("appends when no slot is given and clamps a slot outside the list", () => {
    expect(placePlayPanel(base(), "notes", "right").right.panels).toEqual(["coaching", "focus", "notes"]);
    expect(placePlayPanel(base(), "notes", "right", 99).right.panels).toEqual(["coaching", "focus", "notes"]);
    expect(placePlayPanel(base(), "notes", "right", -4).right.panels).toEqual(["notes", "coaching", "focus"]);
    expect(placePlayPanel(base(), "notes", "right", NaN).right.panels).toEqual(["coaching", "focus", "notes"]);
  });
  it("shows a hidden sidebar that receives a module, and does not touch the other one", () => {
    const layout = playPreset("minimal");
    const placed = placePlayPanel(layout, "notes", "left");
    expect(placed.left.collapsed).toBe(false);
    expect(placed.right.collapsed).toBe(true);
  });
  it("does not mutate the layout it was given", () => {
    const layout = base();
    placePlayPanel(layout, "stats", "right", 0);
    removePlayPanel(layout, "set");
    expect(layout).toEqual(base());
  });
  it("removes a module from the layout and forgets that it was folded", () => {
    const layout = { ...base(), collapsedPanels: ["stats", "focus"] as PlayPanel[] };
    const removed = removePlayPanel(layout, "stats");
    expect(removed.left.panels).toEqual(["set", "trends"]);
    expect(removed.collapsedPanels).toEqual(["focus"]);
    expect(playPanelSide(removed, "stats")).toBeNull();
    expect(removePlayPanel(layout, "notes")).toEqual(layout);
  });
  it("keeps a module saved in both sidebars by an older version on the left only", () => {
    const layout = resolvePlayLayout({ left: { panels: ["stats", "set"] }, right: { panels: ["coaching", "stats"] } });
    expect(layout.left.panels).toEqual(["stats", "set"]);
    expect(layout.right.panels).toEqual(["coaching"]);
  });
  it("restores folded modules and drops unknown or repeated ones", () => {
    expect(resolvePlayLayout({ collapsedPanels: ["notes", "bogus", "notes", 3] }).collapsedPanels).toEqual(["notes"]);
    expect(resolvePlayLayout({ collapsedPanels: "notes" }).collapsedPanels).toEqual([]);
    expect(resolvePlayLayout({ left: { panels: ["stats"] } }).collapsedPanels).toEqual([]);
  });
});

describe("Play Mode scenes", () => {
  const custom = () => {
    const layout = playPreset("coaching");
    layout.left.panels = ["trends"];
    layout.right.panels = ["oracle", "notes"];
    layout.collapsedPanels = ["notes"];
    return layout;
  };
  it("saves the current arrangement by name and restores it later", () => {
    const saved = savePlayScene(custom(), "  Stream night ");
    expect(saved.scenes).toEqual([{ name: "Stream night", arrangement: playArrangement(custom()) }]);
    const changed = applyPlayArrangement(saved, playPreset("practice"));
    expect(changed.scenes).toEqual(saved.scenes);
    expect(changed.right.panels).toEqual(["focus", "notes", "coaching"]);
    const restored = applyPlayArrangement(changed, changed.scenes[0]!.arrangement);
    expect(samePlayArrangement(restored, custom())).toBe(true);
    expect(restored.scenes).toEqual(saved.scenes);
  });
  it("keeps the fullscreen preference when a scene or preset is applied", () => {
    const layout = { ...custom(), gameOnlyPanelMode: "auto-hide" as const };
    expect(applyPlayArrangement(layout, playPreset("minimal")).gameOnlyPanelMode).toBe("auto-hide");
  });
  it("does not let a saved scene follow later edits to the layout", () => {
    const layout = custom();
    const saved = savePlayScene(layout, "Mine");
    layout.left.panels.push("stats");
    saved.left.panels.push("set");
    expect(saved.scenes[0]!.arrangement.left.panels).toEqual(["trends"]);
  });
  it("replaces a scene saved under the same name, whatever its case", () => {
    const first = savePlayScene(custom(), "Mine");
    const second = savePlayScene(placePlayPanel(first, "stats", "left"), "MINE");
    expect(second.scenes).toHaveLength(1);
    expect(second.scenes[0]!.name).toBe("MINE");
    expect(second.scenes[0]!.arrangement.left.panels).toEqual(["trends", "stats"]);
  });
  it("refuses blank, overlong and built-in names, and leaves the layout unchanged", () => {
    const layout = custom();
    for (const name of ["", "   ", "x".repeat(41), "Minimal", "live coaching", " PRACTICE "]) {
      expect(playSceneNameError(layout, name)).not.toBeNull();
      expect(savePlayScene(layout, name)).toBe(layout);
    }
    expect(playSceneNameError(layout, "x".repeat(40))).toBeNull();
  });
  it("stops at the scene limit but still lets an existing scene be replaced", () => {
    let layout = custom();
    for (let i = 0; i < MAX_PLAY_SCENES; i++) layout = savePlayScene(layout, `Scene ${i}`);
    expect(layout.scenes).toHaveLength(MAX_PLAY_SCENES);
    expect(savePlayScene(layout, "One more")).toBe(layout);
    expect(playSceneNameError(layout, "One more")).toContain("Delete one first");
    expect(savePlayScene(layout, "scene 3").scenes).toHaveLength(MAX_PLAY_SCENES);
    expect(playSceneNameError(layout, "scene 3")).toBeNull();
  });
  it("deletes only the named scene", () => {
    const layout = savePlayScene(savePlayScene(custom(), "A"), "B");
    expect(deletePlayScene(layout, "a").scenes.map((scene) => scene.name)).toEqual(["B"]);
    expect(deletePlayScene(layout, "missing").scenes).toHaveLength(2);
  });
  it("compares arrangements by content, ignoring the order modules were folded in", () => {
    const a = { ...custom(), collapsedPanels: ["notes", "oracle"] as PlayPanel[] };
    const b = { ...custom(), collapsedPanels: ["oracle", "notes"] as PlayPanel[] };
    expect(samePlayArrangement(a, b)).toBe(true);
    expect(samePlayArrangement(a, custom())).toBe(false);
    expect(samePlayArrangement(custom(), placePlayPanel(custom(), "notes", "right", 0))).toBe(false);
    expect(samePlayArrangement(custom(), { ...custom(), left: { ...custom().left, width: 300 } })).toBe(false);
  });
  it("round-trips saved scenes through stored configuration", () => {
    const layout = savePlayScene(savePlayScene(custom(), "A"), "B");
    expect(resolvePlayLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  });
  it("sanitizes stored scenes the same way it sanitizes the layout", () => {
    const layout = resolvePlayLayout({
      scenes: [
        {
          name: "Good",
          arrangement: { left: { panels: ["stats", "bogus"], width: 9000 }, right: { panels: ["stats"] } },
        },
        { name: "good", arrangement: { left: { panels: ["notes"] } } },
        { name: "Minimal", arrangement: {} },
        { name: "", arrangement: {} },
        { name: 7, arrangement: {} },
        { name: "No arrangement" },
        null,
        "scene",
      ],
    });
    expect(layout.scenes).toHaveLength(1);
    expect(layout.scenes[0]!.name).toBe("good");
    expect(layout.scenes[0]!.arrangement.left.panels).toEqual(["notes"]);
    const first = resolvePlayLayout({
      scenes: [
        {
          name: "Good",
          arrangement: { left: { panels: ["stats", "bogus"], width: 9000 }, right: { panels: ["stats"] } },
        },
      ],
    }).scenes[0]!.arrangement;
    expect(first.left).toEqual({ panels: ["stats"], width: 380, collapsed: false });
    expect(first.right.panels).toEqual([]);
    expect(resolvePlayLayout({ scenes: "nope" }).scenes).toEqual([]);
  });
  it("keeps at most the scene limit from stored configuration", () => {
    const scenes = Array.from({ length: MAX_PLAY_SCENES + 5 }, (_, i) => ({ name: `S${i}`, arrangement: {} }));
    const layout = resolvePlayLayout({ scenes });
    expect(layout.scenes.map((scene) => scene.name)).toEqual(scenes.slice(0, MAX_PLAY_SCENES).map((s) => s.name));
  });
});
