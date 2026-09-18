import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  buildReplayReviewClip,
  formatReplayFrame,
  type ReplayReviewClip,
  type ReplayReviewMarker,
  type ReplaySeekRequest,
} from "../../replayReview";
import { useEmbeddedReplaySession } from "../hooks/useEmbeddedReplaySession";
import { ReplayReviewTimeline } from "./ReplayReviewTimeline";
import { ReplayTransportControls } from "./ReplayTransportControls";

export interface ReplayEmbedProps {
  replayPath: string;
  seekRequest?: ReplaySeekRequest | undefined;
  durationFrames: number;
  markers?: ReplayReviewMarker[];
  onCloseRequest?: () => void;
}

type ActiveReviewClip = ReplayReviewClip & { label: string };

export function ReplayEmbed({
  replayPath,
  seekRequest,
  durationFrames,
  markers = [],
  onCloseRequest,
}: ReplayEmbedProps) {
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [activeClip, setActiveClip] = useState<ActiveReviewClip | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const loopSeekPendingRef = useRef(false);

  const {
    stageRef,
    status,
    errorMessage,
    isPaused,
    currentFrame,
    isExternal,
    seek,
    seekRelative,
    togglePause,
    restart,
  } = useEmbeddedReplaySession({
    enabled: true,
    replayPath,
    seekRequest,
    durationFrames,
  });

  useEffect(() => {
    if (!seekRequest?.endFrame) return;
    setSelectedMarkerId(null);
    setActiveClip({
      startFrame: seekRequest.frame,
      endFrame: seekRequest.endFrame,
      label: seekRequest.label ?? "Review clip",
    });
  }, [seekRequest]);

  useEffect(() => {
    if (!loopEnabled || !activeClip || status !== "ready") return;
    if (currentFrame < activeClip.endFrame || loopSeekPendingRef.current) return;
    loopSeekPendingRef.current = true;
    void seek(activeClip.startFrame).finally(() => {
      window.setTimeout(() => {
        loopSeekPendingRef.current = false;
      }, 350);
    });
  }, [activeClip, currentFrame, loopEnabled, seek, status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) {
        return;
      }
      if (event.key === "Escape" && onCloseRequest) onCloseRequest();
      // Embed-only hotkeys — external Playback has no live session
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
  }, [isExternal, onCloseRequest, seekRelative, status, togglePause]);

  const onMarker = (marker: ReplayReviewMarker) => {
    const clip = buildReplayReviewClip(marker.frame, durationFrames);
    setSelectedMarkerId(marker.id);
    setActiveClip({ ...clip, label: marker.label });
    void seek(clip.startFrame);
  };

  const onScrub = (frame: number) => {
    setSelectedMarkerId(null);
    setActiveClip(null);
    setLoopEnabled(false);
    void seek(frame);
  };

  const onRestart = () => {
    setSelectedMarkerId(null);
    setActiveClip(null);
    setLoopEnabled(false);
    void restart();
  };

  const onOpenInDolphin = async () => {
    try {
      await window.clippi.openInDolphinAtFrame(replayPath, currentFrame);
    } catch (error) {
      console.error("Dolphin launch failed:", error);
    }
  };

  return (
    <div className="replay-embed">
      <div className="replay-player-stage replay-embed-stage" ref={stageRef}>
        {status === "opening" && (
          <div className="replay-player-loading">
            <div className="spinner" style={{ marginBottom: 12 }} />
            Launching Dolphin…
          </div>
        )}
        {status === "ended" && (
          <div className="replay-player-loading replay-player-ended">
            Replay ended. Restart it or choose another review marker.
          </div>
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
              Embedded playback is Windows-only. Click a marker or scrub to open at that frame.
            </div>
          </div>
        )}
      </div>

      <ReplayReviewTimeline
        durationFrames={durationFrames}
        currentFrame={currentFrame}
        markers={markers}
        selectedMarkerId={selectedMarkerId}
        onScrub={onScrub}
        onMarker={onMarker}
      />

      <div className="replay-player-footer">
        {!isExternal && (
          <ReplayTransportControls
            status={status}
            isPaused={isPaused}
            onTogglePause={() => void togglePause()}
            onSeekRelative={(seconds) => void seekRelative(seconds)}
            onRestart={onRestart}
            loopEnabled={loopEnabled}
            onToggleLoop={() => setLoopEnabled((current) => !current)}
          />
        )}

        <div className="replay-player-footer-right">
          {activeClip && (
            <span className="replay-review-clip-label" title={activeClip.label}>
              {activeClip.label} · {formatReplayFrame(activeClip.startFrame)}–{formatReplayFrame(activeClip.endFrame)}
            </span>
          )}
          <button className="replay-player-dolphin" type="button" onClick={onOpenInDolphin}>
            <ExternalLink size={13} />
            Open Externally
          </button>
        </div>
      </div>
    </div>
  );
}
