// Character wireframe art URLs and per-character colors, shared by the Characters
// page and the Dashboard's best-character panel.

export const CHARACTER_IMAGE_URLS: Record<string, string> = {
  Fox: new URL("./assets/characters/fox.webp", import.meta.url).href,
  Falco: new URL("./assets/characters/falco.webp", import.meta.url).href,
  Marth: new URL("./assets/characters/marth.webp", import.meta.url).href,
  Sheik: new URL("./assets/characters/sheik.webp", import.meta.url).href,
  Falcon: new URL("./assets/characters/falcon.webp", import.meta.url).href,
  Puff: new URL("./assets/characters/puff.webp", import.meta.url).href,
  Peach: new URL("./assets/characters/peach.webp", import.meta.url).href,
  ICs: new URL("./assets/characters/ics.webp", import.meta.url).href,
  Samus: new URL("./assets/characters/samus.webp", import.meta.url).href,
  Pikachu: new URL("./assets/characters/pikachu.webp", import.meta.url).href,
  Luigi: new URL("./assets/characters/luigi.webp", import.meta.url).href,
  Mario: new URL("./assets/characters/mario.webp", import.meta.url).href,
  Doc: new URL("./assets/characters/doc.webp", import.meta.url).href,
  Yoshi: new URL("./assets/characters/yoshi.webp", import.meta.url).href,
  Ganon: new URL("./assets/characters/ganon.webp", import.meta.url).href,
  Link: new URL("./assets/characters/link.webp", import.meta.url).href,
  YLink: new URL("./assets/characters/ylink.webp", import.meta.url).href,
  Zelda: new URL("./assets/characters/zelda.webp", import.meta.url).href,
  Roy: new URL("./assets/characters/roy.webp", import.meta.url).href,
  Mewtwo: new URL("./assets/characters/mewtwo.webp", import.meta.url).href,
  Ness: new URL("./assets/characters/ness.webp", import.meta.url).href,
  Bowser: new URL("./assets/characters/bowser.webp", import.meta.url).href,
  Kirby: new URL("./assets/characters/kirby.webp", import.meta.url).href,
  DK: new URL("./assets/characters/dk.webp", import.meta.url).href,
  Pichu: new URL("./assets/characters/pichu.webp", import.meta.url).href,
  "G&W": new URL("./assets/characters/gnw.png", import.meta.url).href,
};

// ── Character metadata ────────────────────────────────────────────────

export const CHARACTER_META: Record<
  string,
  {
    emoji: string;
    color: string;
    glowColor: string;
  }
> = {
  Fox: { emoji: "\ud83e\udd8a", color: "#ff6b35", glowColor: "rgba(255, 107, 53, 0.15)" },
  Falco: { emoji: "\ud83e\udd85", color: "#4a7cff", glowColor: "rgba(74, 124, 255, 0.15)" },
  Marth: { emoji: "\u2694\ufe0f", color: "#6b8cff", glowColor: "rgba(107, 140, 255, 0.15)" },
  Sheik: { emoji: "\ud83e\udd77", color: "#c4b5fd", glowColor: "rgba(139, 92, 246, 0.15)" },
  Falcon: { emoji: "\ud83e\udd85", color: "#f59e0b", glowColor: "rgba(245, 158, 11, 0.15)" },
  Puff: { emoji: "\ud83c\udf80", color: "#ec4899", glowColor: "rgba(236, 72, 153, 0.15)" },
  Peach: { emoji: "\ud83c\udf51", color: "#f472b6", glowColor: "rgba(244, 114, 182, 0.15)" },
  ICs: { emoji: "\ud83e\uddca", color: "#67e8f9", glowColor: "rgba(103, 232, 249, 0.15)" },
  Samus: { emoji: "\ud83d\udd2b", color: "#f97316", glowColor: "rgba(249, 115, 22, 0.15)" },
  Pikachu: { emoji: "\u26a1", color: "#facc15", glowColor: "rgba(250, 204, 21, 0.15)" },
  Luigi: { emoji: "\ud83d\udfe2", color: "#22c55e", glowColor: "rgba(34, 197, 94, 0.15)" },
  Mario: { emoji: "\ud83d\udd34", color: "#ef4444", glowColor: "rgba(239, 68, 68, 0.15)" },
  Doc: { emoji: "\ud83d\udc8a", color: "#f8fafc", glowColor: "rgba(248, 250, 252, 0.15)" },
  Yoshi: { emoji: "\ud83e\udd8e", color: "#4ade80", glowColor: "rgba(74, 222, 128, 0.15)" },
  Ganon: { emoji: "\ud83d\udc4a", color: "#b794f6", glowColor: "rgba(124, 58, 237, 0.15)" },
  Link: { emoji: "\ud83d\udde1\ufe0f", color: "#22c55e", glowColor: "rgba(34, 197, 94, 0.15)" },
  YLink: { emoji: "\ud83c\udff9", color: "#84cc16", glowColor: "rgba(132, 204, 22, 0.15)" },
  Zelda: { emoji: "\u2728", color: "#c084fc", glowColor: "rgba(192, 132, 252, 0.15)" },
  Roy: { emoji: "\ud83d\udd25", color: "#f87171", glowColor: "rgba(220, 38, 38, 0.15)" },
  Mewtwo: { emoji: "\ud83d\udd2e", color: "#a78bfa", glowColor: "rgba(167, 139, 250, 0.15)" },
  "G&W": { emoji: "\ud83d\udd14", color: "#cbd5e1", glowColor: "rgba(30, 41, 59, 0.15)" },
  Ness: { emoji: "\ud83e\udde2", color: "#ef4444", glowColor: "rgba(239, 68, 68, 0.15)" },
  Bowser: { emoji: "\ud83d\udc22", color: "#65a30d", glowColor: "rgba(101, 163, 13, 0.15)" },
  Kirby: { emoji: "\ud83e\ude77", color: "#fb7185", glowColor: "rgba(251, 113, 133, 0.15)" },
  DK: { emoji: "\ud83e\udd8d", color: "#d4a373", glowColor: "rgba(146, 64, 14, 0.15)" },
  Pichu: { emoji: "\u26a1", color: "#facc15", glowColor: "rgba(250, 204, 21, 0.15)" },
};

export const DEFAULT_META = { emoji: "\ud83c\udfae", color: "var(--accent)", glowColor: "var(--accent-glow)" };
