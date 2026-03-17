import {
  SlippiGame,
  characters as characterUtils,
  stages as stageUtils,
  moves as moveUtils,
  State,
  Frames,
  type FramesType,
  type StatsType,
  type GameStartType,
  type GameEndType,
  type MetadataType,
  type OverallType,
  type ConversionType,
  type StockType,
  type ActionCountsType,
  type PlayerType,
  GameEndMethod,
} from "@slippi/slippi-js/node";

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
  }[];
  /** Peach only — turnip/item pull breakdown. Null for non-Peach characters. */
  turnipPulls: TurnipPullStats | null;
  /** Marth only — Ken combo detection. Null for non-Marth characters. */
  kenCombos: KenComboStats | null;
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
  | PeachSignatureStats;

export interface FoxSignatureStats {
  character: "Fox";
  /** Conversions where shine (down b) appears 2+ times, indicating waveshine combos */
  waveshines: number;
  /** Conversions with shine → usmash (21 → 11) */
  waveshineToUpsmash: number;
  /** Conversions starting with uthrow (54) and containing uair (16) */
  upthrowUpairs: number;
  /** Same but the conversion killed */
  upthrowUpairKills: number;
  /** Conversions with dair (17) → shine (21) sequence */
  drillShines: number;
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
  character: "Captain Falcon";
  /** Conversions ending with fair (knee) that killed */
  kneeKills: number;
  /** Conversions with dair → fair (stomp to knee) */
  stompKnees: number;
  /** Conversions with uthrow → ... → fair that killed */
  upthrowKnees: number;
  /** Conversions starting with grab and containing 3+ moves */
  techChaseGrabs: number;
}

export interface PuffSignatureStats {
  character: "Jigglypuff";
  /** Conversions ending with down b (rest) that killed */
  restKills: number;
  /** Conversions containing down b (rest) total */
  restAttempts: number;
  /** Conversions with 3+ consecutive bairs */
  bairStrings: number;
  /** Max consecutive bairs in any conversion */
  longestBairString: number;
}

export interface IcClimbersSignatureStats {
  character: "Ice Climbers";
  /** Conversions with 8+ pummel hits (moveId 51) — wobble detection */
  wobbles: number;
  /** Wobbles that killed */
  wobbleKills: number;
  /** Desync count — not detectable from conversion data, always 0 */
  desyncs: number;
}

export interface MarthSignatureStats {
  character: "Marth";
  /** Reused from existing Ken combo detection */
  kenCombos: number;
  /** Ken combos that killed */
  kenComboKills: number;
  /** Conversions with 2+ throws (chain grabs) */
  chainGrabs: number;
  /** Conversions ending with fsmash that killed (proxy for tipper — can't distinguish tipper/sourspot from replay data) */
  tipperKills: number;
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
  /** Float cancel aerials — not detectable precisely, always 0 */
  floatCancelAerials: number;
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
  };
  worstMissedPunish: {
    opener: string;
    damageDealt: number;
    opponentPercent: number;
  } | null;
  adaptationSignals: {
    metric: string;
    game1Value: number;
    lastGameValue: number;
    direction: "improving" | "declining" | "stable";
  }[];
}

// ── Helpers ───────────────────────────────────────────────────────────

const FPS = 60;

function framesToSeconds(frames: number): number {
  return Math.round((frames / FPS) * 100) / 100;
}

function getPlayerTag(player: PlayerType): string {
  return (
    player.displayName ||
    player.nametag ||
    player.connectCode ||
    `P${player.port}`
  );
}

function getCharacterName(id: number | undefined): string {
  if (id == null) return "Unknown";
  return characterUtils.getCharacterShortName(id);
}

function getMoveName(id: number): string {
  return moveUtils.getMoveShortName(id);
}

function ratio(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 10000) / 10000;
}

/** Shannon entropy normalized to [0,1] for a frequency distribution */
function entropy(options: { frequency: number }[]): number {
  const total = options.reduce((s, o) => s + o.frequency, 0);
  if (total === 0) return 0;
  const n = options.length;
  if (n <= 1) return 0;
  let h = 0;
  for (const o of options) {
    if (o.frequency === 0) continue;
    const p = o.frequency / total;
    h -= p * Math.log2(p);
  }
  return Math.round((h / Math.log2(n)) * 10000) / 10000;
}

function endMethodString(
  gameEnd: GameEndType | undefined,
): string {
  if (!gameEnd) return "unknown";
  switch (gameEnd.gameEndMethod) {
    case GameEndMethod.TIME:
      return "timeout";
    case GameEndMethod.NO_CONTEST:
      return "LRAS";
    case GameEndMethod.GAME:
    case GameEndMethod.RESOLVED:
      return "stocks";
    default:
      return "unknown";
  }
}

// ── Action state classification ───────────────────────────────────────

function isAirborne(actionState: number): boolean {
  // Aerial states, falling, jumping, air dodge
  return (
    (actionState >= State.CONTROLLED_JUMP_START &&
      actionState <= State.CONTROLLED_JUMP_END) ||
    (actionState >= State.FALL && actionState <= State.FALL_BACKWARD) ||
    actionState === State.DAMAGE_FALL ||
    actionState === State.AIR_DODGE ||
    (actionState >= State.AERIAL_ATTACK_START &&
      actionState <= State.AERIAL_DAIR) ||
    actionState === State.LANDING_FALL_SPECIAL
  );
}

function isOnLedge(actionState: number): boolean {
  return actionState === State.CLIFF_CATCH || actionState === 253; // CLIFF_WAIT
}

function isOnPlatform(posY: number): boolean {
  // Platforms are above stage level (y=0). Anything significantly above ground.
  return posY > 5;
}

function isOffstage(
  posX: number,
  posY: number,
  stageId: number,
): boolean {
  // Approximate stage boundaries for legal stages
  const bounds = stageBounds(stageId);
  return (
    Math.abs(posX) > bounds.x || posY < bounds.yMin
  );
}

function stageBounds(stageId: number): {
  x: number;
  yMin: number;
} {
  // Approximate blast zone / ledge boundaries for common stages
  const map: Record<number, { x: number; yMin: number }> = {
    2: { x: 63, yMin: -10 }, // Fountain of Dreams
    3: { x: 88, yMin: -10 }, // Pokemon Stadium
    8: { x: 56, yMin: -10 }, // Yoshi's Story
    28: { x: 68, yMin: -10 }, // Dreamland
    31: { x: 86, yMin: -10 }, // Battlefield
    32: { x: 86, yMin: -10 }, // Final Destination
  };
  return map[stageId] ?? { x: 80, yMin: -10 };
}

// Detect "knockdown" — player is in a downed/missed-tech state
function isKnockdown(actionState: number): boolean {
  return (
    actionState >= State.DOWN_START && actionState <= State.DOWN_END
  );
}

// Detect ledge grab
function isLedgeGrab(actionState: number): boolean {
  return actionState === State.CLIFF_CATCH;
}

// Detect shield (guarding)
function isShielding(actionState: number): boolean {
  return (
    actionState >= State.GUARD_START && actionState <= State.GUARD_END
  );
}

function isDashDancing(actionState: number): boolean {
  return actionState === State.DASH || actionState === State.TURN;
}

// Move ID → human name mapping (slippi-js uses numeric move IDs in conversions)
const moveIdToName: Record<number, string> = {
  1: "misc",
  2: "jab",
  3: "jab",
  4: "jab",
  5: "rapid jab",
  6: "dash attack",
  7: "ftilt",
  8: "utilt",
  9: "dtilt",
  10: "fsmash",
  11: "usmash",
  12: "dsmash",
  13: "nair",
  14: "fair",
  15: "bair",
  16: "uair",
  17: "dair",
  18: "neutral b",
  19: "side b",
  20: "up b",
  21: "down b",
  50: "grab",
  51: "pummel",
  52: "fthrow",
  53: "bthrow",
  54: "uthrow",
  55: "dthrow",
};

// ── Core pipeline ─────────────────────────────────────────────────────

function buildPlayerSummary(
  playerIndex: number,
  player: PlayerType,
  overall: OverallType,
  actionCounts: ActionCountsType,
  conversions: ConversionType[],
  playerStocks: StockType[],
  allConversions: ConversionType[],
  frames: FramesType,
  lastFrame: number,
  stageId: number,
): PlayerSummary {
  const tag = getPlayerTag(player);
  const connectCode = player.connectCode || "";
  const character = getCharacterName(player.characterId);

  // Neutral
  const neutralWins = overall.neutralWinRatio.count;
  const neutralTotal = overall.neutralWinRatio.total;
  const neutralLosses = neutralTotal - neutralWins;
  const counterHits = overall.counterHitRatio.count;
  const neutralWinRate = ratio(neutralWins, neutralTotal);

  // Openings & conversions
  // NOTE: conversion.playerIndex = the VICTIM. So "my conversions" (attacks I landed)
  // are conversions where the opponent is the victim (playerIndex !== me).
  const openingsPerKill = overall.openingsPerKill.ratio ?? 0;
  const totalOpenings = overall.openingsPerKill.count; // openings I created
  const myConversions = conversions.filter(
    (c) => c.playerIndex !== playerIndex,
  );
  const totalConversions = overall.successfulConversions.count;
  const conversionRate = ratio(
    totalConversions,
    overall.successfulConversions.total,
  );
  const averageDamagePerOpening = overall.damagePerOpening.ratio ?? 0;
  const killConversions = myConversions.filter((c) => c.didKill).length;

  // Movement & positioning from frames
  let totalX = 0;
  let platformFrames = 0;
  let airFrames = 0;
  let ledgeFrames = 0;
  let dashDanceFrameCount = 0;
  let playableFrames = 0;

  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const frame = frames[f];
    if (!frame) continue;
    const pd = frame.players[playerIndex]?.post;
    if (!pd) continue;
    if (pd.stocksRemaining != null && pd.stocksRemaining <= 0) continue;

    playableFrames++;
    const posX = pd.positionX ?? 0;
    const posY = pd.positionY ?? 0;
    const actionState = pd.actionStateId ?? 0;

    totalX += posX;
    const airborne = pd.isAirborne === true || isAirborne(actionState);
    const onLedge = isOnLedge(actionState);
    // Platform = elevated position but NOT airborne (standing on platform, not jumping above it)
    if (isOnPlatform(posY) && !airborne && !onLedge) platformFrames++;
    if (airborne) airFrames++;
    if (onLedge) ledgeFrames++;
    if (isDashDancing(actionState)) dashDanceFrameCount++;
  }

  const avgX = playableFrames > 0 ? totalX / playableFrames : 0;
  // Normalize to roughly -1..1 (divide by typical stage half-width)
  const bounds = stageBounds(stageId);
  const normalizedX =
    Math.round((avgX / bounds.x) * 10000) / 10000;

  // Defense & recovery
  const totalDamageTaken = playerStocks.reduce((sum, s) => {
    const end = s.endPercent ?? s.currentPercent;
    return sum + (end - s.startPercent);
  }, 0);

  // Detect deaths — deathAnimation can be 0 for real deaths, so also check
  // kill conversions that end on the same frame as the stock
  const deaths = playerStocks.filter(
    (s) =>
      (s.deathAnimation != null && s.deathAnimation !== 0) ||
      (s.endFrame != null &&
        allConversions.some(
          (c) =>
            c.playerIndex === playerIndex &&
            c.didKill &&
            c.endFrame != null &&
            Math.abs((c.endFrame ?? 0) - (s.endFrame ?? 0)) < 10,
        )),
  );
  const avgDeathPercent =
    deaths.length > 0
      ? Math.round(
          deaths.reduce((s, st) => s + (st.endPercent ?? st.currentPercent), 0) /
            deaths.length,
        )
      : 0;

  // Recovery: count times player was knocked into a recovery situation.
  // Only count when player is below stage level OR far past the edge AND
  // in hitstun/tumble/freefall (not just voluntarily jumping near ledge).
  let recoveryAttempts = 0;
  let recoverySuccesses = 0;
  let inRecovery = false;

  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const frame = frames[f];
    if (!frame) continue;
    const pd = frame.players[playerIndex]?.post;
    if (!pd) continue;
    if (pd.stocksRemaining != null && pd.stocksRemaining <= 0) continue;

    const posX = pd.positionX ?? 0;
    const posY = pd.positionY ?? 0;
    const actionState = pd.actionStateId ?? 0;
    const bounds = stageBounds(stageId);

    // Below stage level = clearly needs to recover
    const belowStage = posY < bounds.yMin;
    // Far past edge in a vulnerable state (tumble, damage, freefall)
    const farOffstage = Math.abs(posX) > bounds.x + 20;
    const inVulnerableState =
      actionState === State.DAMAGE_FALL ||
      (actionState >= State.DAMAGE_START && actionState <= State.DAMAGE_END) ||
      actionState === State.LANDING_FALL_SPECIAL; // freefall after up-b

    const needsRecovery = belowStage || (farOffstage && inVulnerableState);
    const onStage = !isOffstage(posX, posY, stageId);

    if (needsRecovery && !inRecovery) {
      recoveryAttempts++;
      inRecovery = true;
    } else if (onStage && inRecovery) {
      recoverySuccesses++;
      inRecovery = false;
    }
  }

  const recoverySuccessRate = ratio(recoverySuccesses, recoveryAttempts);

  // L-cancel rate
  const lTotal =
    actionCounts.lCancelCount.success + actionCounts.lCancelCount.fail;
  const lCancelRate = ratio(actionCounts.lCancelCount.success, lTotal);

  // Move usage — build from attack counts + conversion move data
  const moveMap = new Map<
    number,
    { count: number; hits: number }
  >();

  // Count from action counts (attacks thrown out)
  // Names must match moveIdToName so hit counting from conversions lines up
  const atk = actionCounts.attackCount;
  const attackEntries: [string, number][] = [
    ["jab", atk.jab1 + atk.jab2 + atk.jab3],
    ["rapid jab", atk.jabm],
    ["dash attack", atk.dash],
    ["ftilt", atk.ftilt],
    ["utilt", atk.utilt],
    ["dtilt", atk.dtilt],
    ["fsmash", atk.fsmash],
    ["usmash", atk.usmash],
    ["dsmash", atk.dsmash],
    ["nair", atk.nair],
    ["fair", atk.fair],
    ["bair", atk.bair],
    ["uair", atk.uair],
    ["dair", atk.dair],
  ];

  // Count total uses per move name from attackCount
  const moveUsageMap = new Map<string, { count: number; hits: number }>();

  for (const [name, count] of attackEntries) {
    if (count === 0) continue;
    const existing = moveUsageMap.get(name) ?? { count: 0, hits: 0 };
    existing.count += count;
    moveUsageMap.set(name, existing);
  }

  // Add grabs
  const totalGrabs =
    actionCounts.grabCount.success + actionCounts.grabCount.fail;
  if (totalGrabs > 0) {
    moveUsageMap.set("grab", {
      count: totalGrabs,
      hits: actionCounts.grabCount.success,
    });
  }

  // Count hits from conversions to compute hit rates
  // myConversions has conversions where opponent is victim; moves inside are by this player
  for (const conv of myConversions) {
    for (const move of conv.moves) {
      const name = moveIdToName[move.moveId] ?? getMoveName(move.moveId);
      const existing = moveUsageMap.get(name);
      if (existing) {
        existing.hits += move.hitCount;
      }
    }
  }

  // For moves where we don't have separate "thrown out" vs "connected" data,
  // estimate hit rate from conversion data
  const moveUsage = [...moveUsageMap.entries()]
    .map(([move, data]) => ({
      move,
      count: data.count,
      hitRate: data.count > 0 ? Math.min(1, ratio(data.hits, data.count)) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Stock-by-stock breakdown
  // conversion.playerIndex = victim. For this player's stocks:
  // - killMove: conversion where THIS player is victim (c.playerIndex === playerIndex)
  // - openingsGiven: conversions where THIS player is victim
  // - damageDealt: conversions where OPPONENT is victim (myConversions)
  const stockBreakdown = playerStocks.map((stock, i) => {
    const stockNum = stock.count;

    // Find what killed this player — conversion where THIS player is the victim
    // Do this first to help determine if the stock ended in death
    let killingConversion: ConversionType | undefined;
    if (stock.endFrame != null) {
      killingConversion = allConversions.find(
        (c) =>
          c.playerIndex === playerIndex &&
          c.didKill &&
          c.endFrame != null &&
          Math.abs((c.endFrame ?? 0) - (stock.endFrame ?? 0)) < 10,
      );
    }

    // Detect death: deathAnimation is sometimes 0 even for real deaths
    const died =
      (stock.deathAnimation != null && stock.deathAnimation !== 0) ||
      killingConversion != null;
    const percentLost = died
      ? (stock.endPercent ?? stock.currentPercent)
      : stock.currentPercent;

    let killMove: string | null = null;
    if (died) {
      if (killingConversion && killingConversion.moves.length > 0) {
        const lastMove =
          killingConversion.moves[killingConversion.moves.length - 1]!;
        killMove =
          moveIdToName[lastMove.moveId] ?? getMoveName(lastMove.moveId);
      }
    }

    // Duration
    const startF = stock.startFrame;
    const endF = stock.endFrame ?? lastFrame;
    const duration = framesToSeconds(endF - startF);

    // Openings given = conversions where THIS player is victim during this stock
    const openingsGiven = allConversions.filter(
      (c) =>
        c.playerIndex === playerIndex &&
        c.startFrame >= startF &&
        c.startFrame <= endF,
    ).length;

    // Damage dealt = conversions where OPPONENT is victim during this stock
    const damageDealt = myConversions
      .filter(
        (c) => c.startFrame >= startF && c.startFrame <= endF,
      )
      .reduce(
        (sum, c) => sum + ((c.endPercent ?? c.currentPercent) - c.startPercent),
        0,
      );

    return {
      stockNumber: stockNum,
      percentLost: Math.round(percentLost),
      killMove,
      duration,
      openingsGiven,
      damageDealt: Math.round(damageDealt),
    };
  });

  // ── Peach turnip pull tracking ────────────────────────────────────
  const PEACH_CHARACTER_ID = 12;
  // Melee item typeIds (from slippi replay data):
  //   99 = Peach's Turnip/Vegetable
  //   103 = Mr. Saturn (Peach pull rare)
  //   104 = Bob-omb (Peach pull rare)
  //   55  = Beam Sword (Peach pull rare, also fsmash items)
  const TURNIP_TYPE_ID = 99;
  const PEACH_RARE_ITEMS: Record<number, string> = {
    103: "Mr. Saturn",
    104: "Bob-omb",
    55: "Beam Sword",
  };
  const TURNIP_FACE_NAMES: Record<number, string> = {
    0: "neutral",
    1: "smile",
    2: "wink",
    3: "surprised",
    4: "happy",
    5: "circle eyes",
    6: "carrot eyes",
    7: "stitch face",
  };

  let turnipPulls: TurnipPullStats | null = null;

  if (player.characterId === PEACH_CHARACTER_ID) {
    const seenSpawnIds = new Set<number>();
    const faceCounts = new Map<number, number>();
    const rareItemCounts = new Map<string, number>();
    let totalPulls = 0;
    let turnipsHit = 0;

    for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
      const items = frames[f]?.items;
      if (!items) continue;

      for (const item of items) {
        if (item.owner !== playerIndex) continue;
        const spawnId = item.spawnId;
        if (spawnId == null || seenSpawnIds.has(spawnId)) continue;
        seenSpawnIds.add(spawnId);

        const typeId = item.typeId ?? -1;

        if (typeId === TURNIP_TYPE_ID) {
          totalPulls++;
          const face = item.turnipFace ?? 0;
          faceCounts.set(face, (faceCounts.get(face) ?? 0) + 1);
        } else if (PEACH_RARE_ITEMS[typeId]) {
          totalPulls++;
          const name = PEACH_RARE_ITEMS[typeId]!;
          rareItemCounts.set(name, (rareItemCounts.get(name) ?? 0) + 1);
        }
      }
    }

    // Detect turnip hits from conversion data.
    // In Melee, item throw hits register as moveId 1 ("misc") in slippi-js.
    // Count conversion moves with moveId 1 where Peach is the attacker.
    // (conversions where opponent is victim = playerIndex !== this player)
    const ITEM_THROW_MOVE_ID = 1;
    for (const conv of myConversions) {
      for (const move of conv.moves) {
        if (move.moveId === ITEM_THROW_MOVE_ID) {
          turnipsHit++;
        }
      }
    }

    if (totalPulls > 0) {
      const faces = [...faceCounts.entries()]
        .map(([face, count]) => ({ face: TURNIP_FACE_NAMES[face] ?? `face ${face}`, count }))
        .sort((a, b) => b.count - a.count);

      const rareItems = [...rareItemCounts.entries()]
        .map(([item, count]) => ({ item, count }))
        .sort((a, b) => b.count - a.count);

      // Hit rate: item throw hits / total turnip pulls (not counting rare items)
      const turnipCount = [...faceCounts.values()].reduce((a, b) => a + b, 0);

      turnipPulls = {
        totalPulls,
        faces,
        turnipsHit,
        hitRate: turnipCount > 0 ? ratio(turnipsHit, turnipCount) : 0,
        rareItems,
      };
    }
  }

  return {
    tag,
    connectCode,
    character,
    neutralWins,
    neutralLosses,
    counterHits,
    neutralWinRate,
    openingsPerKill: Math.round(openingsPerKill * 100) / 100,
    totalOpenings,
    totalConversions,
    conversionRate,
    averageDamagePerOpening: Math.round(averageDamagePerOpening * 100) / 100,
    killConversions,
    avgStagePosition: { x: normalizedX },
    timeOnPlatform: ratio(platformFrames, playableFrames),
    timeInAir: ratio(airFrames, playableFrames),
    timeAtLedge: ratio(ledgeFrames, playableFrames),
    totalDamageTaken: Math.round(totalDamageTaken),
    avgDeathPercent,
    recoveryAttempts,
    recoverySuccessRate,
    lCancelRate,
    wavedashCount: actionCounts.wavedashCount,
    dashDanceFrames: dashDanceFrameCount,
    moveUsage,
    stocks: stockBreakdown,
    turnipPulls,
    kenCombos: detectKenCombos(player.characterId, myConversions),
    signatureStats: detectSignatureStats(
      character,
      myConversions,
      moveUsageMap,
      turnipPulls,
      detectKenCombos(player.characterId, myConversions),
    ),
  };
}

// ── Ken combo detection (Marth only) ─────────────────────────────────

const MARTH_CHARACTER_ID = 9;
const FAIR_MOVE_ID = 14;
const DAIR_MOVE_ID = 17;

function detectKenCombos(
  characterId: number | undefined,
  myConversions: ConversionType[],
): KenComboStats | null {
  if (characterId !== MARTH_CHARACTER_ID) return null;

  const combos: KenComboStats["combos"] = [];

  for (const conv of myConversions) {
    if (conv.moves.length < 2) continue;

    const moveIds = conv.moves.map((m) => m.moveId);
    const hasFair = moveIds.includes(FAIR_MOVE_ID);
    const lastMoveId = moveIds[moveIds.length - 1];

    // Ken combo: at least one fair, ending with dair
    if (hasFair && lastMoveId === DAIR_MOVE_ID) {
      const moveNames = conv.moves.map(
        (m) => moveIdToName[m.moveId] ?? getMoveName(m.moveId),
      );
      const totalDamage = Math.round(
        (conv.endPercent ?? conv.currentPercent) - conv.startPercent,
      );

      combos.push({
        moves: moveNames,
        totalDamage,
        startPercent: Math.round(conv.startPercent),
        endedInKill: conv.didKill,
      });
    }
  }

  if (combos.length === 0) return null;

  return {
    total: combos.length,
    kills: combos.filter((c) => c.endedInKill).length,
    combos,
  };
}

// ── Character signature stat detection ────────────────────────────────
// NOTE: Many of these stats are approximations based on conversion move
// sequences. For example, "tipperKills" counts fsmash kills as a proxy
// since replay data doesn't distinguish tipper vs sourspot hits.

/** Check if a conversion's move sequence contains moveId a followed by moveId b (not necessarily adjacent) */
function hasSequence(moves: ConversionType["moves"], a: number, b: number): boolean {
  const idxA = moves.findIndex((m) => m.moveId === a);
  if (idxA === -1) return false;
  return moves.slice(idxA + 1).some((m) => m.moveId === b);
}

/** Check if a conversion's move sequence contains moveId a immediately followed by moveId b */
function hasAdjacentSequence(moves: ConversionType["moves"], a: number, b: number): boolean {
  for (let i = 0; i < moves.length - 1; i++) {
    if (moves[i]!.moveId === a && moves[i + 1]!.moveId === b) return true;
  }
  return false;
}

/** Count max consecutive occurrences of a moveId in a conversion */
function maxConsecutive(moves: ConversionType["moves"], moveId: number): number {
  let max = 0;
  let cur = 0;
  for (const m of moves) {
    if (m.moveId === moveId) {
      cur++;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

/** Check if a conversion's move sequence contains the pattern a → b → c (adjacent) */
function hasTriplePattern(moves: ConversionType["moves"], a: number, b: number, c: number): boolean {
  for (let i = 0; i < moves.length - 2; i++) {
    if (moves[i]!.moveId === a && moves[i + 1]!.moveId === b && moves[i + 2]!.moveId === c) return true;
  }
  return false;
}

/** Count occurrences of a moveId in a conversion's moves */
function countMoveId(moves: ConversionType["moves"], moveId: number): number {
  return moves.filter((m) => m.moveId === moveId).length;
}

const MOVE_SHINE = 21;
const MOVE_USMASH = 11;
const MOVE_UTHROW = 54;
const MOVE_UAIR = 16;
const MOVE_DAIR = 17;
const MOVE_FAIR = 14;
const MOVE_BAIR = 15;
const MOVE_GRAB = 50;
const MOVE_PUMMEL = 51;
const MOVE_FTHROW = 52;
const MOVE_DTHROW = 55;
const MOVE_NEUTRAL_B = 18;
const MOVE_FSMASH = 10;
const MOVE_DSMASH = 12;

function detectSignatureStats(
  character: string,
  myConversions: ConversionType[],
  moveUsageMap: Map<string, { count: number; hits: number }>,
  turnipPullStats: TurnipPullStats | null,
  kenComboStats: KenComboStats | null,
): CharacterSignatureStats | null {
  switch (character) {
    case "Fox": {
      let waveshines = 0;
      let waveshineToUpsmash = 0;
      let upthrowUpairs = 0;
      let upthrowUpairKills = 0;
      let drillShines = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        // Waveshines: shine appears 2+ times in a conversion
        if (countMoveId(moves, MOVE_SHINE) >= 2) waveshines++;
        // Waveshine to upsmash: shine → usmash sequence
        if (hasSequence(moves, MOVE_SHINE, MOVE_USMASH)) waveshineToUpsmash++;
        // Upthrow → uair
        if (moves.length > 0 && moves[0]!.moveId === MOVE_UTHROW && moves.some((m) => m.moveId === MOVE_UAIR)) {
          upthrowUpairs++;
          if (conv.didKill) upthrowUpairKills++;
        }
        // Drill (dair) → shine
        if (hasAdjacentSequence(moves, MOVE_DAIR, MOVE_SHINE)) drillShines++;
      }

      return { character: "Fox", waveshines, waveshineToUpsmash, upthrowUpairs, upthrowUpairKills, drillShines };
    }

    case "Falco": {
      let pillarCombos = 0;
      let pillarKills = 0;
      let shineGrabs = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        // Pillar: dair → shine → dair
        if (hasTriplePattern(moves, MOVE_DAIR, MOVE_SHINE, MOVE_DAIR)) {
          pillarCombos++;
          if (conv.didKill) pillarKills++;
        }
        // Shine → grab
        if (hasAdjacentSequence(moves, MOVE_SHINE, MOVE_GRAB)) shineGrabs++;
      }

      const laserEntry = moveUsageMap.get("neutral b");
      const laserCount = laserEntry?.count ?? 0;

      return { character: "Falco", pillarCombos, pillarKills, shineGrabs, laserCount };
    }

    case "Sheik": {
      let techChases = 0;
      let techChaseKills = 0;
      let needleHits = 0;
      let fairChains = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        // Tech chase: starts from dthrow or fthrow, 3+ total moves
        if (moves.length >= 3 && (moves[0]!.moveId === MOVE_DTHROW || moves[0]!.moveId === MOVE_FTHROW)) {
          techChases++;
          if (conv.didKill) techChaseKills++;
        }
        // Needle hits
        needleHits += countMoveId(moves, MOVE_NEUTRAL_B);
        // Fair chains: 3+ consecutive fairs
        if (maxConsecutive(moves, MOVE_FAIR) >= 3) fairChains++;
      }

      return { character: "Sheik", techChases, techChaseKills, needleHits, fairChains };
    }

    case "Captain Falcon": {
      let kneeKills = 0;
      let stompKnees = 0;
      let upthrowKnees = 0;
      let techChaseGrabs = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;

        // Knee kills: conversion ending with fair that killed
        if (lastMove.moveId === MOVE_FAIR && conv.didKill) kneeKills++;
        // Stomp to knee: dair → fair
        if (hasSequence(moves, MOVE_DAIR, MOVE_FAIR)) stompKnees++;
        // Upthrow → knee kill: starts with uthrow, ends with fair kill
        if (moves[0]!.moveId === MOVE_UTHROW && lastMove.moveId === MOVE_FAIR && conv.didKill) upthrowKnees++;
        // Tech chase grabs: starts with grab, 3+ moves
        if (moves[0]!.moveId === MOVE_GRAB && moves.length >= 3) techChaseGrabs++;
      }

      return { character: "Captain Falcon", kneeKills, stompKnees, upthrowKnees, techChaseGrabs };
    }

    case "Jigglypuff": {
      let restKills = 0;
      let restAttempts = 0;
      let bairStrings = 0;
      let longestBairString = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;

        // Rest: down b in conversion
        if (moves.some((m) => m.moveId === MOVE_SHINE)) {
          // down b = 21 = MOVE_SHINE (same moveId)
          restAttempts++;
          if (lastMove.moveId === MOVE_SHINE && conv.didKill) restKills++;
        }
        // Bair strings
        const maxBairs = maxConsecutive(moves, MOVE_BAIR);
        if (maxBairs >= 3) bairStrings++;
        if (maxBairs > longestBairString) longestBairString = maxBairs;
      }

      return { character: "Jigglypuff", restKills, restAttempts, bairStrings, longestBairString };
    }

    case "Ice Climbers": {
      let wobbles = 0;
      let wobbleKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        // Wobble: 8+ pummels in a single conversion
        if (countMoveId(moves, MOVE_PUMMEL) >= 8) {
          wobbles++;
          if (conv.didKill) wobbleKills++;
        }
      }

      return { character: "Ice Climbers", wobbles, wobbleKills, desyncs: 0 };
    }

    case "Marth": {
      const kenCombos = kenComboStats?.total ?? 0;
      const kenComboKills = kenComboStats?.kills ?? 0;
      let chainGrabs = 0;
      let tipperKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;

        // Chain grabs: 2+ throws in one conversion
        const throwIds = [MOVE_FTHROW, MOVE_UTHROW, MOVE_DTHROW];
        const throwCount = moves.filter((m) => throwIds.includes(m.moveId)).length;
        if (throwCount >= 2) chainGrabs++;

        // Tipper kills: fsmash kill (approximate — can't distinguish tipper from sourspot)
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_FSMASH && conv.didKill) tipperKills++;
      }

      return { character: "Marth", kenCombos, kenComboKills, chainGrabs, tipperKills };
    }

    case "Peach": {
      let dsmashKills = 0;

      for (const conv of myConversions) {
        const { moves } = conv;
        if (moves.length === 0) continue;
        const lastMove = moves[moves.length - 1]!;
        if (lastMove.moveId === MOVE_DSMASH && conv.didKill) dsmashKills++;
      }

      const stitchFaces = turnipPullStats?.faces.find((f) => f.face === "stitch face")?.count ?? 0;

      return {
        character: "Peach",
        turnipPulls: turnipPullStats?.totalPulls ?? 0,
        turnipHits: turnipPullStats?.turnipsHit ?? 0,
        stitchFaces,
        dsmashKills,
        floatCancelAerials: 0,
      };
    }

    default:
      return null;
  }
}

// ── Derived insights ──────────────────────────────────────────────────

function classifyPostState(actionState: number): string | null {
  // After knockdown: what did they do?
  if (actionState === State.NEUTRAL_TECH) return "tech in place";
  if (actionState === State.FORWARD_TECH) return "tech forward";
  if (actionState === State.BACKWARD_TECH) return "tech backward";
  if (
    actionState === State.TECH_MISS_UP ||
    actionState === State.TECH_MISS_DOWN
  )
    return "missed tech";
  if (actionState === State.JAB_RESET_UP || actionState === State.JAB_RESET_DOWN)
    return "jab reset";

  // Getup attacks (195-198 range)
  if (actionState >= 195 && actionState <= 198) return "getup attack";

  return null;
}

function classifyLedgeOption(actionState: number): string | null {
  if (actionState === State.ROLL_FORWARD) return "ledge roll";
  // Ledge jump (254), ledge attack (256), ledge getup (250), ledge drop
  if (actionState === 250) return "ledge getup";
  if (actionState === 254) return "ledge jump";
  if (actionState === 256) return "ledge attack";
  if (actionState === State.FALL || actionState === State.FALL_FORWARD || actionState === State.FALL_BACKWARD)
    return "ledge drop";
  // Air dodge from ledge (ledgedash)
  if (actionState === State.AIR_DODGE) return "ledgedash";
  return null;
}

function classifyShieldOption(actionState: number): string | null {
  if (actionState === State.ROLL_FORWARD) return "roll forward";
  if (actionState === State.ROLL_BACKWARD) return "roll backward";
  if (actionState === State.SPOT_DODGE) return "spot dodge";
  if (actionState === State.GRAB || actionState === State.DASH_GRAB)
    return "grab OOS";
  if (
    actionState >= State.CONTROLLED_JUMP_START &&
    actionState <= State.CONTROLLED_JUMP_END
  )
    return "jump OOS";
  // Aerial OOS
  if (
    actionState >= State.AERIAL_ATTACK_START &&
    actionState <= State.AERIAL_DAIR
  )
    return "aerial OOS";
  // Shine OOS would appear as a special move — hard to distinguish without character check
  if (actionState >= State.GROUND_ATTACK_START && actionState <= State.GROUND_ATTACK_END)
    return "attack OOS";
  return null;
}

function buildHabitProfile(
  playerIndex: number,
  frames: FramesType,
  lastFrame: number,
  triggerFn: (actionState: number) => boolean,
  classifyFn: (actionState: number) => string | null,
): HabitProfile {
  const counts = new Map<string, number>();
  let inTrigger = false;

  for (let f = Frames.FIRST_PLAYABLE; f <= lastFrame; f++) {
    const frame = frames[f];
    if (!frame) continue;
    const pd = frame.players[playerIndex]?.post;
    if (!pd) continue;
    const actionState = pd.actionStateId ?? 0;

    if (triggerFn(actionState)) {
      inTrigger = true;
    } else if (inTrigger) {
      // Player just left the trigger state — classify what they did
      const option = classifyFn(actionState);
      if (option) {
        counts.set(option, (counts.get(option) ?? 0) + 1);
        inTrigger = false;
      }
      // If we can't classify yet, keep waiting (they might transition through intermediate states)
    }
  }

  const options = [...counts.entries()]
    .map(([action, frequency]) => ({ action, frequency }))
    .sort((a, b) => b.frequency - a.frequency);

  return { options, entropy: entropy(options) };
}

function computePerformanceByStock(
  playerIndex: number,
  playerStocks: StockType[],
  conversions: ConversionType[],
  opponentIndex: number,
  lastFrame: number,
): DerivedInsights["performanceByStock"] {
  return playerStocks.map((stock) => {
    const startF = stock.startFrame;
    const endF = stock.endFrame ?? lastFrame;

    // conversion.playerIndex = victim
    // My attacks (opponent is victim) = neutral wins for me
    const myAttacks = conversions.filter(
      (c) =>
        c.playerIndex === opponentIndex &&
        c.startFrame >= startF &&
        c.startFrame <= endF,
    );
    // Opponent's attacks (I am victim) = neutral losses for me
    const oppAttacks = conversions.filter(
      (c) =>
        c.playerIndex === playerIndex &&
        c.startFrame >= startF &&
        c.startFrame <= endF,
    );

    const dmgDealt = myAttacks.reduce(
      (s, c) => s + ((c.endPercent ?? c.currentPercent) - c.startPercent),
      0,
    );
    const dmgTaken = oppAttacks.reduce(
      (s, c) => s + ((c.endPercent ?? c.currentPercent) - c.startPercent),
      0,
    );

    const totalNeutral = myAttacks.length + oppAttacks.length;

    return {
      stock: stock.count,
      neutralWinRate: ratio(myAttacks.length, totalNeutral),
      damageEfficiency:
        dmgTaken > 0 ? Math.round((dmgDealt / dmgTaken) * 100) / 100 : dmgDealt > 0 ? 999 : 0,
    };
  });
}

function findBestConversion(
  conversions: ConversionType[],
  playerIndex: number,
  opponentIndex: number,
): DerivedInsights["bestConversion"] {
  // conversion.playerIndex = victim. My best conversion = opponent is victim.
  const playerConvs = conversions.filter(
    (c) => c.playerIndex === opponentIndex && c.moves.length > 0,
  );

  let best: ConversionType | undefined;
  let bestDmg = 0;

  for (const c of playerConvs) {
    const dmg = (c.endPercent ?? c.currentPercent) - c.startPercent;
    if (dmg > bestDmg || (dmg === bestDmg && c.didKill)) {
      bestDmg = dmg;
      best = c;
    }
  }

  if (!best) {
    return {
      moves: [],
      totalDamage: 0,
      startPercent: 0,
      endedInKill: false,
    };
  }

  return {
    moves: best.moves.map(
      (m) => moveIdToName[m.moveId] ?? getMoveName(m.moveId),
    ),
    totalDamage: Math.round(bestDmg),
    startPercent: Math.round(best.startPercent),
    endedInKill: best.didKill,
  };
}


function findWorstMissedPunish(
  conversions: ConversionType[],
  playerIndex: number,
  opponentIndex: number,
): DerivedInsights["worstMissedPunish"] {
  // conversion.playerIndex = victim. My missed punish = opponent is victim but I did low damage.
  const playerConvs = conversions.filter(
    (c) => c.playerIndex === opponentIndex && c.moves.length > 0,
  );

  let worst: ConversionType | undefined;
  let worstScore = -Infinity;

  for (const c of playerConvs) {
    const dmg = (c.endPercent ?? c.currentPercent) - c.startPercent;
    if (dmg >= 10) continue; // Not a missed punish
    if (c.didKill) continue;

    // Score = opponent percent at time (higher = worse missed opportunity)
    const opponentPercent = c.startPercent;
    const score = opponentPercent - dmg; // Higher opponent % + lower damage = worse
    if (score > worstScore) {
      worstScore = score;
      worst = c;
    }
  }

  if (!worst) return null;

  const firstMove = worst.moves[0]!;
  return {
    opener: moveIdToName[firstMove.moveId] ?? getMoveName(firstMove.moveId),
    damageDealt: Math.round(
      (worst.endPercent ?? worst.currentPercent) - worst.startPercent,
    ),
    opponentPercent: Math.round(worst.startPercent),
  };
}

function buildDerivedInsights(
  playerIndex: number,
  opponentIndex: number,
  stats: StatsType,
  frames: FramesType,
  lastFrame: number,
): DerivedInsights {
  const playerStocks = stats.stocks.filter(
    (s) => s.playerIndex === playerIndex,
  );

  const afterKnockdown = buildHabitProfile(
    playerIndex,
    frames,
    lastFrame,
    isKnockdown,
    classifyPostState,
  );

  const afterLedgeGrab = buildHabitProfile(
    playerIndex,
    frames,
    lastFrame,
    isLedgeGrab,
    classifyLedgeOption,
  );

  const afterShieldPressure = buildHabitProfile(
    playerIndex,
    frames,
    lastFrame,
    isShielding,
    classifyShieldOption,
  );

  const performanceByStock = computePerformanceByStock(
    playerIndex,
    playerStocks,
    stats.conversions,
    opponentIndex,
    lastFrame,
  );

  const bestConversion = findBestConversion(stats.conversions, playerIndex, opponentIndex);
  const worstMissedPunish = findWorstMissedPunish(
    stats.conversions,
    playerIndex,
    opponentIndex,
  );

  return {
    afterKnockdown,
    afterLedgeGrab,
    afterShieldPressure,
    performanceByStock,
    bestConversion,
    worstMissedPunish,
    adaptationSignals: [], // Only for multi-game sets
  };
}

// ── Main ──────────────────────────────────────────────────────────────

export function processGame(filePath: string, gameNumber: number): {
  gameSummary: GameSummary;
  derivedInsights: [DerivedInsights, DerivedInsights];
  startAt: string | null;
} {
  const game = new SlippiGame(filePath);
  const settings = game.getSettings();
  const stats = game.getStats();
  const metadata = game.getMetadata();
  const gameEnd = game.getGameEnd();
  const frames = game.getFrames();
  const startAt = metadata?.startAt ?? null;

  if (!settings || !stats || !frames) {
    throw new Error(`Failed to parse game: ${filePath}`);
  }

  const players = settings.players.filter(
    (p) => p.type !== 3, // Filter out empty slots (type 3 = none)
  );
  if (players.length !== 2) {
    throw new Error(
      `Expected 2 players, got ${players.length} in ${filePath}`,
    );
  }

  const p0 = players[0]!;
  const p1 = players[1]!;
  const p0Index = p0.playerIndex;
  const p1Index = p1.playerIndex;

  const stageId = settings.stageId ?? 0;
  const stageName = stageUtils.getStageName(stageId);
  const lastFrame = stats.lastFrame;

  // Determine winner
  const winners = game.getWinners();
  const winnerIndex = winners.length > 0 ? winners[0]!.playerIndex : -1;
  const winnerTag =
    winnerIndex === p0Index
      ? getPlayerTag(p0)
      : winnerIndex === p1Index
        ? getPlayerTag(p1)
        : "Unknown";

  // Final stocks and percents from last frame
  const lastFrameData = frames[lastFrame];
  const p0Post = lastFrameData?.players[p0Index]?.post;
  const p1Post = lastFrameData?.players[p1Index]?.post;

  const finalStocks: [number, number] = [
    p0Post?.stocksRemaining ?? 0,
    p1Post?.stocksRemaining ?? 0,
  ];
  const finalPercents: [number, number] = [
    Math.round(p0Post?.percent ?? 0),
    Math.round(p1Post?.percent ?? 0),
  ];

  // Find overall stats for each player
  const p0Overall = stats.overall.find((o) => o.playerIndex === p0Index);
  const p1Overall = stats.overall.find((o) => o.playerIndex === p1Index);

  if (!p0Overall || !p1Overall) {
    throw new Error("Missing overall stats");
  }

  const p0Actions = stats.actionCounts.find(
    (a) => a.playerIndex === p0Index,
  );
  const p1Actions = stats.actionCounts.find(
    (a) => a.playerIndex === p1Index,
  );

  if (!p0Actions || !p1Actions) {
    throw new Error("Missing action counts");
  }

  const p0Stocks = stats.stocks.filter((s) => s.playerIndex === p0Index);
  const p1Stocks = stats.stocks.filter((s) => s.playerIndex === p1Index);

  const p0Summary = buildPlayerSummary(
    p0Index,
    p0,
    p0Overall,
    p0Actions,
    stats.conversions,
    p0Stocks,
    stats.conversions,
    frames,
    lastFrame,
    stageId,
  );

  const p1Summary = buildPlayerSummary(
    p1Index,
    p1,
    p1Overall,
    p1Actions,
    stats.conversions,
    p1Stocks,
    stats.conversions,
    frames,
    lastFrame,
    stageId,
  );

  const gameSummary: GameSummary = {
    gameNumber,
    stage: stageName,
    duration: framesToSeconds(lastFrame - Frames.FIRST_PLAYABLE),
    result: {
      winner: winnerTag,
      endMethod: endMethodString(gameEnd),
      finalStocks,
      finalPercents,
    },
    players: [p0Summary, p1Summary],
  };

  const p0Insights = buildDerivedInsights(
    p0Index,
    p1Index,
    stats,
    frames,
    lastFrame,
  );
  const p1Insights = buildDerivedInsights(
    p1Index,
    p0Index,
    stats,
    frames,
    lastFrame,
  );

  return {
    gameSummary,
    derivedInsights: [p0Insights, p1Insights],
    startAt,
  };
}

// ── System prompt ─────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are Coach-Clippi, an expert Super Smash Bros. Melee analyst and coach.
You analyze competitive Melee replay data and provide specific, actionable
coaching feedback.

CORE RULES:
- Never give generic advice. Every observation must reference specific data
  from the replay (percentages, frequencies, game/stock numbers).
- Prioritize actionable feedback over praise. Players using this tool want
  to improve, not be congratulated.
- Use correct Melee terminology: neutral, punish game, edgeguard, tech chase,
  DI, SDI, L-cancel, wavedash, dash dance, SHFFL, OOS options, ledgedash,
  shield drop, crouch cancel, ASDI down, etc.
- When identifying habits, specify the counter-play. Don't just say "you roll
  too much from ledge" — say "you rolled from ledge 6/8 times; at this
  frequency your opponent can wait and react with [specific punish]."
- Frame data matters. Reference frame windows when relevant (e.g., "Fox uptilt
  is frame 5 and -19 on shield, so your opponent can grab or shine OOS").
- Distinguish between execution issues (dropped L-cancels, missed tech) and
  decision-making issues (predictable options, poor spacing, wrong punish
  routes). Both matter but they require different practice approaches.
- Calibrate to the player's level. If their L-cancel rate is 95%+ and
  conversion rate is high, address them as an advanced player and focus on
  subtle optimizations. If they're at 70% L-cancels, focus on fundamentals.

ANALYSIS STRUCTURE:

For each game in the set, provide:

1. **Game Overview** (2-3 sentences)
   Who won, what the key dynamic was, what the turning point was.

2. **Biggest Improvement Opportunity** (the single most impactful thing to fix)
   Identify the ONE habit or weakness that, if corrected, would have the largest
   impact on the player's results. Support with specific numbers from the data.

3. **Neutral Game Assessment**
   - Stage control and positioning tendencies
   - Approach patterns and their success rates
   - Defensive habits (shield, dash back, jump) and exploitability
   - Option entropy: are they mixing up or predictable?

4. **Punish Game Assessment**
   - Conversion efficiency (openings per kill, average damage per opening)
   - Are they optimizing combos for the matchup at this percent range?
   - Missed kill opportunities (e.g., had an opening at 120% and only got 15%)
   - Edgeguard success and strategy

5. **Defense & Recovery Assessment**
   - DI quality (inferred from combo lengths received — long combos = poor DI)
   - Recovery patterns and predictability
   - Ledge option distribution and entropy
   - Tech option distribution when knocked down

For a multi-game SET, also provide:

6. **Set-Level Analysis**
   - Did either player adapt between games? Show the data.
   - What changed on counterpick stages?
   - Overall set narrative: who had momentum, when did it shift, why?

7. **Practice Plan** (3 specific drills)
   Based on the weaknesses identified, recommend exactly 3 things to practice.
   Each drill should be:
   - Specific (not "practice neutral" — instead "practice reacting to Fox
     running at you from mid-range with uptilt/grab mixup on FD")
   - Measurable (how do they know they're improving?)
   - Ranked by impact

8. **Coach's Wisdom** (1 paragraph)
   This is where you earn your keep. Step back from the numbers and deliver
   ONE golden insight — something that connects the dots across the data in
   a way the player wouldn't see on their own. Maybe it's a subtle correlation
   between their stock-by-stock performance and a mental pattern. Maybe it's
   a read on their opponent's adaptation that reveals a deeper strategic
   opportunity. Maybe it's a non-obvious relationship between two stats that
   tells a story about how the game actually played out. This should feel like
   wisdom from a coach who's seen thousands of sets — the kind of observation
   that makes a player go "oh shit, you're right." Don't repeat anything from
   the sections above. This is your unique insight.

WHAT NOT TO DO:
- Don't recite stats back without interpretation. The player can see the
  numbers — you need to explain what they MEAN.
- Don't give advice that doesn't apply to the specific matchup. Fox vs Marth
  advice is different from Falco vs Sheik advice.
- Don't assume the player is bad. They might be a high-level player with
  one specific leak.
- Don't provide advice that is only relevant at superhuman levels. If the
  player's data shows mid-level execution, focus on the fundamentals that
  will give them the most improvement.
- Don't hallucinate events. If the data doesn't show something, don't claim
  it happened. Stick to what the numbers support.

MATCHUP AWARENESS:

You understand character-specific dynamics. Key matchup principles:

Fox vs Marth:
  - Fox wants close range: uptilt, grab, nair pressure. Avoids Marth's
    tipper spacing at mid-range.
  - Marth wants dash dance spacing to bait and punish with fair, grab, dtilt.
  - Fox kills with upsmash, upair, and edgeguards. Marth kills with fsmash
    tipper, fair edgeguards, and dair spikes.
  - At low %, Fox can chain grab / upthrow upair. At mid %, Marth can
    chain grab Fox on FD.

Fox vs Falco:
  - Laser control defines neutral. Falco wants to laser to force an approach.
    Fox wants to get in past lasers with full hop, powershield, or platform
    movement.
  - Falco's shine → dair (pillar combos) are the core punish. Fox's upthrow
    upair is the core kill setup.
  - Both characters die early to edgeguards. Recovery pattern reads are huge.

Fox dittos:
  - Whoever wins neutral more consistently usually wins. Very volatile — both
    die early to upsmash, shine spike, upair.
  - Drill/nair shine pressure on shield is the core approach. OOS options
    (shine, nair, upsmash) are critical.

Marth vs Sheik:
  - Marth outranges Sheik and wants to wall with fair. Sheik wants to get
    inside fair range and use ftilt, grab, dash attack.
  - Sheik's tech chase game off downthrow is a key percent builder. Marth
    needs to mix DI and tech options.
  - On platforms, Sheik can needle camp. Marth needs to control stage and
    force approaches.

Falco vs Sheik:
  - Falco laser pressure is strong but Sheik can powershield and punish.
  - Sheik's downthrow tech chase works on Falco. Falco's pillar combos work
    on Sheik.
  - Edgeguard game is critical for both — Sheik uses fair/bair, Falco uses
    dair/bair.

Sheik vs Fox:
  - Sheik wants to play patiently, react to Fox approaches with boost grab,
    ftilt, or downsmash.
  - Fox wants to bait Sheik's defensive options and punish with grab/upsmash.
  - Sheik's downthrow tech chase is the primary punish tool. Fox kills with
    upsmash and upair.
  - Platform needle camping is strong for Sheik on stages like Battlefield.

Jigglypuff matchups:
  - Puff wants to space bair and threaten rest. Most characters want to
    prevent her from getting underneath them.
  - Puff's edgeguards are devastating (bair wall, rest on ledge).
  - Crouch cancel is very strong against Puff at low percent.
  - Fox is Puff's hardest matchup — upthrow upair kills early, drill/shine
    combos, and Fox's speed overwhelms Puff's spacing.

Peach matchups:
  - Peach's float cancel aerials give her unique pressure options.
  - Downsmash is a powerful kill move but punishable on whiff.
  - Turnip play (pulling, throwing, item catches) is a key neutral tool.
  - Fox chain grabs Peach and can upsmash kill very early.

Falcon matchups:
  - Falcon's grab game (upthrow into knee, stomp, nair) is the core punish.
  - Neutral relies on dash dance spacing and reaction tech chasing.
  - Very vulnerable to combos from most characters — dies to Fox upsmash,
    Marth fsmash, Falco combos early.
  - Falcon ditto is volatile — both players can zero-to-death.

IC (Ice Climbers) matchups:
  - Wobbling (infinite grab with Nana) is the defining mechanic. Separating
    the climbers is the counter-play.
  - Sopo (Popo alone) is significantly weaker. Killing Nana is a priority.
  - IC's struggle in disadvantage — poor recovery, poor landing options.

For characters not listed above, apply general principles: analyze the data
for patterns, reference the character's known strengths/weaknesses, and focus
on decision-making and habit exploitation.

TONE:
Direct, analytical, respectful. Like a skilled practice partner who's watched
your set and is giving you honest feedback over a drink at the venue. Not
clinical, not condescending, not overly enthusiastic. You're allowed to be
blunt — players want to hear what they need to fix.`;

// ── Adaptation signals ────────────────────────────────────────────────

export type GameResult = {
  gameSummary: GameSummary;
  derivedInsights: [DerivedInsights, DerivedInsights];
};

export function findPlayerIdx(
  gameSummary: GameSummary,
  playerIdentifier: string,
): 0 | 1 {
  // Exact tag match
  if (gameSummary.players[0].tag === playerIdentifier) return 0;
  if (gameSummary.players[1].tag === playerIdentifier) return 1;
  // Connect code match
  if (gameSummary.players[0].connectCode === playerIdentifier) return 0;
  if (gameSummary.players[1].connectCode === playerIdentifier) return 1;
  // Fallback: partial tag match
  if (gameSummary.players[0].tag.toLowerCase().includes(playerIdentifier.toLowerCase())) return 0;
  return 1;
}

function getGrabFrequency(player: PlayerSummary): number {
  const grab = player.moveUsage.find((m) => m.move === "grab");
  const totalMoves = player.moveUsage.reduce((s, m) => s + m.count, 0);
  if (!grab || totalMoves === 0) return 0;
  return ratio(grab.count, totalMoves);
}

export function computeAdaptationSignals(
  gameResults: GameResult[],
  playerTag: string,
): DerivedInsights["adaptationSignals"] {
  if (gameResults.length < 2) return [];

  const first = gameResults[0]!;
  const last = gameResults[gameResults.length - 1]!;

  const firstIdx = findPlayerIdx(first.gameSummary, playerTag);
  const lastIdx = findPlayerIdx(last.gameSummary, playerTag);

  const firstPlayer = first.gameSummary.players[firstIdx];
  const lastPlayer = last.gameSummary.players[lastIdx];
  const firstInsights = first.derivedInsights[firstIdx];
  const lastInsights = last.derivedInsights[lastIdx];

  const metrics: {
    metric: string;
    game1Value: number;
    lastGameValue: number;
    higherIsBetter: boolean;
  }[] = [
    {
      metric: "neutral win rate",
      game1Value: firstPlayer.neutralWinRate,
      lastGameValue: lastPlayer.neutralWinRate,
      higherIsBetter: true,
    },
    {
      metric: "ledge option entropy",
      game1Value: firstInsights.afterLedgeGrab.entropy,
      lastGameValue: lastInsights.afterLedgeGrab.entropy,
      higherIsBetter: true,
    },
    {
      metric: "knockdown option entropy",
      game1Value: firstInsights.afterKnockdown.entropy,
      lastGameValue: lastInsights.afterKnockdown.entropy,
      higherIsBetter: true,
    },
    {
      metric: "shield option entropy",
      game1Value: firstInsights.afterShieldPressure.entropy,
      lastGameValue: lastInsights.afterShieldPressure.entropy,
      higherIsBetter: true,
    },
    {
      metric: "L-cancel rate",
      game1Value: firstPlayer.lCancelRate,
      lastGameValue: lastPlayer.lCancelRate,
      higherIsBetter: true,
    },
    {
      metric: "openings per kill",
      game1Value: firstPlayer.openingsPerKill,
      lastGameValue: lastPlayer.openingsPerKill,
      higherIsBetter: false,
    },
    {
      metric: "avg damage per opening",
      game1Value: firstPlayer.averageDamagePerOpening,
      lastGameValue: lastPlayer.averageDamagePerOpening,
      higherIsBetter: true,
    },
    {
      metric: "grab frequency",
      game1Value: getGrabFrequency(firstPlayer),
      lastGameValue: getGrabFrequency(lastPlayer),
      higherIsBetter: true, // generally, more grabs = better punish game
    },
  ];

  const THRESHOLD = 0.03; // 3% change threshold for "stable"

  return metrics.map(({ metric, game1Value, lastGameValue, higherIsBetter }) => {
    const delta = lastGameValue - game1Value;
    const relativeDelta =
      game1Value !== 0 ? Math.abs(delta / game1Value) : Math.abs(delta);

    let direction: "improving" | "declining" | "stable";
    if (relativeDelta < THRESHOLD) {
      direction = "stable";
    } else if (higherIsBetter) {
      direction = delta > 0 ? "improving" : "declining";
    } else {
      direction = delta < 0 ? "improving" : "declining";
    }

    return {
      metric,
      game1Value: Math.round(game1Value * 10000) / 10000,
      lastGameValue: Math.round(lastGameValue * 10000) / 10000,
      direction,
    };
  });
}

// ── Prompt assembly ───────────────────────────────────────────────────

export function assembleUserPrompt(
  gameResults: GameResult[],
  targetPlayerTag: string,
): string {
  const first = gameResults[0]!;
  const p1 = first.gameSummary.players[0];
  const p2 = first.gameSummary.players[1];

  const lines: string[] = [
    `I'd like you to analyze the following ${gameResults.length > 1 ? "set" : "game"} between ${p1.tag} (${p1.character}) and ${p2.tag} (${p2.character}).`,
    "",
    `Please analyze from the perspective of ${targetPlayerTag}.`,
  ];

  for (const result of gameResults) {
    const g = result.gameSummary;
    const gp1 = g.players[0];
    const gp2 = g.players[1];
    const r = g.result;

    const insightsObj = {
      [gp1.tag]: result.derivedInsights[0],
      [gp2.tag]: result.derivedInsights[1],
    };

    lines.push(
      "",
      `=== GAME ${g.gameNumber} — ${g.stage} ===`,
      "",
      `Result: ${r.winner} wins (${r.finalStocks[0]}-${r.finalStocks[1]} stocks, ${r.finalPercents[0]}%-${r.finalPercents[1]}%)`,
      "",
      `--- ${gp1.tag} (${gp1.character}) ---`,
      JSON.stringify(gp1, null, 2),
      "",
      `--- ${gp2.tag} (${gp2.character}) ---`,
      JSON.stringify(gp2, null, 2),
      "",
      `--- Derived Insights ---`,
      JSON.stringify(insightsObj, null, 2),
    );
  }

  lines.push(
    "",
    "Provide your full coaching analysis following the structure defined in your instructions.",
  );

  return lines.join("\n");
}

// ── LLM call — delegated to src/llm.ts ───────────────────────────────
// callGemini removed — use callLLM() from src/llm.ts instead.

// ── CLI entry point ───────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  filePaths: string[];
  targetPlayer: string | null;
  jsonMode: boolean;
  dir: string | null;
  setNumber: number | null;
  listSets: boolean;
} {
  const args = argv.slice(2);
  const filePaths: string[] = [];
  let targetPlayer: string | null = null;
  let jsonMode = false;
  let dir: string | null = null;
  let setNumber: number | null = null;
  let listSets = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--target" && i + 1 < args.length) {
      targetPlayer = args[++i]!;
    } else if (arg === "--json") {
      jsonMode = true;
    } else if (arg === "--dir" && i + 1 < args.length) {
      dir = args[++i]!;
    } else if (arg === "--set" && i + 1 < args.length) {
      setNumber = parseInt(args[++i]!, 10);
    } else if (arg === "--sets") {
      listSets = true;
    } else if (!arg.startsWith("--")) {
      filePaths.push(arg);
    }
  }

  return { filePaths, targetPlayer, jsonMode, dir, setNumber, listSets };
}

function dumpJson(gameResults: GameResult[]): void {
  const output = {
    games: gameResults.map((r) => ({
      gameSummary: r.gameSummary,
      derivedInsights: {
        [r.gameSummary.players[0].tag]: r.derivedInsights[0],
        [r.gameSummary.players[1].tag]: r.derivedInsights[1],
      },
    })),
  };
  console.log(JSON.stringify(output, null, 2));
}

async function main() {
  const { filePaths, targetPlayer, jsonMode, dir, setNumber, listSets } =
    parseArgs(process.argv);

  // --dir mode: auto-detect sets from a replay folder
  if (dir || listSets) {
    const { detectSets } = require("./detect-sets") as typeof import("./detect-sets");
    const replayDir = dir || "test-replays";
    const sets = detectSets(replayDir);

    if (listSets || setNumber == null) {
      // List all detected sets
      console.error(`Found ${sets.length} sets in ${replayDir}\n`);
      for (let i = 0; i < sets.length; i++) {
        const set = sets[i]!;
        const wins = [0, 0];
        for (const g of set.games) {
          if (g.winner === set.players[0]) wins[0]!++;
          else if (g.winner === set.players[1]) wins[1]!++;
        }
        const chars = set.games.map(
          (g) => `${g.players[0].character}/${g.players[1].character}`,
        );
        console.error(
          `  ${(i + 1).toString().padStart(2)}. ${set.players[0]} vs ${set.players[1]} — ${set.games.length} game${set.games.length > 1 ? "s" : ""} (${wins[0]}-${wins[1]}) [${chars.join(", ")}]`,
        );
      }
      if (!listSets) {
        console.error(
          "\nUse --set <number> to analyze a set, e.g.: npx tsx src/pipeline.ts --dir test-replays --set 9",
        );
      }
      return;
    }

    // Validate set number
    if (setNumber < 1 || setNumber > sets.length) {
      console.error(`Set ${setNumber} not found. There are ${sets.length} sets.`);
      process.exit(1);
    }

    const selectedSet = sets[setNumber - 1]!;

    // Use the set's file paths, fall through to normal processing
    for (const g of selectedSet.games) {
      filePaths.push(g.filePath);
    }
  }

  if (filePaths.length === 0) {
    console.error(
      "Usage:\n" +
        "  npx tsx src/pipeline.ts <file1.slp> [file2.slp ...] [--target player] [--json]\n" +
        "  npx tsx src/pipeline.ts --dir <replay-folder> [--sets]\n" +
        "  npx tsx src/pipeline.ts --dir <replay-folder> --set <number> [--target player] [--json]",
    );
    process.exit(1);
  }

  // Process all games
  const gameResults: GameResult[] = [];
  for (let i = 0; i < filePaths.length; i++) {
    gameResults.push(processGame(filePaths[i]!, i + 1));
  }

  const firstGame = gameResults[0]!.gameSummary;

  // Resolve target player tag (default to first named player)
  const targetTag =
    targetPlayer ??
    firstGame.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag ??
    firstGame.players[0].tag;

  // Compute adaptation signals for multi-game sets
  if (gameResults.length >= 2) {
    const p0Tag = firstGame.players[0].tag;
    const p1Tag = firstGame.players[1].tag;

    const p0Signals = computeAdaptationSignals(gameResults, p0Tag);
    const p1Signals = computeAdaptationSignals(gameResults, p1Tag);

    // Attach to the last game's derived insights
    const lastResult = gameResults[gameResults.length - 1]!;
    const lastP0Idx = findPlayerIdx(lastResult.gameSummary, p0Tag);
    const lastP1Idx = findPlayerIdx(lastResult.gameSummary, p1Tag);
    lastResult.derivedInsights[lastP0Idx].adaptationSignals = p0Signals;
    lastResult.derivedInsights[lastP1Idx].adaptationSignals = p1Signals;
  }

  // JSON-only mode
  if (jsonMode) {
    dumpJson(gameResults);
    return;
  }

  const userPrompt = assembleUserPrompt(gameResults, targetTag);

  // Status output
  for (const r of gameResults) {
    const g = r.gameSummary;
    console.error(
      `Game ${g.gameNumber}: ${g.stage} — ${g.players[0].tag} (${g.players[0].character}) vs ${g.players[1].tag} (${g.players[1].character})`,
    );
  }
  console.error(`Perspective: ${targetTag}`);

  // Resolve LLM config from user config + env vars
  const configMod = require("./config") as typeof import("./config");
  const llmMod = require("./llm") as typeof import("./llm");
  const userConfig = configMod.loadConfig();
  const llmConfig: import("./llm").LLMConfig = {
    modelId: userConfig.llmModelId ?? llmMod.LLM_DEFAULTS.modelId,
    openrouterApiKey: userConfig.openrouterApiKey,
    geminiApiKey: userConfig.geminiApiKey,
    anthropicApiKey: userConfig.anthropicApiKey,
    openaiApiKey: userConfig.openaiApiKey,
    localEndpoint: userConfig.localEndpoint,
  };

  console.error(`Calling ${llmMod.getModelLabel(llmConfig.modelId)}...`);

  try {
    const analysis = await llmMod.callLLM({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      config: llmConfig,
    });
    console.log(analysis);
  } catch (err) {
    console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
    console.error("Game summary data (so your analysis isn't lost):\n");
    dumpJson(gameResults);
    process.exit(1);
  }
}

// Only run when executed directly, not when imported
if (require.main === module) {
  main();
}
