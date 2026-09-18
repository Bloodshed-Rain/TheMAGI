import { useDialog } from "../hooks/useDialog";
import { useFollowOutput } from "../hooks/useFollowOutput";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Compass, Play } from "lucide-react";
import { CoachingCards } from "./CoachingCards";
import { makeTimestampComponents, injectTimestampLinks } from "../utils/timestampLinks";
import { useReplayPlayerStore } from "../stores/useReplayPlayerStore";

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
  playerCharacter?: string;
  opponentCharacter?: string;
}

export function CoachingModal({
  isOpen,
  onClose,
  scope,
  id,
  title,
  preloadedText,
  replayPath,
  playerCharacter,
  opponentCharacter,
}: CoachingModalProps) {
  const [analysis, setAnalysis] = useState(preloadedText ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuePos, setQueuePos] = useState<number>(0);
  const openPlayer = useReplayPlayerStore((s) => s.openPlayer);
  const isReplayOpen = useReplayPlayerStore((s) => s.open);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
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
    if (isOpen && !analysis && !loading && !error) {
      runAnalysis();
    }
  }, [isOpen, analysis, loading, error, runAnalysis]);

  useDialog(panelRef, isOpen, onClose, closeRef, !isReplayOpen);



  if (!isOpen) return null;

  const modalClass = `coaching-modal${isReplayOpen ? " coaching-modal--replay-open" : ""}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        ref={panelRef}
        className={modalClass}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coaching-modal-heading"
        tabIndex={-1}
        initial={{ x: "100%", opacity: 1 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 1 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
      >
        <header className="coaching-header">
          <div className="coaching-title-row">
            <div className="coaching-icon">
              <Compass size={20} />
            </div>
            <div>
              <h2 id="coaching-modal-heading" className="coaching-heading">
                MAGI Coaching
              </h2>
              <p className="coaching-subtitle">{title}</p>
            </div>
          </div>
          <button ref={closeRef} className="coaching-close" onClick={onClose} aria-label="Close coaching">
            &times;
          </button>
        </header>

        {unread && <button className="btn" onClick={resume}>New response · Jump to latest</button>}
      <div ref={bodyRef} className="coaching-body custom-scrollbar">
          {error && (
            <div className="coaching-error">
              <div>{error}</div>
              <button className="btn" onClick={runAnalysis}>
                Try Again
              </button>
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
          <p className="coaching-disclaimer">AI analysis may occasionally hallucinate frame-perfect tech.</p>
          <div className="coaching-footer-actions">
            {replayPath && (
              <button
                className="btn game-card-watch-btn"
                onClick={() => openPlayer(replayPath, 0, playerCharacter, opponentCharacter)}
              >
                <Play size={14} />
                Watch Replay
              </button>
            )}
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}
