import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

interface CoachingModalProps {
  isOpen: boolean;
  onClose: () => void;
  scope: "game" | "session" | "character" | "stage" | "opponent";
  id: string | number;
  title: string;
}

export function CoachingModal({ isOpen, onClose, scope, id, title }: CoachingModalProps) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuePos, setQueuePos] = useState<number>(0);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setAnalysis("");
    setError(null);
    setQueuePos(0);

    try {
      // Get initial queue status for progress feedback
      window.clippi.getQueueStatus().then(s => setQueuePos(s.pending)).catch(() => {});

      // Setup listener for streaming
      const removeListener = window.clippi.onAnalysisStream((chunk) => {
        setQueuePos(0);
        setAnalysis((prev) => prev + chunk);
      });

      const removeEndListener = window.clippi.onAnalysisStreamEnd(() => {
        setLoading(false);
      });

      const result = await window.clippi.analyzeScoped(scope, id);
      if (result) {
        setAnalysis(result);
        setLoading(false);
      }

      removeListener();
      removeEndListener();
    } catch (err: any) {
      setError(err.message || String(err));
      setLoading(false);
    }
  }, [scope, id]);

  useEffect(() => {
    if (isOpen && !analysis && !loading) {
      runAnalysis();
    }
  }, [isOpen, analysis, loading, runAnalysis]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
      <motion.div
        className="modal-content coaching-modal"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
      >
        <header className="modal-header">
          <div className="flex items-center gap-3">
            <div className="coaching-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12L2.1 12.1"/><path d="M12 12L19 19"/><path d="M12 12V22"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold">MAGI Coaching</h2>
              <p className="text-xs text-dim">{title}</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </header>

        <div className="modal-body custom-scrollbar">
          {error && (
            <div className="error-box p-4 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          {!analysis && loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="spinner" />
              <p className="text-sm text-dim animate-pulse">
                {queuePos > 0 ? `Queued (position ${queuePos})...` : "Consulting MAGI mainframe..."}
              </p>
            </div>
          )}

          <div className="prose prose-invert max-w-none">
            <ReactMarkdown>{analysis}</ReactMarkdown>
            {loading && analysis && <span className="cursor-blink">_</span>}
          </div>
        </div>

        <footer className="modal-footer">
          <div className="flex justify-between items-center w-full">
            <p className="text-[10px] text-dim italic">
              AI analysis may occasionally hallucinate frame-perfect tech.
            </p>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </footer>
      </motion.div>

      <style>{`
        .coaching-modal {
          width: min(800px, 95vw);
          height: 80vh;
          display: flex;
          flex-direction: column;
        }
        .coaching-icon {
          width: 36px;
          height: 36px;
          background: rgba(var(--accent-rgb), 0.1);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
        }
        .cursor-blink {
          display: inline-block;
          width: 8px;
          height: 1.2em;
          background: var(--accent);
          margin-left: 4px;
          animation: blink 1s step-end infinite;
          vertical-align: middle;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .prose h1, .prose h2, .prose h3 {
          color: var(--accent);
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          font-family: var(--font-display);
        }
        .prose p {
          margin-bottom: 1em;
          line-height: 1.6;
          color: var(--text-secondary);
        }
        .prose ul, .prose ol {
          margin-bottom: 1em;
          padding-left: 1.5em;
        }
        .prose li {
          margin-bottom: 0.5em;
        }
        .prose strong {
          color: var(--text);
        }
      `}</style>
    </div>
  );
}
