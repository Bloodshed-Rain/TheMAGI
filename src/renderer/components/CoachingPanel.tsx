import { useFollowOutput } from "../hooks/useFollowOutput";
import { useState, useEffect, useCallback, useRef } from "react";
import { Compass } from "lucide-react";
import { CoachingCards } from "./CoachingCards";
import { makeTimestampComponents, injectTimestampLinks } from "../utils/timestampLinks";

export interface CoachingPanelProps {
  scope: "game" | "session" | "character" | "stage" | "opponent" | "career";
  id: string | number;
  title: string;
  /** Pre-loaded analysis text — when present, skips the LLM call entirely. */
  preloadedText?: string | undefined;
  /** Replay path used to enable timestamp click-to-seek inside the coaching text. */
  replayPath?: string | undefined;
  /** Receives the seek frame when a timestamp is clicked. When omitted,
   *  timestamp clicks fall back to opening the global ReplayPlayer. */
  onTimestampSeek?: ((frame: number) => void) | undefined;
}

/**
 * Inline coaching surface — same streaming + CoachingCards rendering as
 * CoachingModal, minus the modal chrome. Intended to live in a sidebar
 * column (e.g., GameTheater).
 */
export function CoachingPanel({ scope, id, title, preloadedText, replayPath, onTimestampSeek }: CoachingPanelProps) {
  const [analysis, setAnalysis] = useState(preloadedText ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuePos, setQueuePos] = useState<number>(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { unread, resume } = useFollowOutput(bodyRef, analysis);

  const runAnalysis = useCallback(async () => {
    if (preloadedText) return;
    setLoading(true);
    setAnalysis("");
    setError(null);
    setQueuePos(0);

    try {
      window.clippi
        .getQueueStatus()
        .then((s) => setQueuePos(s.pending))
        .catch(() => {});

      const streamId = crypto.randomUUID();
      const removeListener = window.clippi.onAnalysisStream((chunk, sid) => {
        if (sid !== undefined && sid !== streamId) return;
        setQueuePos(0);
        setAnalysis((prev) => prev + chunk);
      });

      const removeEndListener = window.clippi.onAnalysisStreamEnd((sid) => {
        if (sid !== undefined && sid !== streamId) return;
        setLoading(false);
      });

      try {
        const result = await window.clippi.analyzeScoped(scope, id, undefined, streamId);
        if (result) {
          setAnalysis(result);
          setLoading(false);
        }
      } finally {
        removeListener();
        removeEndListener();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [scope, id, preloadedText]);

  useEffect(() => {
    if (!analysis && !loading) {
      runAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, id]);



  const components = replayPath ? makeTimestampComponents(replayPath, onTimestampSeek) : undefined;
  const text = replayPath ? injectTimestampLinks(analysis) : analysis;

  return (
    <section className="coaching-panel">
      <header className="coaching-panel-header">
        <div className="coaching-icon">
          <Compass size={18} />
        </div>
        <div>
          <h2 className="coaching-heading">MAGI Coaching</h2>
          <p className="coaching-subtitle">{title}</p>
        </div>
      </header>

      {unread && <button className="btn" onClick={resume}>New response · Jump to latest</button>}
      <div ref={bodyRef} className="coaching-panel-body">
        {error && <div className="coaching-error" role="alert">{error}<button className="btn" onClick={runAnalysis}>Retry</button></div>}

        {!analysis && loading && (
          <div className="coaching-loading">
            <div className="spinner spinner-lg" />
            <p className="coaching-loading-text">
              {queuePos > 0 ? `Queued (position ${queuePos})...` : "Consulting MAGI mainframe..."}
            </p>
          </div>
        )}

        <CoachingCards text={text} isStreaming={loading && !!analysis} markdownComponents={components} />
      </div>
    </section>
  );
}
