export interface Theme {
  id: string;
  name: string;
  bg: string;
  bgCard: string;
  bgHover: string;
  border: string;
  text: string;
  textDim: string;
  textTitle: string;
  textLabel: string;
  accent: string;
  accentDim: string;
  accentGlow: string;
  secondary: string;
  secondaryDim: string;
  green: string;
  red: string;
  yellow: string;
  sidebarBg: string;
  sidebarAccent: string;
  gradientStart: string;
  gradientEnd: string;
  /** The mode this theme was designed for. Used to derive the opposite. */
  defaultMode: "dark" | "light";
}

export const THEMES: Record<string, Theme> = {
  slippi: {
    id: "slippi", name: "Slippi",
    bg: "#0b0e11", bgCard: "#141820", bgHover: "#1c222e", border: "#243040",
    text: "#e8ece8", textDim: "#7a8a7a", textTitle: "#72d687", textLabel: "#4ab85c",
    accent: "#21BA45", accentDim: "#1a9e3a", accentGlow: "rgba(33,186,69,0.08)",
    secondary: "#72d687", secondaryDim: "#4ab85c",
    green: "#21BA45", red: "#e84855", yellow: "#f0c030",
    sidebarBg: "#0d1117", sidebarAccent: "#21BA45",
    gradientStart: "rgba(33,186,69,0.03)", gradientEnd: "rgba(33,186,69,0.0)",
    defaultMode: "dark",
  },

  // Fox: tawny #C88040, cream #F0E0C0, olive #5A7040, red boots #A02020
  fox: {
    id: "fox", name: "Fox",
    bg: "#0e0b07", bgCard: "#1a1508", bgHover: "#251f10", border: "#3a3018",
    text: "#f0e8d8", textDim: "#988a60", textTitle: "#F0E0C0", textLabel: "#C88040",
    accent: "#C88040", accentDim: "#a86830", accentGlow: "rgba(200,128,64,0.08)",
    secondary: "#A02020", secondaryDim: "#802018",
    green: "#5A7040", red: "#A02020", yellow: "#C88040",
    sidebarBg: "#0c0906", sidebarAccent: "#C88040",
    gradientStart: "rgba(200,128,64,0.04)", gradientEnd: "rgba(160,32,32,0.02)",
    defaultMode: "dark",
  },

  // Falco: cobalt #3848A0, orange suit #C86830, yellow beak #D8B830
  falco: {
    id: "falco", name: "Falco",
    bg: "#080a18", bgCard: "#0e1228", bgHover: "#161c38", border: "#202850",
    text: "#d4d8f0", textDim: "#6670a0", textTitle: "#8898d0", textLabel: "#C86830",
    accent: "#3848A0", accentDim: "#2c3888", accentGlow: "rgba(56,72,160,0.08)",
    secondary: "#C86830", secondaryDim: "#a85828",
    green: "#22c55e", red: "#8B2020", yellow: "#D8B830",
    sidebarBg: "#06081a", sidebarAccent: "#5060c0",
    gradientStart: "rgba(56,72,160,0.04)", gradientEnd: "rgba(200,104,48,0.02)",
    defaultMode: "dark",
  },

  // Marth: navy #283858, blue #4860A0, silver #C0C8D0
  marth: {
    id: "marth", name: "Marth",
    bg: "#080a14", bgCard: "#0e1224", bgHover: "#141a34", border: "#1e284a",
    text: "#d0d8f0", textDim: "#6070a0", textTitle: "#C0C8D0", textLabel: "#7888b8",
    accent: "#4860A0", accentDim: "#384888", accentGlow: "rgba(72,96,160,0.08)",
    secondary: "#C0C8D0", secondaryDim: "#98a0b0",
    green: "#22c55e", red: "#e84855", yellow: "#C0C8D0",
    sidebarBg: "#06081a", sidebarAccent: "#6078c0",
    gradientStart: "rgba(72,96,160,0.04)", gradientEnd: "rgba(192,200,208,0.02)",
    defaultMode: "dark",
  },

  // Sheik: navy #282848, off-white #D8D0C0, red #C02030, blonde #C8A860
  sheik: {
    id: "sheik", name: "Sheik",
    bg: "#08080e", bgCard: "#10101e", bgHover: "#18182c", border: "#222240",
    text: "#d8d8f0", textDim: "#7070a0", textTitle: "#D8D0C0", textLabel: "#C8A860",
    accent: "#282848", accentDim: "#1e1e38", accentGlow: "rgba(40,40,72,0.12)",
    secondary: "#C02030", secondaryDim: "#a01828",
    green: "#22c55e", red: "#C02030", yellow: "#C8A860",
    sidebarBg: "#06060c", sidebarAccent: "#D8D0C0",
    gradientStart: "rgba(40,40,72,0.06)", gradientEnd: "rgba(192,32,48,0.02)",
    defaultMode: "dark",
  },

  // Falcon: indigo #1A1050, red helmet #C02020, gold #D0A020
  falcon: {
    id: "falcon", name: "Falcon",
    bg: "#08060e", bgCard: "#0e0a1a", bgHover: "#161028", border: "#201840",
    text: "#d0c8f0", textDim: "#6860a0", textTitle: "#D0B030", textLabel: "#C02020",
    accent: "#C02020", accentDim: "#a01818", accentGlow: "rgba(192,32,32,0.08)",
    secondary: "#D0A020", secondaryDim: "#b08818",
    green: "#22c55e", red: "#C02020", yellow: "#D0B030",
    sidebarBg: "#06040c", sidebarAccent: "#C02020",
    gradientStart: "rgba(192,32,32,0.04)", gradientEnd: "rgba(208,160,32,0.02)",
    defaultMode: "dark",
  },

  // Peach: pink #F0A0B8, gold #D8A830, blue jewel #2848A0, blonde #E8C840
  // Light theme — she's bright and elegant
  peach: {
    id: "peach", name: "Peach",
    bg: "#f8f0f2", bgCard: "#ffffff", bgHover: "#f4e8ec", border: "#e8c8d0",
    text: "#3a1820", textDim: "#906878", textTitle: "#c0607a", textLabel: "#D8A830",
    accent: "#e07898", accentDim: "#c86080", accentGlow: "rgba(224,120,152,0.08)",
    secondary: "#D8A830", secondaryDim: "#b89028",
    green: "#16a34a", red: "#d03050", yellow: "#E8C840",
    sidebarBg: "#f4eaee", sidebarAccent: "#e07898",
    gradientStart: "rgba(224,120,152,0.04)", gradientEnd: "rgba(216,168,48,0.02)",
    defaultMode: "light",
  },

  // Puff: soft pink #F5D0E0, teal #008898
  puff: {
    id: "puff", name: "Jigglypuff",
    bg: "#f4eaee", bgCard: "#ffffff", bgHover: "#f0e0e8", border: "#e0c8d0",
    text: "#3a2028", textDim: "#806068", textTitle: "#008898", textLabel: "#c88098",
    accent: "#E0A0B0", accentDim: "#c88898", accentGlow: "rgba(224,160,176,0.1)",
    secondary: "#008898", secondaryDim: "#007080",
    green: "#16a34a", red: "#d02040", yellow: "#c89020",
    sidebarBg: "#f0e4ea", sidebarAccent: "#E0A0B0",
    gradientStart: "rgba(224,160,176,0.06)", gradientEnd: "rgba(0,136,152,0.03)",
    defaultMode: "light",
  },

  // ICs: Popo blue #3868C0, Nana pink #D868A0
  ics: {
    id: "ics", name: "Ice Climbers",
    bg: "#080c16", bgCard: "#0e1628", bgHover: "#142034", border: "#1e3050",
    text: "#d8e4f4", textDim: "#6880a8", textTitle: "#78a8e0", textLabel: "#D868A0",
    accent: "#3868C0", accentDim: "#2858a8", accentGlow: "rgba(56,104,192,0.08)",
    secondary: "#D868A0", secondaryDim: "#c05888",
    green: "#22c55e", red: "#e84855", yellow: "#d8b848",
    sidebarBg: "#060a14", sidebarAccent: "#3868C0",
    gradientStart: "rgba(56,104,192,0.04)", gradientEnd: "rgba(216,104,160,0.02)",
    defaultMode: "dark",
  },

  // Pikachu: yellow #F8D030, red cheeks #E83030 — bright and electric
  pikachu: {
    id: "pikachu", name: "Pikachu",
    bg: "#f5f0e0", bgCard: "#fffdf4", bgHover: "#f0ead4", border: "#d8d0a8",
    text: "#302808", textDim: "#806820", textTitle: "#b89010", textLabel: "#E83030",
    accent: "#D8B020", accentDim: "#b89818", accentGlow: "rgba(216,176,32,0.1)",
    secondary: "#E83030", secondaryDim: "#c82828",
    green: "#16a34a", red: "#E83030", yellow: "#F8D030",
    sidebarBg: "#f0ead8", sidebarAccent: "#D8B020",
    gradientStart: "rgba(248,208,48,0.06)", gradientEnd: "rgba(232,48,48,0.02)",
    defaultMode: "light",
  },

  // Samus: orange #D87020, red #B83020, green visor #30C048
  samus: {
    id: "samus", name: "Samus",
    bg: "#0e0a06", bgCard: "#1a1208", bgHover: "#261c10", border: "#3a2a14",
    text: "#f0e8d0", textDim: "#907848", textTitle: "#D87020", textLabel: "#30C048",
    accent: "#D87020", accentDim: "#b86018", accentGlow: "rgba(216,112,32,0.08)",
    secondary: "#30C048", secondaryDim: "#28a040",
    green: "#30C048", red: "#B83020", yellow: "#C8A020",
    sidebarBg: "#0c0804", sidebarAccent: "#D87020",
    gradientStart: "rgba(216,112,32,0.04)", gradientEnd: "rgba(48,192,72,0.02)",
    defaultMode: "dark",
  },

  // Dr. Mario: white coat, red tie #C82020 — clinical light
  drmario: {
    id: "drmario", name: "Dr. Mario",
    bg: "#f2f2f4", bgCard: "#ffffff", bgHover: "#eaeaee", border: "#d0d0d8",
    text: "#1a1a2e", textDim: "#6e6e82", textTitle: "#C82020", textLabel: "#808080",
    accent: "#C82020", accentDim: "#a81818", accentGlow: "rgba(200,32,32,0.06)",
    secondary: "#808080", secondaryDim: "#606060",
    green: "#16a34a", red: "#C82020", yellow: "#c8a020",
    sidebarBg: "#eeeef2", sidebarAccent: "#C82020",
    gradientStart: "rgba(200,32,32,0.03)", gradientEnd: "rgba(128,128,128,0.02)",
    defaultMode: "light",
  },

  // Yoshi: green #40A830, red shell #C83020, orange shoes #D87028
  yoshi: {
    id: "yoshi", name: "Yoshi",
    bg: "#081008", bgCard: "#101e10", bgHover: "#182c18", border: "#203c20",
    text: "#d8f0d8", textDim: "#689068", textTitle: "#70d060", textLabel: "#D87028",
    accent: "#40A830", accentDim: "#389028", accentGlow: "rgba(64,168,48,0.08)",
    secondary: "#C83020", secondaryDim: "#a82818",
    green: "#40A830", red: "#C83020", yellow: "#D87028",
    sidebarBg: "#060e06", sidebarAccent: "#50c040",
    gradientStart: "rgba(64,168,48,0.04)", gradientEnd: "rgba(200,48,32,0.02)",
    defaultMode: "dark",
  },

  // Luigi: green #30A030, navy overalls #282880
  luigi: {
    id: "luigi", name: "Luigi",
    bg: "#080e08", bgCard: "#101c14", bgHover: "#18281c", border: "#203824",
    text: "#d8f0dc", textDim: "#6a906e", textTitle: "#58d068", textLabel: "#282880",
    accent: "#30A030", accentDim: "#288838", accentGlow: "rgba(48,160,48,0.08)",
    secondary: "#282880", secondaryDim: "#202070",
    green: "#30A030", red: "#e84855", yellow: "#d0b040",
    sidebarBg: "#060e08", sidebarAccent: "#48c058",
    gradientStart: "rgba(48,160,48,0.04)", gradientEnd: "rgba(40,40,128,0.02)",
    defaultMode: "dark",
  },

  // Mario: red #E02020, blue #2838B0, yellow #E0C020
  mario: {
    id: "mario", name: "Mario",
    bg: "#100808", bgCard: "#1c1010", bgHover: "#281818", border: "#3c2020",
    text: "#f0e0e0", textDim: "#906060", textTitle: "#E02020", textLabel: "#2838B0",
    accent: "#E02020", accentDim: "#c01818", accentGlow: "rgba(224,32,32,0.08)",
    secondary: "#2838B0", secondaryDim: "#202898",
    green: "#22c55e", red: "#E02020", yellow: "#E0C020",
    sidebarBg: "#0c0606", sidebarAccent: "#E02020",
    gradientStart: "rgba(224,32,32,0.04)", gradientEnd: "rgba(40,56,176,0.02)",
    defaultMode: "dark",
  },

  // Ganondorf: olive skin #607048, black armor #282020, gold #C89820, red hair #B03020
  ganondorf: {
    id: "ganondorf", name: "Ganondorf",
    bg: "#0a0806", bgCard: "#14100c", bgHover: "#1e1814", border: "#302820",
    text: "#e0d8c8", textDim: "#887860", textTitle: "#C89820", textLabel: "#B03020",
    accent: "#C89820", accentDim: "#a88018", accentGlow: "rgba(200,152,32,0.08)",
    secondary: "#B03020", secondaryDim: "#902818",
    green: "#607048", red: "#B03020", yellow: "#C89820",
    sidebarBg: "#080604", sidebarAccent: "#C89820",
    gradientStart: "rgba(200,152,32,0.04)", gradientEnd: "rgba(176,48,32,0.02)",
    defaultMode: "dark",
  },

  // Link: green tunic #48A030, blue shield #2848A0, blonde #C8A850
  link: {
    id: "link", name: "Link",
    bg: "#0a0e08", bgCard: "#121c10", bgHover: "#1a2818", border: "#243822",
    text: "#e0f0d8", textDim: "#709068", textTitle: "#70c850", textLabel: "#2848A0",
    accent: "#48A030", accentDim: "#388828", accentGlow: "rgba(72,160,48,0.08)",
    secondary: "#2848A0", secondaryDim: "#203888",
    green: "#48A030", red: "#e84855", yellow: "#C8A850",
    sidebarBg: "#080c06", sidebarAccent: "#58b840",
    gradientStart: "rgba(72,160,48,0.04)", gradientEnd: "rgba(40,72,160,0.02)",
    defaultMode: "dark",
  },

  // Young Link: green #48A030, cream #E8E0C8, blonde #C8A850
  younglink: {
    id: "younglink", name: "Young Link",
    bg: "#0a0e08", bgCard: "#121c10", bgHover: "#1a2818", border: "#243822",
    text: "#e0f0d8", textDim: "#709068", textTitle: "#C8A850", textLabel: "#58b840",
    accent: "#48A030", accentDim: "#388828", accentGlow: "rgba(72,160,48,0.08)",
    secondary: "#C8A850", secondaryDim: "#a89040",
    green: "#48A030", red: "#e84855", yellow: "#C8A850",
    sidebarBg: "#080c06", sidebarAccent: "#58b840",
    gradientStart: "rgba(72,160,48,0.04)", gradientEnd: "rgba(200,168,80,0.02)",
    defaultMode: "dark",
  },

  // DK: dark brown #604020, tan #906838, red tie #D02020, yellow DK #E0C020
  dk: {
    id: "dk", name: "Donkey Kong",
    bg: "#0c0806", bgCard: "#18120c", bgHover: "#241c14", border: "#382a1a",
    text: "#e8dcc8", textDim: "#887058", textTitle: "#D02020", textLabel: "#E0C020",
    accent: "#604020", accentDim: "#503418", accentGlow: "rgba(96,64,32,0.1)",
    secondary: "#D02020", secondaryDim: "#b01818",
    green: "#22c55e", red: "#D02020", yellow: "#E0C020",
    sidebarBg: "#0a0604", sidebarAccent: "#906838",
    gradientStart: "rgba(96,64,32,0.06)", gradientEnd: "rgba(208,32,32,0.02)",
    defaultMode: "dark",
  },

  // G&W: flat black #101010, grey #282828 — monochrome
  gnw: {
    id: "gnw", name: "Game & Watch",
    bg: "#060606", bgCard: "#101010", bgHover: "#181818", border: "#282828",
    text: "#d0d0d0", textDim: "#686868", textTitle: "#e0e0e0", textLabel: "#a0a0a0",
    accent: "#d0d0d0", accentDim: "#a0a0a0", accentGlow: "rgba(208,208,208,0.06)",
    secondary: "#808080", secondaryDim: "#606060",
    green: "#22c55e", red: "#e84855", yellow: "#d0d0d0",
    sidebarBg: "#040404", sidebarAccent: "#d0d0d0",
    gradientStart: "rgba(208,208,208,0.02)", gradientEnd: "rgba(128,128,128,0.01)",
    defaultMode: "dark",
  },

  // Roy: blue #384890, gold #C89828, red hair #803028
  roy: {
    id: "roy", name: "Roy",
    bg: "#08081a", bgCard: "#0e1028", bgHover: "#161a38", border: "#202450",
    text: "#d0d4f0", textDim: "#6068a8", textTitle: "#C89828", textLabel: "#7080c8",
    accent: "#384890", accentDim: "#2c3878", accentGlow: "rgba(56,72,144,0.08)",
    secondary: "#C89828", secondaryDim: "#a88020",
    green: "#22c55e", red: "#803028", yellow: "#C89828",
    sidebarBg: "#06061a", sidebarAccent: "#5068b8",
    gradientStart: "rgba(56,72,144,0.04)", gradientEnd: "rgba(200,152,40,0.02)",
    defaultMode: "dark",
  },

  // Mewtwo: pale lavender #C0B8C8, purple #7858A0
  mewtwo: {
    id: "mewtwo", name: "Mewtwo",
    bg: "#0c0a10", bgCard: "#161420", bgHover: "#201e2c", border: "#302a40",
    text: "#e0d8e8", textDim: "#807090", textTitle: "#C0B8C8", textLabel: "#9878b8",
    accent: "#7858A0", accentDim: "#684890", accentGlow: "rgba(120,88,160,0.08)",
    secondary: "#C0B8C8", secondaryDim: "#a098b0",
    green: "#22c55e", red: "#e84855", yellow: "#c0a8d0",
    sidebarBg: "#0a0810", sidebarAccent: "#9070b0",
    gradientStart: "rgba(120,88,160,0.04)", gradientEnd: "rgba(192,184,200,0.02)",
    defaultMode: "dark",
  },

  // Zelda: lavender #C8A0C0, gold #C8A030, ruby #C02040
  // Lighter — she's elegant and regal
  zelda: {
    id: "zelda", name: "Zelda",
    bg: "#f4eef2", bgCard: "#ffffff", bgHover: "#efe4ec", border: "#dcc8d8",
    text: "#2a1828", textDim: "#806878", textTitle: "#C8A030", textLabel: "#a080a0",
    accent: "#b088a8", accentDim: "#987098", accentGlow: "rgba(176,136,168,0.08)",
    secondary: "#C8A030", secondaryDim: "#a88828",
    green: "#16a34a", red: "#C02040", yellow: "#C8A030",
    sidebarBg: "#f0e8ee", sidebarAccent: "#b088a8",
    gradientStart: "rgba(176,136,168,0.04)", gradientEnd: "rgba(200,160,48,0.02)",
    defaultMode: "light",
  },

  // Ness: red cap #D02020, blue #2838A0, yellow #E0C020 — bright and youthful
  ness: {
    id: "ness", name: "Ness",
    bg: "#f4f0f0", bgCard: "#ffffff", bgHover: "#eee8e8", border: "#d8d0d0",
    text: "#1a1020", textDim: "#706068", textTitle: "#D02020", textLabel: "#2838A0",
    accent: "#D02020", accentDim: "#b01818", accentGlow: "rgba(208,32,32,0.06)",
    secondary: "#2838A0", secondaryDim: "#202888",
    green: "#16a34a", red: "#D02020", yellow: "#E0C020",
    sidebarBg: "#f0eaea", sidebarAccent: "#D02020",
    gradientStart: "rgba(208,32,32,0.04)", gradientEnd: "rgba(40,56,160,0.02)",
    defaultMode: "light",
  },

  // Bowser: gold skin #C89840, green shell #386828, red hair #D04818
  bowser: {
    id: "bowser", name: "Bowser",
    bg: "#0c0a06", bgCard: "#181408", bgHover: "#241e10", border: "#383018",
    text: "#e8e0c8", textDim: "#888058", textTitle: "#C89840", textLabel: "#D04818",
    accent: "#C89840", accentDim: "#a88030", accentGlow: "rgba(200,152,64,0.08)",
    secondary: "#386828", secondaryDim: "#285818",
    green: "#386828", red: "#D04818", yellow: "#C89840",
    sidebarBg: "#0a0804", sidebarAccent: "#C89840",
    gradientStart: "rgba(200,152,64,0.04)", gradientEnd: "rgba(56,104,40,0.02)",
    defaultMode: "dark",
  },

  // Kirby: pink #F0A0B0, magenta feet #C83050, blue eyes #2040C0 — soft and light
  kirby: {
    id: "kirby", name: "Kirby",
    bg: "#f4eaee", bgCard: "#ffffff", bgHover: "#f0e0e6", border: "#e0c0cc",
    text: "#381820", textDim: "#885060", textTitle: "#2040C0", textLabel: "#c87090",
    accent: "#E08898", accentDim: "#c87080", accentGlow: "rgba(224,136,152,0.1)",
    secondary: "#2040C0", secondaryDim: "#1830a0",
    green: "#16a34a", red: "#C83050", yellow: "#c89020",
    sidebarBg: "#f0e4e8", sidebarAccent: "#E08898",
    gradientStart: "rgba(224,136,152,0.06)", gradientEnd: "rgba(32,64,192,0.02)",
    defaultMode: "light",
  },
};

export const THEME_ORDER = [
  "slippi",
  "fox", "falco", "marth", "sheik", "falcon", "peach", "puff",
  "ics", "pikachu", "samus", "drmario",
  "yoshi", "luigi", "mario", "ganondorf",
  "link", "younglink", "roy", "zelda",
  "dk", "bowser", "ness", "mewtwo",
  "kirby", "gnw",
];

export type ColorMode = "dark" | "light";

/** Derive a light version from a dark-default theme */
function toLightTheme(theme: Theme): Theme {
  return {
    ...theme,
    bg: "#f5f5f7", bgCard: "#ffffff", bgHover: "#eeeef2", border: "#d8d8e0",
    text: "#1a1a2e", textDim: "#6e6e82",
    textTitle: theme.accentDim, textLabel: theme.secondaryDim,
    accentGlow: theme.accentGlow.replace(/[\d.]+\)$/, "0.08)"),
    green: "#16a34a", red: "#dc2626", yellow: "#ca8a04",
    sidebarBg: "#f0f0f4",
    gradientStart: theme.gradientStart.replace(/[\d.]+\)$/, "0.06)"),
    gradientEnd: theme.gradientEnd.replace(/[\d.]+\)$/, "0.03)"),
  };
}

/** Derive a dark version from a light-default theme */
function toDarkTheme(theme: Theme): Theme {
  return {
    ...theme,
    bg: "#0c0c10", bgCard: "#161620", bgHover: "#1e1e2c", border: "#28283c",
    text: "#e4e4ec", textDim: "#8080a0",
    textTitle: theme.accent, textLabel: theme.secondary,
    accentGlow: theme.accentGlow.replace(/[\d.]+\)$/, "0.08)"),
    green: "#22c55e", red: "#e84855", yellow: "#eab308",
    sidebarBg: "#0a0a12",
    gradientStart: theme.gradientStart.replace(/[\d.]+\)$/, "0.04)"),
    gradientEnd: theme.gradientEnd.replace(/[\d.]+\)$/, "0.02)"),
  };
}

/**
 * Resolve theme + mode. If the requested mode matches the theme's default,
 * return it as-is. Otherwise, derive the opposite.
 */
export function getResolvedTheme(themeId: string, mode: ColorMode): Theme {
  const base = THEMES[themeId] ?? THEMES["slippi"]!;
  if (mode === base.defaultMode) return base;
  return mode === "light" ? toLightTheme(base) : toDarkTheme(base);
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.style.setProperty("--bg", theme.bg);
  root.style.setProperty("--bg-card", theme.bgCard);
  root.style.setProperty("--bg-hover", theme.bgHover);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--text-dim", theme.textDim);
  root.style.setProperty("--text-title", theme.textTitle);
  root.style.setProperty("--text-label", theme.textLabel);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-dim", theme.accentDim);
  root.style.setProperty("--accent-glow", theme.accentGlow);
  root.style.setProperty("--secondary", theme.secondary);
  root.style.setProperty("--secondary-dim", theme.secondaryDim);
  root.style.setProperty("--green", theme.green);
  root.style.setProperty("--red", theme.red);
  root.style.setProperty("--yellow", theme.yellow);
  root.style.setProperty("--sidebar-bg", theme.sidebarBg);
  root.style.setProperty("--sidebar-accent", theme.sidebarAccent);
  root.style.setProperty("--gradient-start", theme.gradientStart);
  root.style.setProperty("--gradient-end", theme.gradientEnd);
}
