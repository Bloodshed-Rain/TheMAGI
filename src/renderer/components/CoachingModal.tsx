import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Compass, Play } from "lucide-react";
import { CoachingCards } from "./CoachingCards";
import {
  makeTimestampComponents,
  injectTimestampLinks,
} from "../utils/timestampLinks";

interface CoachingModalProps {
  isOpen: boolean;
  onClose: () => void;
  scope: "game" | "session" | "character" | "stage" | "opponent" | "career";
  id: string | number;
  title: string;
  /** Pre-loaded analysis text (skips LLM call when provided) */
  preloadedText?: string;
  /** Replay path for timestamp click-to-Dolphin support */
  replayPath?: string;
}

export function CoachingModal({ isOpen, onClose, scope, id, title, preloadedText, replayPath }: CoachingModalProps) {
  const [analysis, setAnalysis] = useState(preloadedText ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuePos, setQueuePos] = useState<number>(0);
  const [dolphinLoading, setDolphinLoading] = useState(false);
  const [dolphinError, setDolphinError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    if (preloadedText) return;
    setLoading(true);
    setAnalysis("");
    setError(null);
    setQueuePos(0);

    try {
      window.clippi.getQueueStatus().then(s => setQueuePos(s.pending)).catch(() => {});

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
    } catch (err: any) {
      setError(err.message || String(err));
      setLoading(false);
    }
  }, [scope, id, preloadedText]);

  useEffect(() => {
    if (isOpen && !analysis && !loading) {
      runAnalysis();
    }
  }, [isOpen, analysis, loading, runAnalysis]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="coaching-modal"
        onClick={e => e.stopPropagation()}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
      >
        <header className="coaching-header">
          <div className="coaching-title-row">
            <div className="coaching-icon">
              <Compass size={20} />
            </div>
            <div>
              <h2 className="coaching-heading">MAGI Coaching</h2>
              <p className="coaching-subtitle">{title}</p>
            </div>
          </div>
          <button className="coaching-close" onClick={onClose}>&times;</button>
        </header>

        <div className="coaching-body custom-scrollbar">
          {error && (
            <div className="coaching-error">
              {error}
            </div>
          )}

          {!analysis && loading && (
            <div className="coaching-loading">
              <div className="spinner spinner-lg" />
              <p className="coaching-loading-text">
                {queuePos > 0 ? `Queued (position ${queuePos})...` : "Consulting MAGI mainframe..."}
              </p>
            </div>
          )}

          <CoachingCards
            text={replayPath ? injectTimestampLinks(analysis) : analysis}
            isStreaming={loading && !!analysis}
            markdownComponents={replayPath ? makeTimestampComponents(replayPath) : undefined}
          />
        </div>

        <footer className="coaching-footer">
          <p className="coaching-disclaimer">
            AI analysis may occasionally hallucinate frame-perfect tech.
          </p>
          <div className="coaching-footer-actions">
            {replayPath && (
              <button
                className="btn game-card-watch-btn"
                disabled={dolphinLoading}
                onClick={async () => {
                  setDolphinError(null);
                  setDolphinLoading(true);
                  try {
                    await window.clippi.openInDolphin(replayPath);
                  } catch (err: unknown) {
                    setDolphinError(err instanceof Error ? err.message : String(err));
                  }
                  setDolphinLoading(false);
                }}
              >
                <Play size={14} />
                {dolphinLoading ? "Launching..." : "Watch Replay"}
              </button>
            )}
            {dolphinError && <span className="game-card-error">{dolphinError}</span>}
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}
