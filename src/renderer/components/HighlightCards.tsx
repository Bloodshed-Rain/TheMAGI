import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Play, ChevronDown } from "lucide-react";

interface HighlightData {
  id: number;
  gameId: number;
  type: string;
  label: string;
  description: string;
  character: string;
  victim: string;
  startFrame: number;
  timestamp: string;
  damage: number;
  startPercent: number;
  didKill: boolean;
  moves: string[];
  stockNumber: number | null;
  replayPath?: string;
}

// ── Type → visual config ────────────────────────────────────────────

const HIGHLIGHT_META: Record<string, { color: string; icon: string }> = {
  "zero-to-death":    { color: "#ff4444", icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" },
  "spike-kill":       { color: "#ff6600", icon: "M12 2v20M2 12l10 10 10-10" },
  "high-damage":      { color: "#ffaa00", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  "four-stock":       { color: "#00ccff", icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  "jv5":              { color: "#aa44ff", icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  "jv4":              { color: "#8844dd", icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  "comeback":         { color: "#44ff44", icon: "M23 6l-9.5 9.5-5-5L1 18" },
  "ken-combo":        { color: "#ff44aa", icon: "M14.5 2L6 14h8l-2 8 8.5-12H13l2-8z" },
  "shine-spike":      { color: "#44aaff", icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" },
  "waveshine-upsmash": { color: "#44ccff", icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" },
  "upthrow-upair":    { color: "#66aaff", icon: "M12 19V5M5 12l7-7 7 7" },
  "pillar-combo":     { color: "#ff8844", icon: "M12 2v20M17 7l-5-5-5 5M17 17l-5 5-5-5" },
  "stomp-knee":       { color: "#ff4488", icon: "M12 2v20M2 12l10 10 10-10" },
  "sacred-combo":     { color: "#ff44cc", icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  "rest-kill":        { color: "#ff88ff", icon: "M12 2a10 10 0 0 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 4" },
  "tech-chase-kill":  { color: "#44ddaa", icon: "M22 11.08V12a10 10 0 1 1-5.93-9.14" },
  "fair-gimp":        { color: "#44dd88", icon: "M12 22V8M5 12l7-7 7 7" },
  "dsmash-kill":      { color: "#ffcc44", icon: "M12 2v20M2 12l10 10 10-10" },
  "wobble":           { color: "#8888ff", icon: "M12 2a10 10 0 0 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 4" },
  "ganon-stomp":      { color: "#884488", icon: "M12 2v20M2 12l10 10 10-10" },
  "ganoncide":        { color: "#aa44aa", icon: "M12 2v20M2 12l10 10 10-10" },
  "shoryuken":        { color: "#44ff88", icon: "M12 19V5M5 12l7-7 7 7" },
  "backthrow-kill":   { color: "#ff8888", icon: "M12 22c-4.97 0-9-2.24-9-5v-6c0-2.76 4.03-5 9-5s9 2.24 9 5v6c0 2.76-4.03 5-9 5z" },
  "judgement-kill":   { color: "#ffdd44", icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  "tipper-fsmash":    { color: "#ff66aa", icon: "M14.5 2L6 14h8l-2 8 8.5-12H13l2-8z" },
};

const DEFAULT_META = { color: "#888888", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z" };

function getMeta(type: string) {
  return HIGHLIGHT_META[type] ?? DEFAULT_META;
}

// ── Single highlight card ───────────────────────────────────────────

function HighlightCard({
  highlight,
  onPlayClick,
}: {
  highlight: HighlightData;
  onPlayClick?: (replayPath: string, frame: number) => void;
}) {
  const meta = getMeta(highlight.type);
  const canPlay = highlight.replayPath && highlight.startFrame > 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      className={`highlight-card${expanded ? " highlight-card-expanded" : " highlight-card-collapsed"}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ borderLeftColor: meta.color, cursor: "pointer" }}
      onClick={() => setExpanded((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }}
    >
      <div className="highlight-card-icon" style={{ color: meta.color }}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={meta.icon} />
        </svg>
      </div>

      <div className="highlight-card-content">
        <div className="highlight-card-header">
          <span className="highlight-card-label" style={{ color: meta.color }}>
            {highlight.label}
          </span>
          {highlight.didKill && (
            <span className="highlight-card-kill-badge">KO</span>
          )}
          {highlight.stockNumber != null && (
            <span className="highlight-card-stock">
              Stock {highlight.stockNumber}
            </span>
          )}
        </div>
        {expanded && (
          <>
            <div className="highlight-card-description">
              {highlight.description}
            </div>
            {highlight.moves.length > 0 && (
              <div className="highlight-card-moves">
                {highlight.moves.join(" \u2192 ")}
              </div>
            )}
          </>
        )}
      </div>

      <div className="highlight-card-actions" onClick={(e) => e.stopPropagation()}>
        {highlight.timestamp !== "0:00" && (
          <span className="highlight-card-timestamp">{highlight.timestamp}</span>
        )}
        {expanded && canPlay && onPlayClick && (
          <button
            className="highlight-play-btn"
            title={`Open replay at ${highlight.timestamp}`}
            onClick={() => onPlayClick(highlight.replayPath!, highlight.startFrame)}
          >
            <Play size={14} fill="currentColor" />
          </button>
        )}
        <ChevronDown
          size={14}
          style={{
            opacity: 0.5,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        />
      </div>
    </motion.div>
  );
}

// ── Highlight cards list ────────────────────────────────────────────

export function HighlightCards({
  highlights,
  replayPath,
  maxVisible = 5,
}: {
  highlights: HighlightData[];
  replayPath?: string;
  maxVisible?: number;
}) {
  const [showAll, setShowAll] = useState(false);

  if (highlights.length === 0) return null;

  const enriched = highlights.map((h) => ({
    ...h,
    replayPath: h.replayPath ?? replayPath,
  }));

  const visible = showAll ? enriched : enriched.slice(0, maxVisible);
  const hasMore = enriched.length > maxVisible;

  const handlePlay = async (path: string, frame: number) => {
    try {
      await window.clippi.openInDolphinAtFrame(path, frame);
    } catch (err) {
      console.error("[HighlightCards] Failed to open Dolphin:", err);
    }
  };

  return (
    <div className="highlight-cards-container">
      <div className="highlight-cards-header">
        <Zap size={16} />
        <span>
          Highlights ({highlights.length})
        </span>
      </div>
      <AnimatePresence>
        {visible.map((h, i) => (
          <HighlightCard
            key={h.id ?? `${h.type}-${h.startFrame}-${i}`}
            highlight={h}
            onPlayClick={handlePlay}
          />
        ))}
      </AnimatePresence>
      {hasMore && !showAll && (
        <button
          className="highlight-show-more"
          onClick={() => setShowAll(true)}
        >
          Show {enriched.length - maxVisible} more highlights
        </button>
      )}
    </div>
  );
}
