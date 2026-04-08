import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Markdown, { type Components } from "react-markdown";
import {
  Eye,
  ChevronsUp,
  AlertTriangle,
  Layers,
  Infinity,
  Zap,
  Shield,
  BarChart3,
  CheckSquare,
  Lightbulb,
  FileText,
  BookOpen,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import {
  parseCoachingSections,
  SECTION_META,
  type CoachingSection,
  type SectionType,
} from "../utils/parseCoachingSections";

// ── Section Icon ──────────────────────────────────────────────────────

const SECTION_ICONS: Record<SectionType, LucideIcon> = {
  overview: Eye,
  highlights: ChevronsUp,
  lowlights: AlertTriangle,
  improvement: Layers,
  neutral: Infinity,
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
  markdownComponents,
}: {
  section: CoachingSection;
  index: number;
  defaultExpanded: boolean;
  markdownComponents?: Components;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const meta = SECTION_META[section.type];

  // Extract first sentence as summary
  const summary = useMemo(() => {
    const text = section.content.replace(/\*\*/g, "").replace(/\n/g, " ").trim();
    // Find first sentence end (. followed by space or end)
    const match = text.match(/^(.+?[.!?])(?:\s|$)/);
    return match ? match[1]! : text.slice(0, 140) + (text.length > 140 ? "..." : "");
  }, [section.content]);

  return (
    <motion.div
      className="cc-card"
      style={{ "--cc-accent": meta.color } as React.CSSProperties}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        className="cc-card-header"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
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
      {!expanded && (
        <div className="cc-card-summary">
          {summary}
        </div>
      )}

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="cc-card-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
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
  /** Custom react-markdown components (e.g., for timestamp links) */
  markdownComponents?: Components;
}

export function CoachingCards({ text, isStreaming, markdownComponents }: CoachingCardsProps) {
  const sections = useMemo(
    () => parseCoachingSections(text, isStreaming),
    [text, isStreaming],
  );

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

  return (
    <div className="cc-container">
      {sections.map((section, i) => (
        <CoachingCard
          key={section.id}
          section={section}
          index={i}
          defaultExpanded={i < DEFAULT_EXPANDED}
          markdownComponents={markdownComponents}
        />
      ))}
    </div>
  );
}
