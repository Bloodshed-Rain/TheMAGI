import { useState, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion, type MotionStyle } from "framer-motion";
import Markdown, { type Components } from "react-markdown";
import {
  Eye,
  ChevronsUp,
  AlertTriangle,
  Layers,
  Infinity as InfinityIcon,
  Zap,
  Shield,
  BarChart3,
  CheckSquare,
  Lightbulb,
  FileText,
  BookOpen,
  CheckCircle,
  Target,
  Crosshair,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  parseCoachingSections,
  SECTION_META,
  type CoachingSection,
  type SectionType,
} from "../utils/parseCoachingSections";
import { expandCornermanShorthand } from "../../cornermanText";

// ── Section Icon ──────────────────────────────────────────────────────

const SECTION_ICONS: Record<SectionType, LucideIcon> = {
  read: Eye,
  "fix-first": Target,
  "also-fix": AlertTriangle,
  exploit: Crosshair,
  keep: ChevronsUp,
  "long-run": TrendingUp,
  overview: Eye,
  highlights: ChevronsUp,
  lowlights: AlertTriangle,
  improvement: Layers,
  neutral: InfinityIcon,
  punish: Zap,
  defense: Shield,
  "shield-pressure": Layers,
  "set-analysis": BarChart3,
  "practice-plan": CheckSquare,
  wisdom: Lightbulb,
  "executive-summary": FileText,
  statistical: BarChart3,
  strategy: BookOpen,
  recommendations: CheckCircle,
  generic: FileText,
};

function SectionIcon({ type, size = 16 }: { type: SectionType; size?: number }) {
  const meta = SECTION_META[type];
  const Icon = SECTION_ICONS[type];
  return <Icon size={size} style={{ color: meta.color, flexShrink: 0 }} />;
}

// ── Single Card ───────────────────────────────────────────────────────

/** Number of sections to default-expand */
const DEFAULT_EXPANDED = 3;

function CoachingCard({
  section,
  index,
  defaultExpanded,
  forceExpanded,
  markdownComponents,
}: {
  section: CoachingSection;
  index: number;
  defaultExpanded: boolean;
  forceExpanded?: boolean;
  markdownComponents?: Components | undefined;
}) {
  const [userExpanded, setUserExpanded] = useState(defaultExpanded);
  const reduceMotion = useReducedMotion();
  const meta = SECTION_META[section.type];
  // Force-expand the actively streaming section so its cursor + growth are visible.
  const expanded = forceExpanded || userExpanded;

  // Extract first sentence as summary
  const summary = useMemo(() => {
    // Normalize list markers: strip a leading "-", "*", or "1." per line.
    const normalized = section.content
      .replace(/\*\*/g, "")
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim())
      .filter((line) => line.length > 0);
    const text = normalized.join(" ").trim();
    if (!text) return "";
    // Prefer the first full sentence.
    const match = text.match(/^(.+?[.!?])(?:\s|$)/);
    if (match) return match[1]!;
    // No sentence terminator: fall back to the first non-empty (list) line.
    const firstLine = normalized[0]!;
    return firstLine.length > 140 ? firstLine.slice(0, 140) + "..." : firstLine;
  }, [section.content]);

  return (
    <motion.div
      className="cc-card"
      style={{ "--cc-accent": meta.color } as MotionStyle}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <button className="cc-card-header" onClick={() => setUserExpanded((e) => !e)} aria-expanded={expanded}>
        <div className="cc-card-icon">
          <SectionIcon type={section.type} />
        </div>
        <div className="cc-card-title-group">
          <span className="cc-card-label">{meta.label}</span>
          <h3 className="cc-card-heading">{section.heading}</h3>
        </div>
        <motion.span
          className="cc-card-chevron"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {"\u25BC"}
        </motion.span>
      </button>

      {/* Collapsed summary */}
      {!expanded && <div className="cc-card-summary">{summary}</div>}

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="cc-card-body"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="cc-card-content">
              <Markdown components={markdownComponents}>{section.content}</Markdown>
              {!section.isComplete && <span className="cc-streaming-cursor" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────

export interface CoachingCardsProps {
  text: string;
  isStreaming?: boolean;
  expandShorthand?: boolean;
  /** Custom react-markdown components (e.g., for timestamp links) */
  markdownComponents?: Components | undefined;
}

export function CoachingCards({ text, isStreaming, expandShorthand = false, markdownComponents }: CoachingCardsProps) {
  const displayText = useMemo(() => (expandShorthand ? expandCornermanShorthand(text) : text), [expandShorthand, text]);
  const sections = useMemo(() => parseCoachingSections(displayText, isStreaming), [displayText, isStreaming]);

  if (sections.length === 0 && !isStreaming) return null;

  // While streaming with no sections yet, show a placeholder
  if (sections.length === 0 && isStreaming) {
    return (
      <div className="cc-container">
        <div className="cc-placeholder">
          <span className="cc-streaming-cursor" />
        </div>
      </div>
    );
  }

  // While streaming, the last incomplete section is actively growing — force it
  // open so its cursor + new text stay visible regardless of DEFAULT_EXPANDED.
  let streamingIndex = -1;
  if (isStreaming) {
    for (let i = sections.length - 1; i >= 0; i--) {
      if (!sections[i]!.isComplete) {
        streamingIndex = i;
        break;
      }
    }
  }

  return (
    <div className="cc-container">
      {sections.map((section, i) => (
        <CoachingCard
          key={section.id}
          section={section}
          index={i}
          defaultExpanded={i < DEFAULT_EXPANDED}
          forceExpanded={i === streamingIndex}
          markdownComponents={markdownComponents}
        />
      ))}
    </div>
  );
}
