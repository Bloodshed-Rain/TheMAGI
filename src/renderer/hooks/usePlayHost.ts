import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayBounds, PlayStatus } from "../../playMode";

export function usePlayHost(placementKey: string) {
  const stageRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<PlayStatus>({ phase: "stopped", visible: false, error: null });
  const statusRevision = useRef(0);
  const presentationRevision = useRef(0);
  const actionBusy = useRef(false);
  const [status, setStatus] = useState(statusRef.current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameOnly, setGameOnly] = useState(false);
  useEffect(() => {
    let alive = true;
    let received = false;
    const off = window.clippi.onPlayGameOnly((active) => {
      presentationRevision.current++;
      received = true;
      if (alive) setGameOnly(active);
    });
    void window.clippi
      .playGameOnly()
      .then((active) => {
        if (alive && !received) setGameOnly(active);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
      off();
    };
  }, []);
  const bounds = useCallback((): PlayBounds => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) throw new Error("Game area is not ready yet.");
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, []);
  useEffect(() => {
    let alive = true;
    let received = false;
    const apply = (next: PlayStatus) => {
      statusRef.current = next;
      if (alive) setStatus(next);
    };
    const off = window.clippi.onPlayStatus((next) => {
      statusRevision.current++;
      received = true;
      apply(next);
    });
    void window.clippi
      .playStatus()
      .then((next) => {
        if (alive && !received) apply(next);
      })
      .catch((e) => setError(String(e)));
    return () => {
      alive = false;
      off();
      void window.clippi.playHide().catch(() => {});
    };
  }, []);
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (statusRef.current.phase !== "running" && statusRef.current.phase !== "launching") return;
        try {
          void window.clippi.playShow(bounds()).catch((e) => setError(String(e)));
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    // The stage can move without changing size when setup or headers change.
    observer.observe(element.parentElement!);
    window.addEventListener("resize", sync);
    sync();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", sync);
    };
  }, [bounds, status.phase, placementKey, gameOnly]);
  const act = async (operation: () => Promise<PlayStatus>) => {
    if (actionBusy.current) return null;
    actionBusy.current = true;
    const revision = statusRevision.current;
    setBusy(true);
    setError(null);
    try {
      const next = await operation();
      // A running/exited event can arrive before the IPC reply to Start. Never
      // let the older reply put the UI back into "Launching Melee" indefinitely.
      if (statusRevision.current === revision) {
        statusRef.current = next;
        setStatus(next);
      }
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  };
  return {
    stageRef,
    status,
    busy,
    error: error || status.error,
    gameOnly,
    enterGameOnly: async () => {
      const revision = presentationRevision.current;
      setError(null);
      try {
        const active = await window.clippi.playGameOnly(true);
        if (presentationRevision.current === revision) setGameOnly(active);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    start: () => act(() => window.clippi.playStart(bounds())),
    stop: () => act(() => window.clippi.playStop()),
  };
}
