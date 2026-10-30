import { useEffect, useState } from "react";

export interface CornermanLiveStatsState {
  snapshot: CornermanLiveSnapshot | null;
  /** Wall-clock time (ms) the current snapshot arrived — drives the STALE pill. */
  receivedAt: number;
}

/**
 * Subscribes to the main-process live-stats stream and seeds from the cached
 * latest snapshot for instant paint on a late mount. Used identically by the
 * overlay and the Cornerman page (each is its own renderer process, so the
 * broadcast IS the shared state — no cross-window store).
 */
export function useCornermanLiveStats(): CornermanLiveStatsState {
  const [state, setState] = useState<CornermanLiveStatsState>({ snapshot: null, receivedAt: 0 });

  useEffect(() => {
    let cancelled = false;
    let seedAllowed = true;

    const apply = (next: CornermanLiveSnapshot) => {
      seedAllowed = false;
      setState((prev) => {
        const current = prev.snapshot;
        // Straggler guard: a trailing FINAL from a different (older) game — e.g.
        // the seeded tracker flushing its end just after a new game started —
        // must not overwrite the new game's live strip.
        if (current && next.phase === "ended" && current.phase === "live" && next.gameKey !== current.gameKey) {
          return prev;
        }
        return { snapshot: next, receivedAt: Date.now() };
      });
    };

    // Seed only when empty, so a live emit that lands first always wins the race.
    window.clippi
      .cornermanLiveStatsLatest()
      .then((seed) => {
        if (cancelled || !seedAllowed || !seed) return;
        setState((prev) => (prev.snapshot ? prev : { snapshot: seed, receivedAt: Date.now() }));
      })
      .catch(() => {});

    const off = window.clippi.onCornermanLiveStats(apply);

    // Clear the cached snapshot when the corner session ENDS. cornerman:stop
    // nulls the main-side cache but broadcasts only set-update{active:false}, and
    // the persistent Cornerman page (unlike the overlay, which is torn down on
    // stop) keeps this hook mounted — so without this it would still show the
    // previous session's FINAL stats as the next session's "Live game". Fires
    // only on true session end: between games the session stays active, so the
    // FINAL freeze is preserved.
    const offUpdate = window.clippi.onCornermanSetUpdate((status) => {
      seedAllowed = false;
      if (!status.active) setState({ snapshot: null, receivedAt: 0 });
    });

    return () => {
      cancelled = true;
      off();
      offUpdate();
    };
  }, []);

  return state;
}
