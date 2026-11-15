import { useEffect } from "react";
import { motion, type MotionStyle } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Flame, Skull, TrendingUp, Trophy, Zap } from "lucide-react";
import { useGameHighlights, useRecentHighlights } from "../hooks/queries";
import { Card } from "./ui/Card";
import { DURATION_MS, EASE, STAGGER_MS, seconds } from "../motion";

/** Chips past this index land together, so a long reel never keeps the player waiting. */
const STAMP_MAX_STEPS = 7;

// ── Types ────────────────────────────────────────────────────────────

export interface HighlightItem {
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
}

interface RecentHighlightItem extends HighlightItem {
  replayPath: string;
  opponentTag: string;
  playedAt: string | null;
}

// Game-result highlights (4-stocks, JV4/JV5, comebacks) describe the whole
// game rather than a moment — startFrame is 0, so there's no seek target.
export const GAME_RESULT_TYPES = new Set(["four-stock", "jv5", "jv4", "comeback"]);

function HighlightIcon({ type }: { type: string }) {
  const size = 12;
  if (type === "four-stock" || type === "jv5" || type === "jv4") return <Trophy size={size} />;
  if (type === "comeback") return <TrendingUp size={size} />;
  if (type === "zero-to-death") return <Skull size={size} />;
  if (type === "high-damage") return <Flame size={size} />;
  return <Zap size={size} />;
}

// ── GameTheater reel: chips that seek the inline embed ───────────────

export function GameHighlightReel({
  gameId,
  onSeekFrame,
}: {
  gameId: number;
  onSeekFrame?: ((frame: number) => void) | undefined;
}) {
  const { data } = useGameHighlights(gameId);
  const highlights = (data ?? []) as HighlightItem[];

  if (highlights.length === 0) return null;

  return (
    <div className="highlight-reel">
      <div className="highlight-reel-header">
        <span className="highlight-reel-title">Highlights</span>
        <span className="highlight-reel-count">{highlights.length}</span>
      </div>
      <div className="highlight-chip-row">
        {highlights.map((h, i) => {
          const isMoment = !GAME_RESULT_TYPES.has(h.type);
          const seekable = isMoment && onSeekFrame != null;
          const onActivate = () => {
            if (seekable) onSeekFrame(h.startFrame);
          };
          return (
            <motion.div
              key={h.id}
              className={[
                "highlight-chip",
                h.didKill ? "highlight-chip-kill" : "",
                seekable ? "" : "highlight-chip-static",
              ]
                .filter(Boolean)
                .join(" ")}
              // Highlight stamp: chips land in order with the app's one overshoot.
              // --i paces the kill ring in motion.css to the same 120ms step.
              style={{ "--i": Math.min(i, STAMP_MAX_STEPS) } as MotionStyle}
              initial={{ opacity: 0, scale: 2.2 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: seconds(Math.min(i, STAMP_MAX_STEPS) * 3 * STAGGER_MS),
                duration: seconds(DURATION_MS.impact),
                ease: EASE.impact,
              }}
              role={seekable ? "button" : undefined}
              tabIndex={seekable ? 0 : undefined}
              aria-label={seekable ? `${h.label} at ${h.timestamp}. Activate to watch.` : h.label}
              title={`${h.label} — ${h.description}${seekable ? "\nClick to watch" : ""}`}
              onClick={onActivate}
              onKeyDown={(e) => {
                if (!seekable) return;
                if (e.key === "Enter" || e.key === " ") {
                  if (e.key === " ") e.preventDefault();
                  // Stop the event reaching ReplayEmbed's window-level Space handler,
                  // which would also toggle pause.
                  e.stopPropagation();
                  onActivate();
                }
              }}
            >
              <HighlightIcon type={h.type} />
              <span className="highlight-chip-label">{h.label}</span>
              {isMoment && <span className="highlight-chip-time">{h.timestamp}</span>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Dashboard strip: recent highlights that jump into GameTheater ────

export function RecentHighlightReel({ refreshKey }: { refreshKey?: number }) {
  const navigate = useNavigate();
  const { data, refetch } = useRecentHighlights(8);

  useEffect(() => {
    refetch();
  }, [refreshKey, refetch]);

  const highlights = (data ?? []) as RecentHighlightItem[];

  if (highlights.length === 0) return null;

  return (
    <Card title="Recent Highlights">
      <div className="dash-highlights-row">
        {highlights.map((h) => {
          const isMoment = !GAME_RESULT_TYPES.has(h.type);
          return (
            <motion.button
              key={h.id}
              type="button"
              className={`dash-highlight-item ${h.didKill ? "highlight-chip-kill" : ""}`}
              onClick={() =>
                navigate(`/game/${h.gameId}`, {
                  state: isMoment ? { seekFrame: h.startFrame } : null,
                })
              }
              title={`${h.label} — ${h.description}\nClick to watch`}
              aria-label={`Watch ${h.label} against ${h.opponentTag}`}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              <span className="dash-highlight-head">
                <HighlightIcon type={h.type} />
                <span className="dash-highlight-label">{h.label}</span>
              </span>
              <span className="dash-highlight-sub">
                {h.character} vs {h.opponentTag}
                {isMoment ? ` · ${h.timestamp}` : ""}
              </span>
            </motion.button>
          );
        })}
      </div>
    </Card>
  );
}
