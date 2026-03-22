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
  /** Character-specific signature stats. Null for unsupported characters. */
  signatureStats: CharacterSignatureStats | null;
}

export interface KenComboStats {
  /** Total Ken combos landed (fair(s) → dair) */
  total: number;
  /** How many resulted in a kill */
  kills: number;
  /** Each individual Ken combo with details */
  combos: {
    moves: string[];
    totalDamage: number;
    startPercent: number;
    endedInKill: boolean;
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
  /** Conversions where shine (down b) appears 2+ times, indicating multi-shine combos */
  multiShineCombos: number;
  /** Conversions with shine → usmash (21 → 11) */
  waveshineToUpsmash: number;
  /** Conversions starting with uthrow (54) and containing uair (16) */
  upthrowUpairs: number;
  /** Same but the conversion killed */
  upthrowUpairKills: number;
  /** Conversions with dair (17) → shine (21) sequence */
  drillShines: number;
  /** Conversions ending in shine that killed while opponent was offstage */
  shineSpikeKills: number;
}

export interface FalcoSignatureStats {
  character: "Falco";
  /** Conversions containing dair → shine → dair pattern */
  pillarCombos: number;
  /** Pillar combos that killed */
  pillarKills: number;
  /** Conversions with shine → grab sequence */
  shineGrabs: number;
  /** Count of neutral b (laser) usage from move data */
  laserCount: number;
}

export interface SheikSignatureStats {
  character: "Sheik";
  /** Conversions with 3+ moves starting from a throw (dthrow or fthrow) */
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
  /** Conversions with dair → fair (stomp to knee) */
  stompKnees: number;
  /** Conversions with uthrow → ... → fair that killed */
  upthrowKnees: number;
  /** Conversions starting with grab where opponent was in tech/down state */
  techChaseGrabs: number;
  /** Jab1 → jab2 → jab3 without transitioning to rapid jab */
  gentlemanCount: number;
}

export interface PuffSignatureStats {
  character: "Puff";
  /** Conversions ending with down b (rest) that killed */
  restKills: number;
  /** Conversions containing down b (rest) total */
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
  /** Conversions with 8+ pummel hits (moveId 51) — wobble detection */
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
  /** Ken combos that killed */
  kenComboKills: number;
  /** Conversions with 2+ throws (chain grabs) */
  chainGrabs: number;
  /** Conversions ending with fsmash that killed */
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
  /** Float cancel aerials — detected via heuristic (short airborne state after float) */
  floatCancelAerials: number;
}

export interface SamusSignatureStats {
  character: "Samus";
  chargeShotKills: number;
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
  capeCount: number;
  fireBallCount: number;
  fsmashKills: number;
  upSmashKills: number;
  fairSpikeKills: number;
}

export interface DocSignatureStats {
  character: "Doc";
  pillCount: number;
  fsmashKills: number;
  upBKills: number;
  dairKills: number;
  fairSpikeKills: number;
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
    moves: string[];
    totalDamage: number;
    startPercent: number;
    endedInKill: boolean;
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
  startAt: string | null;
};

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
