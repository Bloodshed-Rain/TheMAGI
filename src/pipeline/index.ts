// Barrel re-exports — preserves the public API for all consumers.
// Imports from "../pipeline" or "./pipeline" resolve here.

export { processGame } from "./processGame.js";
export { buildDerivedInsights } from "./derivedInsights.js";
export { computeAdaptationSignals, findPlayerIdx } from "./adaptation.js";
export { classifyGameResult } from "./helpers.js";
export { detectHighlights } from "./highlights.js";
export { extractFrameEvents, FRAME_EVENTS_VERSION } from "./frameEvents.js";
export { patternsFromFrameEvents, mergePatternData, formatRecurringPatterns } from "./patterns.js";
export type { PatternData, RecurringPatterns } from "./patterns.js";
export { computeDeathVerdicts, extractThrowDIRecords, DI_DEADZONE } from "./measuredDI.js";
export { extractRecoverySpans } from "./recoveryEvents.js";
export { extractShieldBlocks } from "./shieldEvents.js";
export { extractWhiffEvents } from "./whiffEvents.js";
export {
  getAerialFrameData,
  getDeathDirection,
  getJumpsquatFrames,
  getStandingGrabActiveFrame,
  JUMPSQUAT_FRAMES,
} from "./frameData.js";
export {
  assembleUserPrompt,
  assemblePlayerContext,
  SYSTEM_PROMPT,
  COACHING_PROMPT_VERSION,
  assembleAggregatePrompt,
  SYSTEM_PROMPT_AGGREGATE,
  SYSTEM_PROMPT_CHARACTER_BLURB,
  stripNulls,
  assembleDiscoveryPrompt,
  SYSTEM_PROMPT_DISCOVERY,
  SYSTEM_PROMPT_SCOUT,
  assembleOpponentDossierPrompt,
  SYSTEM_PROMPT_CORNERMAN,
  assembleCornermanPrompt,
} from "./prompt.js";

export type {
  PlayerSummary,
  GameSummary,
  DerivedInsights,
  HabitProfile,
  GameResult,
  GameHighlight,
  KenComboStats,
  TurnipPullStats,
  CharacterSignatureStats,
  FoxSignatureStats,
  FalcoSignatureStats,
  SheikSignatureStats,
  FalconSignatureStats,
  PuffSignatureStats,
  IcClimbersSignatureStats,
  MarthSignatureStats,
  PeachSignatureStats,
  SamusSignatureStats,
  PikachuSignatureStats,
  LuigiSignatureStats,
  MarioSignatureStats,
  DocSignatureStats,
  YoshiSignatureStats,
  GanonSignatureStats,
  LinkSignatureStats,
  YLinkSignatureStats,
  ZeldaSignatureStats,
  RoySignatureStats,
  MewtwoSignatureStats,
  GnwSignatureStats,
  NessSignatureStats,
  BowserSignatureStats,
  KirbySignatureStats,
  DkSignatureStats,
  PichuSignatureStats,
  PlayerHistory,
  AggregateStats,
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
} from "./types.js";
