import { create } from "zustand";

interface ReplayPlayerState {
  open: boolean;
  replayPath: string | null;
  playerCharacter: string | null;
  opponentCharacter: string | null;
  startFrame: number | null;
  seekRevision: number;
  clipEndFrame: number | null;
  openClip: (
    replayPath: string,
    startFrame: number,
    endFrame: number,
    playerCharacter: string,
    opponentCharacter: string,
  ) => void;
  openPlayer: (replayPath: string, startFrame?: number, playerCharacter?: string, opponentCharacter?: string) => void;
  closePlayer: () => void;
}

export const useReplayPlayerStore = create<ReplayPlayerState>((set, get) => ({
  open: false,
  replayPath: null,
  playerCharacter: null,
  opponentCharacter: null,
  startFrame: null,
  seekRevision: 0,
  clipEndFrame: null,
  openClip: (path, start, end, player, opponent) => {
    get().openPlayer(path, start, player, opponent);
    set({ clipEndFrame: Math.max(start + 1, end) });
  },
  openPlayer: (replayPath, startFrame, playerCharacter, opponentCharacter) => {
    const cur = get();
    if (cur.open && cur.replayPath === replayPath) {
      set({
        clipEndFrame: null,
        startFrame: startFrame ?? 0,
        playerCharacter: playerCharacter ?? cur.playerCharacter,
        opponentCharacter: opponentCharacter ?? cur.opponentCharacter,
        seekRevision: cur.seekRevision + 1,
      });
      return;
    }
    set({
      open: true,
      clipEndFrame: null,
      replayPath,
      playerCharacter: playerCharacter ?? null,
      opponentCharacter: opponentCharacter ?? null,
      startFrame: startFrame ?? null,
      seekRevision: cur.seekRevision + 1,
    });
  },
  closePlayer: () =>
    set({
      open: false,
      clipEndFrame: null,
      replayPath: null,
      playerCharacter: null,
      opponentCharacter: null,
      startFrame: null,
    }),
}));
