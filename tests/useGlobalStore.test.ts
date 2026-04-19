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
});
