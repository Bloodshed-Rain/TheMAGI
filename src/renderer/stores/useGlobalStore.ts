import { create } from "zustand";
import { ColorMode } from "../themes";

export type Density = "comfortable" | "compact";

interface GlobalState {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  density: Density;
  setDensity: (density: Density) => void;
  drawerGameId: number | null;
  openDrawer: (id: number) => void;
  closeDrawer: () => void;
  refreshKey: number;
  triggerRefresh: () => void;
}

export const useGlobalStore = create<GlobalState>((set) => ({
  colorMode: "liquid",
  setColorMode: (mode) => set({ colorMode: mode }),
  density: "comfortable",
  setDensity: (density) => set({ density }),
  drawerGameId: null,
  openDrawer: (id) => set({ drawerGameId: id }),
  closeDrawer: () => set({ drawerGameId: null }),
  refreshKey: 0,
  triggerRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
}));
