import { create } from "zustand";
import { ColorMode } from "../themes";

export type Density = "comfortable" | "compact";

interface GlobalState {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  density: Density;
  setDensity: (density: Density) => void;
  refreshKey: number;
  triggerRefresh: () => void;
}

export const useGlobalStore = create<GlobalState>((set) => ({
  colorMode: "liquid",
  setColorMode: (mode) => set({ colorMode: mode }),
  density: "comfortable",
  setDensity: (density) => set({ density }),
  refreshKey: 0,
  triggerRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
}));
