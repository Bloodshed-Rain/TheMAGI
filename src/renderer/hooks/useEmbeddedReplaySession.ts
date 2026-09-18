import { useCallback, useEffect, useRef, useState } from "react";
import { clampReplayFrame, REPLAY_FRAMES_PER_SECOND, type ReplaySeekRequest } from "../../replayReview";

type Bounds = { x: number; y: number; width: number; height: number };

export type ReplayPlaybackStatus = "opening" | "ready" | "seeking" | "ended" | "error" | "fallback";

interface EmbeddedReplaySessionOptions {
  enabled: boolean;
  replayPath: string | null;
  seekRequest?: ReplaySeekRequest | undefined;
  durationFrames?: number;
}

function getStageBounds(el: HTMLElement): Bounds {
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    x: Math.round(rect.left * dpr),
    y: Math.round(rect.top * dpr),
    width: Math.round(rect.width * dpr),
    height: Math.round(rect.height * dpr),
  };
}

export function useEmbeddedReplaySession({
  enabled,
  replayPath,
  seekRequest,
  durationFrames = Number.MAX_SAFE_INTEGER,
}: EmbeddedReplaySessionOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<ReplayPlaybackStatus>("opening");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(seekRequest?.frame ?? 0);
  const [openRevision, setOpenRevision] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const statusRef = useRef<ReplayPlaybackStatus>("opening");
  const replayPathRef = useRef(replayPath);
  const currentFrameRef = useRef(currentFrame);
  const latestRequestRef = useRef(seekRequest);
  const appliedRequestIdRef = useRef<number | null>(null);
  const seekSequenceRef = useRef(0);
  const reopenFrameRef = useRef<number | null>(null);

  latestRequestRef.current = seekRequest;
  currentFrameRef.current = currentFrame;
  statusRef.current = status;
  replayPathRef.current = replayPath;

  const setFrame = useCallback(
    (frame: number) => {
      const next = clampReplayFrame(frame, durationFrames);
      currentFrameRef.current = next;
      setCurrentFrame(next);
      return next;
    },
    [durationFrames],
  );

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    const offReady = window.clippi.onEmbedReplayReady((id) => {
      if (id === sessionIdRef.current) setStatus("ready");
    });
    const offError = window.clippi.onEmbedReplayError((id, message) => {
      if (id !== sessionIdRef.current) return;
      sessionIdRef.current = null;
      setSessionId(null);
      setStatus("error");
      setErrorMessage(message);
    });
    const offExited = window.clippi.onEmbedReplayExited((id) => {
      if (id !== sessionIdRef.current) return;
      sessionIdRef.current = null;
      setSessionId(null);
      setIsPaused(false);
      setStatus("ended");
    });
    return () => {
      offReady();
      offError();
      offExited();
    };
  }, []);

  useEffect(() => {
    if (!enabled || !replayPath || !stageRef.current) return;

    let cancelled = false;
    const stage = stageRef.current;
    const timeout = window.setTimeout(async () => {
      if (cancelled) return;
      const request = latestRequestRef.current;
      const initialFrame = setFrame(reopenFrameRef.current ?? request?.frame ?? 0);
      reopenFrameRef.current = null;

      try {
        const previousSessionId = sessionIdRef.current;
        if (previousSessionId) {
          await window.clippi.embedReplayClose(previousSessionId).catch(() => {});
          sessionIdRef.current = null;
          setSessionId(null);
        }

        setStatus("opening");
        setErrorMessage(null);
        setIsPaused(false);
        const result = await window.clippi.embedReplayOpen(replayPath, getStageBounds(stage), initialFrame);

        if (cancelled) {
          if (result.sessionId) await window.clippi.embedReplayClose(result.sessionId).catch(() => {});
          return;
        }

        if (!result.embedded) {
          // Non-Windows (and any OS without embed): honest external Playback path
          try {
            await window.clippi.openInDolphinAtFrame(replayPath, initialFrame);
            if (cancelled) return;
            setStatus("fallback");
            setErrorMessage(null);
            appliedRequestIdRef.current = request?.id ?? null;
          } catch (launchError) {
            if (cancelled) return;
            setStatus("error");
            setErrorMessage(
              launchError instanceof Error
                ? launchError.message
                : String(launchError) || "Failed to open Slippi Dolphin. Check Settings.",
            );
          }
          return;
        }

        if (result.sessionId) {
          sessionIdRef.current = result.sessionId;
          setSessionId(result.sessionId);
          appliedRequestIdRef.current = request?.id ?? null;
        }
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [enabled, openRevision, replayPath, setFrame]);

  useEffect(() => {
    if (enabled) return;
    const id = sessionIdRef.current;
    if (!id) return;
    window.clippi.embedReplayClose(id).catch(() => {});
    sessionIdRef.current = null;
    setSessionId(null);
    setStatus("opening");
    setErrorMessage(null);
  }, [enabled]);

  useEffect(
    () => () => {
      const id = sessionIdRef.current;
      if (id) window.clippi.embedReplayClose(id).catch(() => {});
      sessionIdRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!enabled || status !== "ready" || !sessionId || !stageRef.current) return;
    const stage = stageRef.current;
    let animationFrame: number | null = null;

    const sync = () => {
      animationFrame = null;
      const id = sessionIdRef.current;
      if (id) window.clippi.embedReplaySetBounds(id, getStageBounds(stage)).catch(() => {});
    };
    const schedule = () => {
      if (animationFrame == null) animationFrame = requestAnimationFrame(sync);
    };
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(stage);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (animationFrame != null) cancelAnimationFrame(animationFrame);
    };
  }, [enabled, sessionId, status]);

  useEffect(() => {
    if (status !== "ready" || isPaused) return;
    const timer = window.setInterval(() => {
      setFrame(currentFrameRef.current + REPLAY_FRAMES_PER_SECOND / 10);
    }, 100);
    return () => window.clearInterval(timer);
  }, [isPaused, setFrame, status]);

  const seek = useCallback(
    async (frame: number, endFrame?: number): Promise<boolean> => {
      const nextFrame = setFrame(frame);
      const path = replayPathRef.current;

      // External Playback mode: relaunch Dolphin at frame (v1 — no live session)
      if (statusRef.current === "fallback") {
        if (!path) return false;
        setErrorMessage(null);
        try {
          await window.clippi.openInDolphinAtFrame(path, nextFrame);
          return true;
        } catch (error) {
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : String(error));
          return false;
        }
      }

      const id = sessionIdRef.current;
      if (!id) return false;
      const nextEndFrame = endFrame == null ? undefined : clampReplayFrame(endFrame, durationFrames);
      const sequence = ++seekSequenceRef.current;
      setStatus("seeking");
      setErrorMessage(null);
      setIsPaused(false);
      try {
        const accepted = await window.clippi.embedReplaySeek(id, nextFrame, nextEndFrame);
        if (!accepted) throw new Error("The active Dolphin session could not accept the seek.");
        window.setTimeout(() => {
          if (seekSequenceRef.current === sequence && sessionIdRef.current === id) setStatus("ready");
        }, 300);
        return true;
      } catch (error) {
        if (seekSequenceRef.current === sequence) {
          await window.clippi.embedReplayClose(id).catch(() => {});
          if (sessionIdRef.current === id) {
            sessionIdRef.current = null;
            setSessionId(null);
          }
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
        return false;
      }
    },
    [durationFrames, setFrame],
  );

  useEffect(() => {
    if (!seekRequest || seekRequest.id === appliedRequestIdRef.current) return;
    if (!sessionId) {
      if (enabled && replayPath && status === "fallback") {
        appliedRequestIdRef.current = seekRequest.id;
        void seek(seekRequest.frame);
        return;
      }
      if (enabled && replayPath && (status === "ended" || status === "error")) {
        appliedRequestIdRef.current = seekRequest.id;
        reopenFrameRef.current = seekRequest.frame;
        setFrame(seekRequest.frame);
        setOpenRevision((current) => current + 1);
      }
      return;
    }
    appliedRequestIdRef.current = seekRequest.id;
    void seek(seekRequest.frame);
  }, [enabled, replayPath, seek, seekRequest, sessionId, setFrame, status]);

  const togglePause = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id || status !== "ready") return false;
    const accepted = await window.clippi.embedReplaySendKey(id, 0x20);
    if (accepted) setIsPaused((current) => !current);
    return accepted;
  }, [status]);

  const seekRelative = useCallback(
    (seconds: number) => seek(currentFrameRef.current + seconds * REPLAY_FRAMES_PER_SECOND),
    [seek],
  );

  const restart = useCallback(() => {
    if (statusRef.current === "fallback") return seek(0);
    if (sessionIdRef.current) return seek(0);
    if (!enabled || !replayPath) return Promise.resolve(false);
    reopenFrameRef.current = 0;
    setFrame(0);
    setOpenRevision((current) => current + 1);
    return Promise.resolve(true);
  }, [enabled, replayPath, seek, setFrame]);

  const isExternal = status === "fallback";

  return {
    stageRef,
    sessionId,
    status,
    errorMessage,
    isPaused,
    currentFrame,
    isExternal,
    seek,
    seekRelative,
    togglePause,
    restart,
  };
}
