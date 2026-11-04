/**
 * Parses LLM coaching markdown into structured sections for card-based rendering.
 * Splits on ## headers, classifies each by keyword, supports streaming (incomplete last section).
 */

export type SectionType =
  | "read"
  | "fix-first"
  | "also-fix"
  | "exploit"
  | "keep"
  | "overview"
  | "highlights"
  | "lowlights"
  | "improvement"
  | "neutral"
  | "punish"
  | "defense"
  | "shield-pressure"
  | "set-analysis"
  | "practice-plan"
  | "wisdom"
  | "executive-summary"
  | "statistical"
  | "strategy"
  | "recommendations"
  | "generic";

export interface CoachingSection {
  id: string;
  heading: string;
  type: SectionType;
  content: string;
  isComplete: boolean;
}

export interface SectionMeta {
  label: string;
  color: string;
  /** SVG path data for the section icon */
  iconPath: string;
  /** Secondary SVG path (some icons need two) */
  iconPath2?: string;
}

/** Keyword patterns → section type mapping. Order matters: first match wins. */
const SECTION_CLASSIFIERS: Array<{ pattern: RegExp; type: SectionType }> = [
  // Current coaching format (SYSTEM_PROMPT v2)
  { pattern: /^the\s*read\b/i, type: "read" },
  { pattern: /fix\s*this\s*first/i, type: "fix-first" },
  { pattern: /also\s*worth\s*fixing/i, type: "also-fix" },
  { pattern: /exploit\s*next\s*game/i, type: "exploit" },
  { pattern: /^keep\s*doing/i, type: "keep" },
  // Earlier formats (cached analyses)
  { pattern: /game\s*overview/i, type: "overview" },
  { pattern: /executive\s*summary|high[- ]?level|vibcheck|vibe/i, type: "executive-summary" },
  { pattern: /best\s*moment|highlight/i, type: "highlights" },
  { pattern: /worst\s*misplay|lowlight/i, type: "lowlights" },
  { pattern: /biggest\s*improvement|improvement\s*opportunity/i, type: "improvement" },
  { pattern: /neutral\s*game|neutral\s*assessment/i, type: "neutral" },
  { pattern: /punish\s*game|punish\s*assessment/i, type: "punish" },
  { pattern: /defen[sc]e|recovery\s*assessment/i, type: "defense" },
  { pattern: /shield\s*pressure/i, type: "shield-pressure" },
  { pattern: /set[- ]?level|set\s*analysis/i, type: "set-analysis" },
  { pattern: /practice\s*plan|drill/i, type: "practice-plan" },
  { pattern: /coach.*wisdom|golden\s*insight/i, type: "wisdom" },
  { pattern: /statistic|highlights?\s*&?\s*lowlight/i, type: "statistical" },
  { pattern: /strateg/i, type: "strategy" },
  { pattern: /recommendation|specific\s*rec/i, type: "recommendations" },
];

function classifyHeading(heading: string): SectionType {
  for (const { pattern, type } of SECTION_CLASSIFIERS) {
    if (pattern.test(heading)) return type;
  }
  return "generic";
}

/** Stable ID from heading text */
function headingToId(heading: string, index: number): string {
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `section-${index}`;
}

/**
 * Parse coaching markdown into sections. Handles streaming (incomplete last section).
 * Splits on `## ` headers. Content before the first header becomes an "overview" section.
 */
export function parseCoachingSections(text: string, streaming = false): CoachingSection[] {
  if (!text.trim()) return [];

  const sections: CoachingSection[] = [];

  // Split on exactly ## headers (not ### or deeper).
  // Negative lookahead prevents matching ###+ headers.
  const parts = text.split(/^##(?!#)\s+/m);

  // parts[0] is content before the first ##
  const preamble = parts[0]!.trim();
  if (preamble) {
    sections.push({
      id: "overview",
      heading: "Game Overview",
      type: "overview",
      content: preamble,
      isComplete: parts.length > 1 || !streaming,
    });
  }

  // Remaining parts each start with the heading text followed by content
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    const newlineIdx = part.indexOf("\n");
    const heading = newlineIdx >= 0 ? part.slice(0, newlineIdx).trim() : part.trim();
    const content = newlineIdx >= 0 ? part.slice(newlineIdx + 1).trim() : "";

    // Strip leading numbering like "1. " or "5." from headings
    const cleanHeading = heading.replace(/^\d+\.\s*/, "").replace(/\*\*/g, "");

    sections.push({
      id: headingToId(cleanHeading, i),
      heading: cleanHeading,
      type: classifyHeading(cleanHeading),
      content,
      isComplete: i < parts.length - 1 || !streaming,
    });
  }

  return sections;
}

/** Visual metadata for each section type */
export const SECTION_META: Record<SectionType, SectionMeta> = {
  read: {
    label: "The Read",
    color: "var(--accent)",
    iconPath: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z",
    iconPath2: "M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  },
  "fix-first": {
    label: "Top Priority",
    color: "var(--red)",
    iconPath: "M12 12m-10 0a10 10 0 1 0 20 0 10 10 0 1 0-20 0",
    iconPath2: "M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  },
  "also-fix": {
    label: "Next Fixes",
    color: "var(--yellow)",
    iconPath: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  },
  exploit: {
    label: "Opponent Read",
    color: "var(--secondary)",
    iconPath: "M12 12m-10 0a10 10 0 1 0 20 0 10 10 0 1 0-20 0",
    iconPath2: "M22 12h-4M6 12H2M12 6V2M12 22v-4",
  },
  keep: {
    label: "Keep Doing",
    color: "var(--green)",
    iconPath: "M6 9l6-6 6 6M6 15l6 6 6-6",
  },
  overview: {
    label: "Overview",
    color: "var(--text)",
    iconPath: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z",
    iconPath2: "M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  },
  highlights: {
    label: "Best Moments",
    color: "var(--green)",
    iconPath: "M6 9l6-6 6 6M6 15l6 6 6-6",
  },
  lowlights: {
    label: "Misplays",
    color: "var(--red)",
    iconPath:
      "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  },
  improvement: {
    label: "Key Improvement",
    color: "var(--yellow)",
    iconPath: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  },
  neutral: {
    label: "Neutral Game",
    color: "var(--accent)",
    iconPath:
      "M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z",
  },
  punish: {
    label: "Punish Game",
    color: "var(--yellow)",
    iconPath: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  },
  defense: {
    label: "Defense & Recovery",
    color: "var(--secondary)",
    iconPath: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  },
  "shield-pressure": {
    label: "Shield Pressure",
    color: "var(--secondary)",
    iconPath: "M12 2L2 7l10 5 10-5-10-5z",
    iconPath2: "M2 17l10 5 10-5M2 12l10 5 10-5",
  },
  "set-analysis": {
    label: "Set Analysis",
    color: "var(--text)",
    iconPath: "M18 20V10M12 20V4M6 20v-6",
  },
  "practice-plan": {
    label: "Practice Plan",
    color: "var(--green)",
    iconPath: "M9 11l3 3L22 4",
    iconPath2: "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  },
  wisdom: {
    label: "Coach's Wisdom",
    color: "var(--accent)",
    iconPath:
      "M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7zM9 21h6",
  },
  "executive-summary": {
    label: "Executive Summary",
    color: "var(--accent)",
    iconPath: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    iconPath2: "M14 2v6h6M16 13H8M16 17H8M10 9H8",
  },
  statistical: {
    label: "Statistical Analysis",
    color: "var(--secondary)",
    iconPath: "M18 20V10M12 20V4M6 20v-6",
  },
  strategy: {
    label: "Strategy",
    color: "var(--green)",
    iconPath: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  },
  recommendations: {
    label: "Recommendations",
    color: "var(--yellow)",
    iconPath: "M22 11.08V12a10 10 0 1 1-5.93-9.14",
    iconPath2: "M22 4L12 14.01l-3-3",
  },
  generic: {
    label: "Analysis",
    color: "var(--text-secondary)",
    iconPath: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    iconPath2: "M14 2v6h6",
  },
};
