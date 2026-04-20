import { describe, it, expect, beforeEach } from "vitest";
import { useGlobalStore } from "../src/renderer/stores/useGlobalStore";

describe("useGlobalStore", () => {
  beforeEach(() => {
    useGlobalStore.setState({ density: "comfortable", colorMode: "liquid" });
  });

  it("defaults density to comfortable", () => {
    expect(useGlobalStore.getState().density).toBe("comfortable");
  });

  it("setDensity updates the slice", () => {
    useGlobalStore.getState().setDensity("compact");
    expect(useGlobalStore.getState().density).toBe("compact");
  });

  it("drawerGameId defaults to null and can be set/cleared", () => {
    expect(useGlobalStore.getState().drawerGameId).toBeNull();
    useGlobalStore.getState().openDrawer(42);
    expect(useGlobalStore.getState().drawerGameId).toBe(42);
    useGlobalStore.getState().closeDrawer();
    expect(useGlobalStore.getState().drawerGameId).toBeNull();
  });
});
