import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { PlayerRadar } from "../components/RadarChart";
import { computeRadarStats } from "../radarStats";
import {
  useCharacterList,
  useCharacterMatchups,
  useCharacterStageStats,
  useCharacterSignatureStats,
  useCharacterGameStats,
} from "../hooks/queries";
import { Tooltip } from "../components/Tooltip";
import { CoachingModal } from "../components/CoachingModal";

// ── Character card art (dynamic, falls back to emoji) ────────────────

const CHARACTER_IMAGE_NAMES: Record<string, string> = {
  Marth: "marth.png",
  Peach: "peach.png",
};

function CharacterCardImage({ character }: { character: string }) {
  const [error, setError] = useState(false);
  const filename = CHARACTER_IMAGE_NAMES[character];
  if (!filename || error) return null;
  const src = new URL(`../assets/characters/${filename}`, import.meta.url).href;
  return <img src={src} alt="" className="char-card-bg-img" onError={() => setError(true)} draggable={false} />;
}

// ── Types ────────────────────────────────────────────────────────────

interface SignatureStat {
  label: string;
  value: number;
  perGame?: number;
  suffix?: string;
  highlight?: boolean;
  tip?: string;
}

// ── Character metadata ────────────────────────────────────────────────

const CHARACTER_META: Record<
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
  Sheik: { emoji: "\ud83e\udd77", color: "#8b5cf6", glowColor: "rgba(139, 92, 246, 0.15)" },
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
  Ganon: { emoji: "\ud83d\udc4a", color: "#7c3aed", glowColor: "rgba(124, 58, 237, 0.15)" },
  Link: { emoji: "\ud83d\udde1\ufe0f", color: "#22c55e", glowColor: "rgba(34, 197, 94, 0.15)" },
  YLink: { emoji: "\ud83c\udff9", color: "#84cc16", glowColor: "rgba(132, 204, 22, 0.15)" },
  Zelda: { emoji: "\u2728", color: "#c084fc", glowColor: "rgba(192, 132, 252, 0.15)" },
  Roy: { emoji: "\ud83d\udd25", color: "#dc2626", glowColor: "rgba(220, 38, 38, 0.15)" },
  Mewtwo: { emoji: "\ud83d\udd2e", color: "#a78bfa", glowColor: "rgba(167, 139, 250, 0.15)" },
  "G&W": { emoji: "\ud83d\udd14", color: "#1e293b", glowColor: "rgba(30, 41, 59, 0.15)" },
  Ness: { emoji: "\ud83e\udde2", color: "#ef4444", glowColor: "rgba(239, 68, 68, 0.15)" },
  Bowser: { emoji: "\ud83d\udc22", color: "#65a30d", glowColor: "rgba(101, 163, 13, 0.15)" },
  Kirby: { emoji: "\ud83e\ude77", color: "#fb7185", glowColor: "rgba(251, 113, 133, 0.15)" },
  DK: { emoji: "\ud83e\udd8d", color: "#92400e", glowColor: "rgba(146, 64, 14, 0.15)" },
  Pichu: { emoji: "\u26a1", color: "#facc15", glowColor: "rgba(250, 204, 21, 0.15)" },
};

const DEFAULT_META = { emoji: "\ud83c\udfae", color: "var(--accent)", glowColor: "var(--accent-glow)" };

function getMeta(character: string) {
  return CHARACTER_META[character] || DEFAULT_META;
}

// ── Aggregate signature stats across games ──────────────────────────

function aggregateSignatureStats(rawStats: any[], characterName?: string): SignatureStat[] {
  if (rawStats.length === 0) return [];

  const character = characterName ?? rawStats[0]?.character;
  if (!character) return [];

  const totals: Record<string, number> = {};
  for (const game of rawStats) {
    for (const [key, val] of Object.entries(game)) {
      if (key === "character") continue;
      if (typeof val === "number") {
        totals[key] = (totals[key] ?? 0) + val;
      }
    }
  }

  const LABELS: Record<
    string,
    Record<string, { label: string; suffix?: string; highlight?: boolean; tip?: string }>
  > = {
    Fox: {
      multiShineCombos: {
        label: "Multi-Shine Combos",
        highlight: true,
        tip: "Two or more shines in rapid succession during a combo. Requires frame-perfect inputs — a hallmark of top Fox play.",
      },
      waveshineToUpsmash: {
        label: "Waveshine \u2192 Upsmash",
        tip: "Shine followed by a wavedash (airdodge into ground for momentum) into upsmash. Fox's bread-and-butter kill confirm at mid-to-high percent.",
      },
      upthrowUpairs: {
        label: "Uthrow \u2192 Uair",
        tip: "Up-throw into up-air. Fox's classic combo starter that chains into itself at low-mid percent on most characters.",
      },
      upthrowUpairKills: {
        label: "Uthrow \u2192 Uair Kills",
        highlight: true,
        tip: "Stocks taken directly from the up-throw to up-air sequence. A reliable kill confirm on platforms.",
      },
      drillShines: {
        label: "Drill \u2192 Shine",
        tip: "Down-air (drill kick) into reflector (shine). Fox's primary shield pressure and combo extension tool.",
      },
      shineSpikeKills: {
        label: "Shine Spike Kills",
        highlight: true,
        tip: "Offstage shine sends opponents downward for a gimp. Extremely effective but risky — requires going deep offstage.",
      },
    },
    Falco: {
      pillarCombos: {
        label: "Pillar Combos",
        highlight: true,
        tip: "Shine into dair (spike) that bounces the opponent off the ground, allowing repeated shine-dair loops. Falco's signature punish combo.",
      },
      pillarKills: {
        label: "Pillar Kills",
        highlight: true,
        tip: "Stocks taken during or as the direct result of a pillar combo sequence.",
      },
      shineGrabs: {
        label: "Shine \u2192 Grab",
        tip: "Shine into grab. Used when the opponent begins shielding the pillar sequence — a key mixup in Falco's pressure game.",
      },
      laserCount: {
        label: "Lasers Fired",
        tip: "Short hop lasers (SHL). Falco's laser stuns on hit, making it the best neutral control projectile in the game.",
      },
    },
    Marth: {
      kenCombos: {
        label: "Ken Combos",
        highlight: true,
        tip: "Forward-air into dair spike offstage. Named after legendary player Ken — Marth's most stylish kill setup that sends opponents at a downward angle.",
      },
      kenComboKills: {
        label: "Ken Combo Kills",
        highlight: true,
        tip: "Stocks taken directly from a Ken combo (fair to dair spike offstage).",
      },
      chainGrabs: {
        label: "Chain Grabs",
        tip: "Repeated grab sequences where Marth re-grabs before the opponent can act. Works on spacies and other fastfallers at low percent.",
      },
      fsmashKills: {
        label: "Fsmash Kills",
        highlight: true,
        tip: "Kills from Marth's forward smash (tipper). The tip of the blade deals significantly more damage and knockback.",
      },
    },
    Sheik: {
      techChases: {
        label: "Tech Chases",
        highlight: true,
        tip: "Reacting to the opponent's tech option (tech in place, tech roll, missed tech) after a down-throw and following up. Sheik's primary punish game.",
      },
      techChaseKills: {
        label: "Tech Chase Kills",
        highlight: true,
        tip: "Stocks taken directly from tech chase sequences. Shows reaction-based punish execution.",
      },
      needleHits: {
        label: "Needle Hits",
        tip: "Charge shot needles that connected. Key neutral tool for stage control, edgeguarding, and interrupting approaches.",
      },
      fairChains: {
        label: "Fair Chains (3+)",
        tip: "Three or more consecutive forward-airs. Sheik's fair chains are a reliable damage-building combo at low-to-mid percent.",
      },
    },
    Falcon: {
      kneeKills: {
        label: "Knee Kills",
        highlight: true,
        tip: "Kills with forward-air (the Knee of Justice). Must hit at the first active frame for full power — Falcon's most iconic kill move.",
      },
      stompKnees: {
        label: "Stomp \u2192 Knee",
        highlight: true,
        tip: "Down-air (stomp) comboing into knee. The Sacred Combo — Falcon's highest-damage kill confirm.",
      },
      upthrowKnees: {
        label: "Uthrow \u2192 Knee Kills",
        tip: "Up-throw into knee for a stock. Works at specific percent windows depending on the opponent's weight and fall speed.",
      },
      techChaseGrabs: {
        label: "Tech Chase Grabs",
        highlight: true,
        tip: "Re-grabs off tech chase reads. Falcon's reaction-based regrab game extends punishes massively.",
      },
      gentlemanCount: {
        label: "Gentlemen",
        tip: "The three-hit jab combo (Gentleman). Requires precise timing to avoid the rapid jab — a sign of refined Falcon control.",
      },
    },
    Puff: {
      restKills: {
        label: "Rest Kills",
        highlight: true,
        tip: "Kills from Rest (down-B). Puff's devastating kill move that deals massive knockback but leaves her asleep and vulnerable if it misses.",
      },
      restAttempts: {
        label: "Rest Attempts",
        tip: "Total Rest uses including misses. A high miss rate suggests risky Rest attempts or poor setup reads.",
      },
      bairStrings: {
        label: "Bair Walls (3+)",
        highlight: true,
        tip: "Three or more back-airs in sequence. Puff's back-air wall creates a defensive wall of hitboxes that controls space and racks damage.",
      },
      longestBairString: {
        label: "Longest Bair String",
        suffix: " hits",
        tip: "Most consecutive back-airs landed in a single sequence across all games.",
      },
    },
    ICs: {
      wobbles: {
        label: "Wobbles",
        highlight: true,
        tip: "The infinite grab technique where Popo holds the grab while Nana pummels repeatedly. A guaranteed 0-to-death off any grab when both climbers are present.",
      },
      wobbleKills: {
        label: "Wobble Kills",
        highlight: true,
        tip: "Stocks taken via wobbling. Each successful wobble should result in a kill.",
      },
      desyncs: {
        label: "Desyncs",
        highlight: true,
        tip: "Intentionally separating Nana and Popo's actions to create overlapping hitboxes and grab setups. Advanced ICs tech.",
      },
      sopoKills: {
        label: "Sopo Kills",
        tip: "Kills scored while Nana is dead (playing as solo Popo). Shows clutch ability without the wobble threat.",
      },
      nanaDeaths: {
        label: "Nana Deaths",
        tip: "Times Nana died before Popo. Losing Nana removes wobble and desync options — keeping her alive is critical.",
      },
    },
    Peach: {
      turnipPulls: {
        label: "Turnip Pulls",
        tip: "Down-B turnip pulls. Peach's main projectile — used for stage control, combo extensions, and edgeguarding.",
      },
      turnipHits: {
        label: "Turnip Hits",
        tip: "Turnips that connected with the opponent. Tracks projectile accuracy and usage in neutral/advantage.",
      },
      stitchFaces: {
        label: "Stitch Faces",
        highlight: true,
        tip: "Rare turnip pull (1/58 chance) that deals massive damage and knockback. A lucky but devastating item.",
      },
      dsmashKills: {
        label: "Downsmash Kills",
        highlight: true,
        tip: "Kills from Peach's down-smash — a multi-hit move that can deal huge shield damage and catches rolls. Her primary kill move in many situations.",
      },
      floatCancelAerials: {
        label: "Float Cancel Aerials",
        tip: "Aerials performed from float height and cancelled on landing. Peach's core movement tech that enables safe pressure and combos.",
      },
    },
    Samus: {
      chargeShotKills: {
        label: "Charge Shot Kills",
        highlight: true,
        tip: "Kills from fully or partially charged neutral-B. Samus's primary kill move at range — zoning and edgeguard tool.",
      },
      missileCount: {
        label: "Missiles Fired",
        tip: "Total homing and super missiles fired. Missiles control space and force approaches.",
      },
      upBKills: {
        label: "Up-B Kills",
        tip: "Kills with screw attack (up-B). A multi-hit out-of-shield option and combo finisher.",
      },
      dairKills: {
        label: "Dair Kills",
        tip: "Kills from down-air meteor. Samus's aerial spike for offstage finishes.",
      },
    },
    Pikachu: {
      thunderKills: {
        label: "Thunder Kills",
        highlight: true,
        tip: "Kills from down-B thunder bolt. Hits above Pikachu and can KO off the top at surprisingly low percent.",
      },
      upSmashKills: {
        label: "Upsmash Kills",
        highlight: true,
        tip: "Kills from up-smash. Pikachu's strongest grounded KO move with a wide arc.",
      },
      upairChains: {
        label: "Uair Chains (3+)",
        tip: "Three or more up-airs in sequence. Pikachu's primary juggle and damage-building tool.",
      },
      nairCombos: {
        label: "Nair Combos (2+)",
        tip: "Two or more hits starting with nair. Nair is Pikachu's fastest aerial and key combo starter.",
      },
    },
    Luigi: {
      shoryukenKills: {
        label: "Shoryuken Kills",
        highlight: true,
        tip: "Kills from the frame-1 up-B sweetspot (coin punch). Deals massive knockback when landed perfectly — Luigi's scariest move.",
      },
      dairKills: {
        label: "Dair Kills",
        tip: "Kills from down-air spike. Luigi's dair is a strong meteor with long active frames.",
      },
      downSmashKills: {
        label: "Dsmash Kills",
        tip: "Kills from down-smash. Hits on both sides and sends at a low angle — good for edgeguard setups.",
      },
      fireBallCount: {
        label: "Fireballs Fired",
        tip: "Green fireballs used for neutral control. Luigi's fireball travels in a straight line unlike Mario's.",
      },
    },
    Mario: {
      capeCount: {
        label: "Capes Used",
        tip: "Cape (side-B) uses. Reflects projectiles and reverses opponent's momentum — deadly for edgeguarding recoveries.",
      },
      fireBallCount: {
        label: "Fireballs Fired",
        tip: "Fireballs used in neutral. Mario's fireball bounces along the ground for stage control.",
      },
      fsmashKills: {
        label: "Fsmash Kills",
        highlight: true,
        tip: "Kills from forward smash. Mario's primary grounded kill move with high knockback.",
      },
      upSmashKills: {
        label: "Upsmash Kills",
        tip: "Kills from up-smash. Headbutt with invincibility — strong out-of-shield option.",
      },
      fairSpikeKills: {
        label: "Fair Spike Kills",
        highlight: true,
        tip: "Kills from forward-air meteor smash. The sweetspot sends opponents straight down for early gimps.",
      },
    },
    Doc: {
      pillCount: {
        label: "Pills Thrown",
        tip: "Megavitamins (neutral-B) thrown. Bounces at a different angle than Mario's fireball — better for edgeguarding.",
      },
      fsmashKills: {
        label: "Fsmash Kills",
        highlight: true,
        tip: "Kills from forward smash. Doc's fsmash has more knockback than Mario's, making it a stronger kill option.",
      },
      upBKills: {
        label: "Up-B Kills",
        highlight: true,
        tip: "Kills from Super Jump Punch. Doc's up-B sweetspot is one of the strongest kill moves in the game.",
      },
      dairKills: {
        label: "Dair Kills",
        tip: "Kills from down-air. Doc's drill kick into edgeguard or gimp scenarios.",
      },
      fairSpikeKills: {
        label: "Fair Spike Kills",
        highlight: true,
        tip: "Kills from forward-air meteor smash. Same concept as Mario but Doc hits harder.",
      },
    },
    Yoshi: {
      eggThrowCount: {
        label: "Eggs Thrown",
        tip: "Egg throw (neutral-B) projectiles. Yoshi's angled egg toss for stage control and edgeguarding.",
      },
      dairKills: {
        label: "Dair Kills",
        highlight: true,
        tip: "Kills from down-air. Yoshi's dair is a multi-hit meteor with massive damage — one of the strongest spikes in the game.",
      },
      upSmashKills: { label: "Upsmash Kills", tip: "Kills from up-smash headbutt. Strong vertical kill move." },
      fairSpikeKills: {
        label: "Fair Spike Kills",
        highlight: true,
        tip: "Kills from forward-air meteor. A clean spike option for offstage edgeguards.",
      },
    },
    Ganon: {
      stompKills: {
        label: "Stomp Kills",
        highlight: true,
        tip: "Kills from down-air (the Stomp). Ganon's devastating aerial spike — one of the most powerful meteors in the game.",
      },
      sideBKills: {
        label: "Gerudo Dragon Kills",
        highlight: true,
        tip: "Kills from side-B (Gerudo Dragon/Flame Choke). Command grab that can be used for stage spikes and suicide KOs.",
      },
      upTiltKills: {
        label: "Utilt Kills",
        highlight: true,
        tip: "Kills from up-tilt (the Volcano Kick). Extremely slow but absurdly powerful — one of the strongest single hits in Melee.",
      },
      fairKills: {
        label: "Fair Kills",
        tip: "Kills from forward-air. A strong punch with good range and knockback for edgeguarding.",
      },
    },
    Link: {
      boomerangCount: {
        label: "Boomerangs",
        tip: "Boomerang (side-B) throws for neutral control and combo setups. Returns to Link for extended coverage.",
      },
      bombCount: {
        label: "Bombs",
        tip: "Bomb pulls and uses. Link's bombs are versatile — used for recovery, combos, and edgeguarding.",
      },
      dairSpikeKills: {
        label: "Dair Spike Kills",
        highlight: true,
        tip: "Kills from down-air spike. Link's dair is a strong single-hit meteor for offstage finishes.",
      },
      upSmashKills: {
        label: "Upsmash Kills",
        tip: "Kills from up-smash. A three-hit arc slash with strong vertical knockback.",
      },
      grabCombos: {
        label: "Grab Combos",
        tip: "Combos starting from a grab. Link's throws lead into aerials at various percents.",
      },
    },
    YLink: {
      fireArrowCount: {
        label: "Fire Arrows",
        tip: "Fire arrow (neutral-B) shots. Faster startup than Link's, used for neutral pokes and edgeguarding.",
      },
      bombCount: { label: "Bombs", tip: "Bomb uses for combos, recovery mixups, and stage control." },
      dairSpikeKills: {
        label: "Dair Spike Kills",
        highlight: true,
        tip: "Kills from down-air meteor. Young Link's primary offstage finisher.",
      },
      nairCombos: {
        label: "Nair Combos (2+)",
        tip: "Combos starting with nair (sex kick). Young Link's nair is a fast combo starter.",
      },
    },
    Zelda: {
      lightningKickKills: {
        label: "Lightning Kick Kills",
        highlight: true,
        tip: "Kills from the sweetspot of fair or bair (Lightning Kicks). Must hit at the tip of her foot — devastating knockback when spaced perfectly.",
      },
      dinsFireCount: {
        label: "Din's Fire",
        tip: "Din's Fire (side-B) projectile uses. A controllable fireball for zoning and edgeguarding.",
      },
      upBKills: {
        label: "Up-B Kills",
        tip: "Kills from Farore's Wind (up-B). The vanish hitbox at startup can KO — an underrated kill option.",
      },
    },
    Roy: {
      fsmashKills: {
        label: "Fsmash Kills",
        highlight: true,
        tip: "Kills from forward smash. Roy's fsmash sweetspot (hilt) is extremely powerful and has fast startup for a smash attack.",
      },
      blazerKills: {
        label: "Blazer Kills",
        highlight: true,
        tip: "Kills from Blazer (up-B). Roy's up-B deals strong knockback at the start — used as a combo finisher and out-of-shield option.",
      },
      counterCount: {
        label: "Counters",
        tip: "Counter (down-B) activations. Returns 1.5x the damage of the countered attack.",
      },
      chainGrabs: {
        label: "Chain Grabs",
        tip: "Repeated grab sequences at low percent. Roy can chain grab fastfallers with down-throw.",
      },
      dtiltConversions: {
        label: "Dtilt Conversions",
        tip: "Combos started from down-tilt. Roy's dtilt pops opponents up for follow-up aerials.",
      },
    },
    Mewtwo: {
      shadowBallCount: {
        label: "Shadow Balls",
        tip: "Shadow Ball (neutral-B) projectiles. Mewtwo's main zoning tool — can be charged and stored for later use.",
      },
      confusionCount: {
        label: "Confusions",
        tip: "Confusion (side-B) uses. A reflector and command turn-around — flips opponents and can set up edgeguards.",
      },
      upThrowKills: {
        label: "Uthrow Kills",
        highlight: true,
        tip: "Kills from up-throw. Mewtwo's up-throw is one of the strongest throws in the game at high percent.",
      },
      fairKills: {
        label: "Fair Kills",
        tip: "Kills from forward-air. Mewtwo's fair has deceptive range with its tail hitbox.",
      },
    },
    "G&W": {
      judgementCount: {
        label: "Judgements",
        tip: "Judgement (side-B) hammer uses. Outputs a random number 1-9, each with different effects. #9 is an instant KO.",
      },
      judgementKills: {
        label: "Judgement Kills",
        highlight: true,
        tip: "Kills from Judgement hammer. Primarily from #9 (one-hit KO) but higher numbers can also kill at high percent.",
      },
      upAirKills: {
        label: "Uair Kills",
        highlight: true,
        tip: "Kills from up-air. G&W's up-air has surprisingly strong vertical knockback.",
      },
      baconCount: {
        label: "Bacon (Chef)",
        tip: "Chef (neutral-B) projectile uses. Tosses random food items that arc unpredictably for zoning.",
      },
    },
    Ness: {
      pkFireCount: {
        label: "PK Fire",
        tip: "PK Fire (side-B) projectile. On hit, traps the opponent in a pillar of flame for follow-up attacks.",
      },
      backThrowKills: {
        label: "Back Throw Kills",
        highlight: true,
        tip: "Kills from back throw. Ness has the strongest back throw in Melee — a reliable kill option at high percent near the ledge.",
      },
      dairKills: { label: "Dair Kills", tip: "Kills from down-air meteor. Ness's dair spike for offstage finishes." },
      fairKills: {
        label: "Fair Kills",
        tip: "Kills from forward-air. A strong aerial with good knockback for edgeguarding.",
      },
    },
    Bowser: {
      flameCount: {
        label: "Flame Breath",
        tip: "Flame Breath (neutral-B) uses. A continuous stream of fire for damage — weakens over time if held too long.",
      },
      koopaClaw: {
        label: "Koopa Klaw",
        tip: "Koopa Klaw (side-B) command grab. Grabs opponents and can bite them repeatedly or throw them.",
      },
      upBKills: {
        label: "Up-B Kills",
        tip: "Kills from Whirling Fortress (up-B). A multi-hit spinning shell — strong out-of-shield option.",
      },
      fsmashKills: {
        label: "Fsmash Kills",
        highlight: true,
        tip: "Kills from forward smash (the Bowser Punch). Slow but one of the most powerful smash attacks in the game.",
      },
    },
    Kirby: {
      inhaleCount: {
        label: "Inhales",
        tip: "Inhale (neutral-B) uses. Swallows opponents to copy their neutral-B or spit them out as a projectile.",
      },
      upTiltKills: {
        label: "Utilt Kills",
        highlight: true,
        tip: "Kills from up-tilt. A quick vertical kick that's Kirby's most reliable kill move.",
      },
      fsmashKills: { label: "Fsmash Kills", tip: "Kills from forward smash. A powerful kick with good range." },
      dairCombos: {
        label: "Dair Combos (3+)",
        tip: "Three or more hits from down-air drill. Kirby's multi-hit dair can combo into itself and other moves.",
      },
      stoneKills: {
        label: "Stone Kills",
        highlight: true,
        tip: "Kills from Stone (down-B). Kirby transforms into a heavy object — powerful but extremely punishable on shield.",
      },
    },
    DK: {
      giantPunchKills: {
        label: "Giant Punch Kills",
        highlight: true,
        tip: "Kills from fully charged Giant Punch (neutral-B). Can be stored and released — DK's strongest single hit.",
      },
      headbuttCount: {
        label: "Headbutts",
        tip: "Headbutt (side-B) uses. Buries grounded opponents for a guaranteed follow-up. Spikes in the air.",
      },
      spikeKills: {
        label: "Spike Kills",
        highlight: true,
        tip: "Offstage kills from DK's aerial spikes (fair and dair). DK has some of the most powerful spikes in the game.",
      },
      bairKills: {
        label: "Bair Kills",
        tip: "Kills from back-air. DK's bair is a strong kick with good horizontal knockback.",
      },
    },
    Pichu: {
      thunderJoltCount: {
        label: "Thunder Jolts",
        tip: "Thunder Jolt (neutral-B) projectiles. Similar to Pikachu's but Pichu takes recoil damage from using it.",
      },
      thunderKills: {
        label: "Thunder Kills",
        highlight: true,
        tip: "Kills from Thunder (down-B). Pichu's thunder hits harder than Pikachu's but also deals self-damage.",
      },
      upSmashKills: { label: "Upsmash Kills", tip: "Kills from up-smash. Pichu's strongest vertical KO move." },
      nairCombos: {
        label: "Nair Combos (2+)",
        tip: "Combos starting with nair. Pichu's nair is a fast aerial for starting combo sequences.",
      },
    },
  };

  const charLabels = LABELS[character];
  if (!charLabels) return [];

  // For max-type stats, take the max instead of sum
  const MAX_STATS = new Set(["longestBairString"]);
  for (const key of MAX_STATS) {
    if (totals[key] !== undefined) {
      totals[key] = Math.max(...rawStats.map((g: any) => g[key] ?? 0));
    }
  }

  const gameCount = rawStats.length;
  return Object.entries(charLabels)
    .filter(([key]) => totals[key] !== undefined)
    .map(([key, meta]) => {
      const total = totals[key]!;
      const isMaxStat = MAX_STATS.has(key);
      const perGame = gameCount > 0 && !isMaxStat ? total / gameCount : 0;
      return {
        label: meta.label,
        value: total,
        perGame: isMaxStat ? undefined : perGame,
        suffix: meta.suffix,
        highlight: meta.highlight,
        tip: meta.tip,
      };
    });
}

// ── Component ────────────────────────────────────────────────────────

export function Characters({ refreshKey }: { refreshKey: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [isCoachingOpen, setIsCoachingOpen] = useState(false);

  const { data: characters = [], isLoading: loading, refetch: refetchList } = useCharacterList();
  const { data: rawMatchups = [], isFetching: muLoading, refetch: refetchMu } = useCharacterMatchups(selected);
  const { data: rawStages = [], isFetching: stLoading, refetch: refetchSt } = useCharacterStageStats(selected);
  const { data: rawSig = [], isFetching: sigLoading, refetch: refetchSig } = useCharacterSignatureStats(selected);
  const { data: rawGameStats = [], isFetching: gsLoading, refetch: refetchGs } = useCharacterGameStats(selected);

  const detailLoading = muLoading || stLoading || sigLoading || gsLoading;

  // Reset to character list when the Characters nav icon is clicked while already on this page
  useEffect(() => {
    const onReactivate = (e: Event) => {
      const detail = (e as CustomEvent<{ page: string }>).detail;
      if (detail?.page === "characters") setSelected(null);
    };
    window.addEventListener("nav:reactivate", onReactivate);
    return () => window.removeEventListener("nav:reactivate", onReactivate);
  }, []);

  useEffect(() => {
    refetchList();
    if (selected) {
      refetchMu();
      refetchSt();
      refetchSig();
      refetchGs();
    }
  }, [refreshKey, refetchList, refetchMu, refetchSt, refetchSig, refetchGs, selected]);

  const signatureStats = useMemo(
    () => aggregateSignatureStats(rawSig || [], selected ?? undefined),
    [rawSig, selected],
  );
  const radarStats = useMemo(() => (rawGameStats ? computeRadarStats(rawGameStats) : null), [rawGameStats]);
  const matchups = rawMatchups || [];
  const stages = rawStages || [];

  if (loading)
    return (
      <div className="loading">
        <div className="spinner" style={{ margin: "0 auto 12px" }} />
        Loading...
      </div>
    );
  if (characters.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg
            width="56"
            height="56"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.4, color: "var(--accent)" }}
          >
            <circle cx="12" cy="7" r="4" />
            <path d="M5.5 21v-2a5.5 5.5 0 0 1 13 0v2" />
          </svg>
        </div>
        <h2>No character data</h2>
        <p>Play some games to see character stats.</p>
      </div>
    );
  }

  const selectedChar = characters.find((c) => c.character === selected);
  const meta = selected ? getMeta(selected) : DEFAULT_META;
  const pct = (v: number) => (v * 100).toFixed(1) + "%";

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="page-header">
          <h1>Characters</h1>
          <p>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--accent)" }}>
              {characters.length}
            </span>{" "}
            characters played
          </p>
        </div>
      </motion.div>

      {/* Grid mode */}
      {!selected && (
        <div className="char-grid">
          {characters.map((c, index) => {
            const cm = getMeta(c.character);
            const wr = (c.winRate * 100).toFixed(0);
            const hasArt = c.character in CHARACTER_IMAGE_NAMES;

            return (
              <motion.div
                key={c.character}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <button
                  className={`card char-card${hasArt ? " char-card-has-art" : ""}`}
                  onClick={() => setSelected(c.character)}
                  style={
                    {
                      "--char-color": cm.color,
                      "--char-glow": cm.glowColor,
                    } as React.CSSProperties
                  }
                >
                  <CharacterCardImage character={c.character} />
                  {!hasArt && <div className="char-card-emoji">{cm.emoji}</div>}
                  <div className="char-card-content">
                    <div className="char-card-name">{c.character}</div>
                    <div className="char-card-record">
                      <span className="record-win">{c.wins}W</span>
                      {" - "}
                      <span className="record-loss">{c.losses}L</span>
                    </div>
                    <div className="char-card-games">
                      {c.gamesPlayed} games &middot; {wr}%
                    </div>
                    <div className="char-card-baseline">
                      <Tooltip text="Neutral win rate" position="top">
                        <span className="char-card-baseline-stat">{pct(c.avgNeutralWinRate)} NW</span>
                      </Tooltip>
                      <Tooltip text="Conversion rate" position="top">
                        <span className="char-card-baseline-stat">{pct(c.avgConversionRate)} CV</span>
                      </Tooltip>
                      <Tooltip text="L-cancel rate" position="top">
                        <span className="char-card-baseline-stat">{pct(c.avgLCancelRate)} LC</span>
                      </Tooltip>
                    </div>
                  </div>
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Detail mode */}
      {selected && selectedChar && (
        <div
          className="char-detail"
          style={{ "--char-color": meta.color, "--char-glow": meta.glowColor } as React.CSSProperties}
        >
          <CoachingModal
            isOpen={isCoachingOpen}
            onClose={() => setIsCoachingOpen(false)}
            scope="character"
            id={selected}
            title={`${selected} Matchup Analysis`}
          />
          <motion.button
            className="char-back-btn"
            onClick={() => setSelected(null)}
            whileHover={{ x: -3 }}
            whileTap={{ scale: 0.97 }}
          >
            &larr; All Characters
          </motion.button>

          <div className="char-detail-layout">
            {/* Left column -- hero card */}
            <motion.div
              className="char-detail-left"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div
                className="card chrome-plate char-hero-card"
                style={{ "--char-color": meta.color, "--char-glow": meta.glowColor } as React.CSSProperties}
              >
                <div className="char-hero-card-emoji">{meta.emoji}</div>
                <div className="char-hero-card-name" style={{ color: meta.color }}>
                  {selectedChar.character}
                </div>
                <div className="char-hero-card-record">
                  <span className="record-win">{selectedChar.wins}W</span>
                  {" - "}
                  <span className="record-loss">{selectedChar.losses}L</span>
                </div>
                <div className="char-hero-card-meta">
                  {selectedChar.gamesPlayed} games &middot; {pct(selectedChar.winRate)} win rate
                </div>

                <button
                  className="btn btn-primary"
                  onClick={() => setIsCoachingOpen(true)}
                  style={{
                    background: meta.color,
                    border: "none",
                    width: "100%",
                    marginTop: "24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    fontWeight: 700,
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                    <path d="M12 12L2.1 12.1" />
                    <path d="M12 12L19 19" />
                    <path d="M12 12V22" />
                  </svg>
                  Analyze Matchup
                </button>

                <div className="char-hero-stats">
                  <div className="char-hero-stat">
                    <div className="char-hero-stat-value">{pct(selectedChar.avgNeutralWinRate)}</div>
                    <Tooltip
                      text="How often you win the first hit in an exchange with this character"
                      position="bottom"
                    >
                      <span className="char-hero-stat-label">Neutral WR</span>
                    </Tooltip>
                  </div>
                  <div className="char-hero-stat">
                    <div className="char-hero-stat-value">{pct(selectedChar.avgConversionRate)}</div>
                    <Tooltip text="How often a neutral win leads to a combo or damage string" position="bottom">
                      <span className="char-hero-stat-label">Conv Rate</span>
                    </Tooltip>
                  </div>
                  <div className="char-hero-stat">
                    <div className="char-hero-stat-value">{pct(selectedChar.avgLCancelRate)}</div>
                    <Tooltip text="Percentage of aerials landing with a successful L-cancel" position="bottom">
                      <span className="char-hero-stat-label">L-Cancel</span>
                    </Tooltip>
                  </div>
                  <div className="char-hero-stat">
                    <div className="char-hero-stat-value">{selectedChar.avgOpeningsPerKill.toFixed(1)}</div>
                    <Tooltip text="Neutral wins needed per stock. Lower = more efficient kills." position="bottom">
                      <span className="char-hero-stat-label">Openings/Kill</span>
                    </Tooltip>
                  </div>
                  <div className="char-hero-stat">
                    <div className="char-hero-stat-value">{selectedChar.avgDamagePerOpening.toFixed(1)}</div>
                    <Tooltip
                      text="Average damage dealt per neutral opening. Measures punish optimization."
                      position="bottom"
                    >
                      <span className="char-hero-stat-label">Dmg/Opening</span>
                    </Tooltip>
                  </div>
                  <div className="char-hero-stat">
                    <div className="char-hero-stat-value">{selectedChar.avgDeathPercent.toFixed(0)}%</div>
                    <Tooltip
                      text="Average percent at death. Higher = better survival DI and defensive play."
                      position="bottom"
                    >
                      <span className="char-hero-stat-label">Death %</span>
                    </Tooltip>
                  </div>
                  <div className="char-hero-stat">
                    <div className="char-hero-stat-value">{pct(selectedChar.avgRecoverySuccessRate)}</div>
                    <Tooltip text="How often you make it back to stage when knocked offstage" position="bottom">
                      <span className="char-hero-stat-label">Recovery</span>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Right column */}
            <motion.div
              className="char-detail-right"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {detailLoading ? (
                <div className="loading">Loading details...</div>
              ) : (
                <>
                  {radarStats && (
                    <div className="card">
                      <div className="card-title">Skill Profile</div>
                      <PlayerRadar stats={radarStats} games={rawGameStats ?? undefined} />
                    </div>
                  )}

                  {signatureStats.length > 0 && (
                    <div className="card">
                      <div className="card-title">Signature Stats</div>
                      <div className="sig-grid">
                        {signatureStats.map((s, i) => (
                          <motion.div
                            key={s.label}
                            className={`sig-stat ${s.highlight ? "sig-stat-highlight" : ""}`}
                            style={s.highlight ? { borderColor: meta.color } : undefined}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <div className="sig-stat-value" style={s.highlight ? { color: meta.color } : undefined}>
                              {s.value}
                              {s.suffix ?? ""}
                            </div>
                            {s.tip ? (
                              <Tooltip text={s.tip} position="bottom">
                                <span className="sig-stat-label">{s.label}</span>
                              </Tooltip>
                            ) : (
                              <div className="sig-stat-label">{s.label}</div>
                            )}
                            {s.perGame !== undefined && <div className="sig-stat-avg">{s.perGame.toFixed(1)}/game</div>}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {matchups.length > 0 && (
                    <div className="card">
                      <div className="card-title">Matchups</div>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>vs Character</th>
                            <th>Games</th>
                            <th>Record</th>
                            <th>Win Rate</th>
                            <th>
                              <Tooltip text="Average neutral win rate in this matchup" position="bottom">
                                <span>Neutral WR</span>
                              </Tooltip>
                            </th>
                            <th>
                              <Tooltip text="Conversion rate — how often openings lead to combos" position="bottom">
                                <span>Conv Rate</span>
                              </Tooltip>
                            </th>
                            <th>
                              <Tooltip text="Openings needed per kill — lower is more efficient" position="bottom">
                                <span>Openings/Kill</span>
                              </Tooltip>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {matchups.map((m, i) => {
                            const oppMeta = getMeta(m.opponentCharacter);
                            const wrPct = m.winRate * 100;
                            const wrColor = wrPct >= 60 ? "var(--green)" : wrPct >= 45 ? "var(--yellow)" : "var(--red)";
                            return (
                              <motion.tr
                                key={m.opponentCharacter}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.02, duration: 0.3 }}
                              >
                                <td style={{ fontWeight: 600 }}>
                                  <span style={{ marginRight: 6 }}>{oppMeta.emoji}</span>
                                  {m.opponentCharacter}
                                </td>
                                <td style={{ fontFamily: "var(--font-mono)" }}>{m.gamesPlayed}</td>
                                <td>
                                  <span className="record-win">{m.wins}W</span>
                                  {" - "}
                                  <span className="record-loss">{m.losses}L</span>
                                </td>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span
                                      style={{
                                        fontFamily: "var(--font-mono)",
                                        fontWeight: 700,
                                        color: wrColor,
                                        fontSize: 13,
                                      }}
                                    >
                                      {pct(m.winRate)}
                                    </span>
                                    <div className="winrate-bar">
                                      <div className="winrate-bar-fill" style={{ width: `${wrPct}%` }} />
                                    </div>
                                  </div>
                                </td>
                                <td style={{ fontFamily: "var(--font-mono)" }}>{pct(m.avgNeutralWinRate)}</td>
                                <td style={{ fontFamily: "var(--font-mono)" }}>{pct(m.avgConversionRate)}</td>
                                <td style={{ fontFamily: "var(--font-mono)" }}>{m.avgOpeningsPerKill.toFixed(1)}</td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {stages.length > 0 && (
                    <div className="card">
                      <div className="card-title">Stage Stats</div>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Stage</th>
                            <th>Games</th>
                            <th>Record</th>
                            <th>Win Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stages.map((s) => (
                            <tr key={s.stage}>
                              <td style={{ fontWeight: 600 }}>{s.stage}</td>
                              <td style={{ fontFamily: "var(--font-mono)" }}>{s.gamesPlayed}</td>
                              <td>
                                <span className="record-win">{s.wins}W</span>
                                {" - "}
                                <span className="record-loss">{s.losses}L</span>
                              </td>
                              <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{pct(s.winRate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
}
