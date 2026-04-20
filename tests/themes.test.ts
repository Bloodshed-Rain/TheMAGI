import { describe, it, expect } from "vitest";
import { THEMES, THEME_ORDER, getResolvedTheme } from "../src/renderer/themes";

describe("themes", () => {
  it("includes all six themes with stable ids", () => {
    expect(Object.keys(THEMES).sort()).toEqual(["amber", "crt", "light", "liquid", "telemetry", "tournament"].sort());
  });

  it("orders liquid first", () => {
    expect(THEME_ORDER[0]).toBe("liquid");
  });

  it("liquid theme declares optional liquid tokens", () => {
    const liquid = THEMES["liquid"]!;
    expect(liquid.surfaceBlur).toBe("28px");
    expect(liquid.radiusMd).toBe("20px");
  });

  it("non-liquid themes leave optional tokens undefined", () => {
    expect(THEMES["telemetry"]!.surfaceBlur).toBeUndefined();
    expect(THEMES["tournament"]!.radiusMd).toBeUndefined();
  });

  it("getResolvedTheme falls back to liquid for unknown ids", () => {
    const t = getResolvedTheme("does-not-exist", "liquid");
    expect(t.id).toBe("liquid");
  });
});
