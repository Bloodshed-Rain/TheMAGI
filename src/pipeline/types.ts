import type { GameHighlight } from "./highlights.js";
import type { GameFrameEvents } from "./frameEvents.js";

// ── Interfaces from the spec ──────────────────────────────────────────

export interface PlayerSummary {
  tag: string;
  connectCode: string;
  character: string;
  neutralWins: number;
  neutralLosses: number;
  counterHits: number;
  neutralWinRate: number;
  openingsPerKill: number;
  totalOpenings: number;
  totalConversions: number;
  conversionRate: number;
  averageDamagePerOpening: number;
  killConversions: number;
  avgStagePosition: { x: number };
  timeOnPlatform: number;
  timeInAir: number;
  timeAtLedge: number;
  totalDamageTaken: number;
  avgDeathPercent: number;
  recoveryAttempts: number;
  recoverySuccessRate: number;
  /** Times opponent was in a recovery situation (offstage/below stage) */
  edgeguardAttempts: number;
  /** Rate at which edgeguard situations ended in opponent death */
  edgeguardSuccessRate: number;
  lCancelRate: number;
  /** Aerial landings where L-cancel success/fail was recorded. lCancelRate is 0 (not "0%") when this is 0. */
  lCancelAttempts: number;
  wavedashCount: number;
  dashDanceFrames: number;
  moveUsage: { move: string; count: number; hitRate: number }[];
  stocks: {
    stockNumber: number;
    percentLost: number;
    killMove: string | null;
    duration: number;
    openingsGiven: number;
    damageDealt: number;
    /** Timestamp when this stock started */
    startTime: string;
    /** Timestamp when this stock ended (death or game end) */
    endTime: string;
  }[];
  /** Peach only — turnip/item pull breakdown. Null for non-Peach characters. */
  turnipPulls: TurnipPullStats | null;
  /** Marth only — Ken combo detection. Null for non-Marth characters. */
  kenCombos: KenComboStats | null;
  /** Power shield count (projectile reflects + physical attack powershields). */
  powerShieldCount: number;
  /** Shield pressure sequences initiated against the opponent */
  shieldPressure: {
    sequenceCount: number;
    avgShieldDamage: number;
    shieldBreaks: number;
    shieldPokeRate: number;
  };
  /** DI quality estimation — matchup-aware, character-adjusted */
  diQuality: {
    /** 0-1: combo escape quality relative to character baseline vs this opponent. 0.5 = expected. */
    comboDIScore: number;
    /** 0-1: survival relative to character-specific expected death percent range. 0.5 = expected. */
    survivalDIScore: number;
    /** Average moves in conversions received */
    avgComboLengthReceived: number;
    /** Average moves in conversions dealt */
    avgComboLengthDealt: number;
    /** Expected combo length baseline adjusted for opponent combo strength */
    expectedComboLength: number;
    /** Character's combo susceptibility tier (1=very low, 5=extreme combo food) */
    comboSusceptibility: 1 | 2 | 3 | 4 | 5;
    /** Character-specific expected death percent range */
    expectedDeathPercentRange: { low: number; high: number };
    /** Opponent's combo game strength multiplier (>1 = strong combos) */
    opponentComboStrength: number;
  };
  /** Character-specific signature stats. Null for unsupported characters. */
  signatureStats: CharacterSignatureStats | null;
}

export interface KenComboStats {
  /** FAIR → FAIR → DAIR finishers where the final DAIR takes the stock. */
  total: number;
  /** Each individual Ken combo with details */
  combos: {
    moves: string[];
    totalDamage: number;
    startPercent: number;
  }[];
}

export interface TurnipPullStats {
  totalPulls: number;
  /** Breakdown by face type */
  faces: { face: string; count: number }[];
  /** Pulls that resulted in hitting the opponent */
  turnipsHit: number;
  /** Hit rate for thrown turnips */
  hitRate: number;
  /** Rare item pulls (beam sword, bob-omb, mr. saturn) */
  rareItems: { item: string; count: number }[];
}

// ── Character signature stats (discriminated union) ───────────────────

export type CharacterSignatureStats =
  | FoxSignatureStats
  | FalcoSignatureStats
  | SheikSignatureStats
  | FalconSignatureStats
  | PuffSignatureStats
  | IcClimbersSignatureStats
  | MarthSignatureStats
  | PeachSignatureStats
  | SamusSignatureStats
  | PikachuSignatureStats
  | LuigiSignatureStats
  | MarioSignatureStats
  | DocSignatureStats
  | YoshiSignatureStats
  | GanonSignatureStats
  | LinkSignatureStats
  | YLinkSignatureStats
  | ZeldaSignatureStats
  | RoySignatureStats
  | MewtwoSignatureStats
  | GnwSignatureStats
  | NessSignatureStats
  | BowserSignatureStats
  | KirbySignatureStats
  | DkSignatureStats
  | PichuSignatureStats;

export interface FoxSignatureStats {
  character: "Fox";
  /** Conversions where shine (down b) connected 2+ times; no multishine input is verified */
  multiShineCombos: number;
  /** Conversions with shine immediately followed by usmash (21 → 11); the wavedash is not verified */
  waveshineToUpsmash: number;
  /** Conversions with uthrow (55) followed by uair (16) */
  upthrowUpairs: number;
  /** Same, and the uair took the stock */
  upthrowUpairKills: number;
  /** Conversions with dair (17) → shine (21) adjacent */
  drillShines: number;
  /** Shine was the final hit, landed with the victim offstage, and the death was not off the top */
  shineSpikeKills: number;
  /** Lasers fired (item spawns of Fox's laser, type 54) */
  laserCount: number;
}

export interface FalcoSignatureStats {
  character: "Falco";
  /** Conversions containing dair → shine → dair pattern */
  pillarCombos: number;
  /** Pillar combos that killed */
  pillarKills: number;
  /** Conversions with shine immediately followed by a pummel or throw (the grab that connected) */
  shineGrabs: number;
  /** Lasers fired (item spawns of Falco's laser, type 55) */
  laserCount: number;
}

export interface SheikSignatureStats {
  character: "Sheik";
  /** Conversions with a dthrow/fthrow, 3+ hits, and the victim in a down/tech state inside the window */
  techChases: number;
  /** Tech chases that killed */
  techChaseKills: number;
  /** Count of neutral b (needle) hits from conversions */
  needleHits: number;
  /** Conversions with 3+ consecutive fairs */
  fairChains: number;
}

export interface FalconSignatureStats {
  character: "Falcon";
  /** Conversions ending with fair (knee) that killed */
  kneeKills: number;
  /** Conversions with dair immediately followed by fair (stomp → knee) */
  stompKnees: number;
  /** Conversions containing uthrow whose final hit was a fair that killed */
  upthrowKnees: number;
  /** Grabs that connected within 20 frames of the opponent being in a down/tech state */
  techChaseGrabs: number;
  /** Entries into the third jab (ATTACK_JAB3) — the gentleman */
  gentlemanCount: number;
}

export interface PuffSignatureStats {
  character: "Puff";
  /** Conversions whose final hit was rest (down b) and that killed */
  restKills: number;
  /** Conversions in which rest connected */
  restAttempts: number;
  /** Conversions with 3+ consecutive bairs */
  bairStrings: number;
  /** Max consecutive bairs in any conversion */
  longestBairString: number;
  /** What move preceded rest in each conversion, sorted by frequency */
  restSetups: { move: string; count: number }[];
}

export interface IcClimbersSignatureStats {
  character: "ICs";
  /** Conversions with 8+ pummel records (moveId 52) — extended grab / wobble proxy */
  wobbles: number;
  /** Wobbles that killed */
  wobbleKills: number;
  /** Count of independent Nana actions (frame data detection) */
  desyncs: number;
  /** Kill conversions where Nana was dead */
  sopoKills: number;
  /** Times Nana lost a stock */
  nanaDeaths: number;
}

export interface MarthSignatureStats {
  character: "Marth";
  /** Reused from existing Ken combo detection */
  kenCombos: number;
  /** Conversions with 2+ throws (ids 53-56; pummels excluded) */
  chainGrabs: number;
  /** Conversions ending with fsmash that killed (tipper vs sourspot is not distinguished) */
  fsmashKills: number;
}

export interface PeachSignatureStats {
  character: "Peach";
  /** Reused from existing turnip pull tracking */
  turnipPulls: number;
  /** Turnips that hit the opponent */
  turnipHits: number;
  /** Stitch face turnip pulls */
  stitchFaces: number;
  /** Conversions ending with dsmash that killed */
  dsmashKills: number;
  /** Aerials started while floating (entries into action states 344-348) */
  floatAerials: number;
  /** Float aerials that landed mid-animation (344-348 → Landing 42): float cancels */
  floatCancelAerials: number;
}

export interface SamusSignatureStats {
  character: "Samus";
  chargeShotKills: number;
  /** Missile (side b) hits that connected */
  missileCount: number;
  upBKills: number;
  dairKills: number;
}

export interface PikachuSignatureStats {
  character: "Pikachu";
  thunderKills: number;
  upSmashKills: number;
  upairChains: number;
  nairCombos: number;
}

export interface LuigiSignatureStats {
  character: "Luigi";
  shoryukenKills: number;
  dairKills: number;
  downSmashKills: number;
  fireBallCount: number;
}

export interface MarioSignatureStats {
  character: "Mario";
  /** Cape (side b) hits that connected */
  capeCount: number;
  /** Fireball (neutral b) hits that connected */
  fireBallCount: number;
  fsmashKills: number;
  upSmashKills: number;
  /** Fair kills that landed offstage and sent the victim off the bottom */
  fairSpikeKills: number;
}

export interface DocSignatureStats {
  character: "Doc";
  /** Pill (neutral b) hits that connected */
  pillCount: number;
  fsmashKills: number;
  upBKills: number;
  dairKills: number;
  /** Fair kills (Doc's fair is not a meteor smash, so no spike claim is made) */
  fairKills: number;
}

export interface YoshiSignatureStats {
  character: "Yoshi";
  eggThrowCount: number;
  dairKills: number;
  upSmashKills: number;
  fairSpikeKills: number;
}

export interface GanonSignatureStats {
  character: "Ganon";
  stompKills: number;
  sideBKills: number;
  upTiltKills: number;
  fairKills: number;
}

export interface LinkSignatureStats {
  character: "Link";
  boomerangCount: number;
  bombCount: number;
  dairSpikeKills: number;
  upSmashKills: number;
  grabCombos: number;
}

export interface YLinkSignatureStats {
  character: "YLink";
  fireArrowCount: number;
  bombCount: number;
  dairSpikeKills: number;
  nairCombos: number;
}

export interface ZeldaSignatureStats {
  character: "Zelda";
  lightningKickKills: number;
  dinsFireCount: number;
  upBKills: number;
}

export interface RoySignatureStats {
  character: "Roy";
  fsmashKills: number;
  blazerKills: number;
  counterCount: number;
  chainGrabs: number;
  dtiltConversions: number;
}

export interface MewtwoSignatureStats {
  character: "Mewtwo";
  shadowBallCount: number;
  confusionCount: number;
  upThrowKills: number;
  fairKills: number;
}

export interface GnwSignatureStats {
  character: "G&W";
  judgementCount: number;
  judgementKills: number;
  upAirKills: number;
  baconCount: number;
}

export interface NessSignatureStats {
  character: "Ness";
  pkFireCount: number;
  backThrowKills: number;
  dairKills: number;
  fairKills: number;
}

export interface BowserSignatureStats {
  character: "Bowser";
  flameCount: number;
  koopaClaw: number;
  upBKills: number;
  fsmashKills: number;
}

export interface KirbySignatureStats {
  character: "Kirby";
  inhaleCount: number;
  upTiltKills: number;
  fsmashKills: number;
  dairCombos: number;
  stoneKills: number;
}

export interface DkSignatureStats {
  character: "DK";
  giantPunchKills: number;
  headbuttCount: number;
  spikeKills: number;
  bairKills: number;
}

export interface PichuSignatureStats {
  character: "Pichu";
  thunderJoltCount: number;
  thunderKills: number;
  upSmashKills: number;
  nairCombos: number;
}

export interface GameSummary {
  gameNumber: number;
  stage: string;
  duration: number;
  result: {
    winner: string;
    endMethod: string;
    finalStocks: [number, number];
    finalPercents: [number, number];
  };
  players: [PlayerSummary, PlayerSummary];
}

export interface HabitProfile {
  options: { action: string; frequency: number }[];
  entropy: number;
}

export interface DerivedInsights {
  afterKnockdown: HabitProfile;
  afterLedgeGrab: HabitProfile;
  afterShieldPressure: HabitProfile;
  performanceByStock: {
    stock: number;
    neutralWinRate: number;
    damageEfficiency: number;
  }[];
  bestConversion: {
    endedInKill: boolean;
    moves: string[];
    totalDamage: number;
    startPercent: number;
    /** Game timestamp like "1:23" for cross-referencing with replay */
    timestamp: string;
  };
  worstMissedPunish: {
    opener: string;
    damageDealt: number;
    opponentPercent: number;
    timestamp: string;
  } | null;
  /** Chronological timeline of key moments for timestamp-backed coaching */
  keyMoments: {
    timestamp: string;
    frame: number;
    type: "kill" | "death" | "big_punish" | "missed_punish" | "edgeguard_kill" | "recovery";
    description: string;
  }[];
  adaptationSignals: {
    metric: string;
    game1Value: number;
    lastGameValue: number;
    direction: "improving" | "declining" | "stable";
    /** Per-game values across the set for full trajectory analysis */
    trajectory?: number[];
  }[];
}

export type GameResult = {
  gameSummary: GameSummary;
  derivedInsights: [DerivedInsights, DerivedInsights];
  highlights: [GameHighlight[], GameHighlight[]];
  /** Per-instance event records (conversions, stocks, habit choices) — Phase 0 of decision-grading stats. */
  frameEvents: GameFrameEvents;
  startAt: string | null;
};

export type { GameHighlight } from "./highlights.js";
export type {
  GameFrameEvents,
  ConversionRecord,
  StockRecord,
  HabitInstance,
  HabitSituation,
  AttackInstance,
  NeutralSegment,
  PlayerSlot,
  DeathVerdict,
  ThrowDIRecord,
  RecoverySpan,
  ShieldBlockRecord,
  WhiffEvent,
} from "./frameEvents.js";

/** Historical player context for LLM coaching prompts */
export interface PlayerHistory {
  overallRecord: { wins: number; losses: number; totalGames: number };
  characterWinRates: { character: string; wins: number; losses: number; totalGames: number; winRate: number }[];
  topMatchups: { opponentCharacter: string; wins: number; losses: number; totalGames: number; winRate: number }[];
  recentStats: {
    avgNeutralWinRate: number;
    avgLCancelRate: number;
    avgConversionRate: number;
    avgOpeningsPerKill: number;
    avgDamagePerOpening: number;
    avgEdgeguardSuccessRate: number;
    gamesCount: number;
  } | null;
  overallStats: {
    avgNeutralWinRate: number;
    avgLCancelRate: number;
    avgConversionRate: number;
    avgOpeningsPerKill: number;
    avgDamagePerOpening: number;
    avgEdgeguardSuccessRate: number;
    gamesCount: number;
  } | null;
  currentStreak: { type: "win" | "loss"; count: number } | null;
}

/** Aggregate statistics across a filtered scope (e.g. all games against Fox) */
export interface AggregateStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgNeutralWinRate: number;
  avgConversionRate: number;
  avgLCancelRate: number;
  avgOpeningsPerKill: number;
  avgDamagePerOpening: number;
  avgDeathPercent: number;
  avgRecoverySuccessRate: number;
  avgEdgeguardSuccessRate: number;
  avgPowerShieldCount: number;
  avgShieldPressureSequences: number;
  avgShieldPressureDamage: number;
  avgShieldPokeRate: number;
  avgDISurvivalScore: number;
  avgDIComboScore: number;

  /** Frequency of characters played in this scope */
  characterDistribution: { character: string; count: number }[];
  /** Frequency of opponents played in this scope */
  opponentDistribution: { opponentTag: string; count: number }[];
  /** Frequency of stages played in this scope */
  stageDistribution: { stage: string; count: number }[];

  /** Character-specific signature stat averages (if filtered by character) */
  signatureAggregates: any | null;
}
