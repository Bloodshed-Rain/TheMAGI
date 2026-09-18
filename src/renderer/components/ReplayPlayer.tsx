import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import { useEmbeddedReplaySession } from "../hooks/useEmbeddedReplaySession";
import { useReplayPlayerStore } from "../stores/useReplayPlayerStore";
import { ReplayTransportControls } from "./ReplayTransportControls";

export function ReplayPlayer() {
  const open = useReplayPlayerStore((state) => state.open);
  const replayPath = useReplayPlayerStore((state) => state.replayPath);
  const playerCharacter = useReplayPlayerStore((state) => state.playerCharacter);
  const opponentCharacter = useReplayPlayerStore((state) => state.opponentCharacter);
  const startFrame = useReplayPlayerStore((state) => state.startFrame);
  const seekRevision = useReplayPlayerStore((state) => state.seekRevision);
  const closePlayer = useReplayPlayerStore((state) => state.closePlayer);

  const seekRequest = useMemo(
    () => (replayPath ? { id: seekRevision, frame: startFrame ?? 0 } : undefined),
    [replayPath, seekRevision, startFrame],
  );

  const { stageRef, status, errorMessage, isPaused, currentFrame, isExternal, seekRelative, togglePause, restart } =
    useEmbeddedReplaySession({
      enabled: open,
      replayPath,
      seekRequest,
    });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) {
        return;
      }
      if (event.key === "Escape") {
        closePlayer();
        return;
      }
      if (isExternal || status === "fallback") return;
      if (target?.closest("button, a, [role='button'], [role='slider']")) return;
      if (event.key === " ") {
        event.preventDefault();
        void togglePause();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        void seekRelative(-2);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        void seekRelative(2);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePlayer, isExternal, open, seekRelative, status, togglePause]);

  const onOpenInDolphin = async () => {
    if (!replayPath) return;
    try {
      await window.clippi.openInDolphinAtFrame(replayPath, currentFrame);
    } catch (error) {
      console.error("Dolphin launch failed:", error);
    }
  };

  return (
    <AnimatePresence>
      {open && replayPath && (
        <div className="replay-player-backdrop">
          <motion.div
            className="replay-player-modal"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <button className="replay-player-close" type="button" onClick={closePlayer} aria-label="Close player">
              <X size={18} />
            </button>

            <div className="replay-player-titlebar">
              <span className="replay-player-titlebar-label">
                {playerCharacter && opponentCharacter
                  ? `${playerCharacter} vs ${opponentCharacter}`
                  : "Replay Playback"}
              </span>
            </div>

            <div className="replay-player-stage" ref={stageRef}>
              {status === "opening" && (
                <div className="replay-player-loading">
                  <div className="spinner" style={{ marginBottom: 12 }} />
                  Launching Dolphin…
                </div>
              )}
              {status === "ended" && (
                <div className="replay-player-loading replay-player-ended">Replay ended. Restart to watch again.</div>
              )}
              {status === "error" && (
                <div className="replay-player-error">
                  <div>{errorMessage ?? "Could not open Slippi Dolphin"}</div>
                  <button className="replay-player-dolphin" type="button" onClick={onOpenInDolphin}>
                    <ExternalLink size={13} />
                    Open in Dolphin instead
                  </button>
                </div>
              )}
              {status === "fallback" && (
                <div className="replay-player-error">
                  <div>Playing in Slippi Dolphin (external)</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    Embedded playback is Windows-only. Use Open Externally to relaunch at the current frame.
                  </div>
                </div>
              )}
            </div>

            <div className="replay-player-footer">
              {!isExternal && (
                <ReplayTransportControls
                  status={status}
                  isPaused={isPaused}
                  onTogglePause={() => void togglePause()}
                  onSeekRelative={(seconds) => void seekRelative(seconds)}
                  onRestart={() => void restart()}
                  showCloseHint
                />
              )}

              <div className="replay-player-footer-right">
                <button className="replay-player-dolphin" type="button" onClick={onOpenInDolphin}>
                  <ExternalLink size={13} />
                  Open Externally
                </button>
                <span className="replay-player-hint">esc to close</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
