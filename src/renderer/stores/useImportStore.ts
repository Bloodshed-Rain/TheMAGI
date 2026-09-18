import { create } from "zustand";
import { refreshData } from "../hooks/cache";

type Progress = Parameters<Parameters<typeof window.clippi.onImportProgress>[0]>[0];
interface ImportState {
  busy: boolean;
  message: string;
  progress: Progress | null;
  errors: Array<{ filePath: string; error: string }>;
  failed: boolean;
  run: (folder: string, player: string) => Promise<void>;
}

export const useImportStore = create<ImportState>((set, get) => ({
  busy: false, message: "", progress: null, errors: [], failed: false,
  run: async (folder, player) => {
    if (get().busy) return;
    if (!folder.trim() || !player.trim()) {
      set({ message: "Choose a replay folder and enter a connect code or player tag in Profile.", failed: true });
      return;
    }
    set({ busy: true, message: "Scanning replay folder…", progress: null, errors: [], failed: false });
    try {
      const result = await window.clippi.importFolder(folder, player.trim());
      set({ message: `${result.imported} imported · ${result.skipped} skipped · ${result.errors} failed · ${result.total} files${result.unreadableDirs ? ` · ${result.unreadableDirs} unreadable folders` : ""}`,
        errors: result.errorDetails ?? [], failed: result.errors > 0 || result.unreadableDirs > 0 });
      await refreshData();
    } catch (error) {
      set({ message: `Import failed: ${error instanceof Error ? error.message : String(error)}`, failed: true });
      await refreshData(); // A partially completed import may have written games.
    } finally {
      set({ busy: false, progress: null });
    }
  },
}));
