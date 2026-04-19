import { create } from "zustand";
import { ColorMode } from "../themes";

interface GlobalState {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  refreshKey: number;
  triggerRefresh: () => void;
}

export const useGlobalStore = create<GlobalState>((set) => ({
  colorMode: "liquid",
  setColorMode: (mode) => set({ colorMode: mode }),
  refreshKey: 0,
  triggerRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
}));
