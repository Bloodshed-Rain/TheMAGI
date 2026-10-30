import { describe, expect, it } from "vitest";
import { techniqueActionRange } from "../src/techniqueClips";
import { useReplayPlayerStore } from "../src/renderer/stores/useReplayPlayerStore";
import { buildExternalReplayComm } from "../src/main/handlers/dolphinResolve";

describe("action clips", () => {
  it("cuts a Ken combo around the actual move frames", () => {
    expect(
      techniqueActionRange(
        "kenCombos",
        [
          { frame: 600, moveId: 14 },
          { frame: 630, moveId: 14 },
          { frame: 660, moveId: 17 },
        ],
        true,
      ),
    ).toEqual({ startFrame: 540, endFrame: 750 });
  });
  it("finds multi-shines and shine to up smash without requiring a kill", () => {
    const moves = [
      { frame: 100, moveId: 21 },
      { frame: 150, moveId: 21 },
      { frame: 200, moveId: 11 },
    ];
    expect(techniqueActionRange("multiShineCombos", moves, false)).toEqual({ startFrame: 40, endFrame: 240 });
    expect(techniqueActionRange("waveshineToUpsmash", moves, false)?.endFrame).toBe(290);
    expect(
      techniqueActionRange(
        "kenCombos",
        [
          { frame: 100, moveId: 14 },
          { frame: 150, moveId: 17 },
        ],
        false,
      ),
    ).toBeNull();
    expect(techniqueActionRange("turnipPulls", moves, false)).toBeNull();
  });
  it("does not turn interrupted patterns or bad frame data into clips", () => {
    expect(
      techniqueActionRange(
        "pillarCombos",
        [
          { frame: 100, moveId: 17 },
          { frame: 110, moveId: 14 },
          { frame: 130, moveId: 21 },
          { frame: 150, moveId: 17 },
        ],
        false,
      ),
    ).toBeNull();
    expect(
      techniqueActionRange(
        "kenCombos",
        [
          { frame: Number.NaN, moveId: 14 },
          { frame: 150, moveId: 17 },
        ],
        false,
      ),
    ).toBeNull();
    expect(
      techniqueActionRange(
        "kenCombos",
        [
          { frame: 10, moveId: 14 },
          { frame: 30, moveId: 14 },
          { frame: 50, moveId: 17 },
        ],
        true,
      )?.startFrame,
    ).toBe(0);
  });
  it("preserves the clip end on repeat clicks and clears it for ordinary replay playback", () => {
    const store = useReplayPlayerStore;
    store.getState().openClip("clip.slp", 100, 200, "Marth", "Fox");
    const revision = store.getState().seekRevision;
    store.getState().openClip("clip.slp", 300, 400, "Marth", "Fox");
    expect(store.getState().clipEndFrame).toBe(400);
    expect(store.getState().seekRevision).toBeGreaterThan(revision);
    store.getState().openPlayer("clip.slp", 0);
    expect(store.getState().clipEndFrame).toBeNull();
    store.getState().closePlayer();
  });
  it("bounds external Dolphin playback as well", () => {
    const data = buildExternalReplayComm("clip.slp", 540, 750).commData;
    expect(data.queue).toEqual([{ path: "clip.slp", startFrame: 540, endFrame: 750 }]);
  });
});
