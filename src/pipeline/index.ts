// Barrel re-exports — preserves the public API for all consumers.
// Imports from "../pipeline" or "./pipeline" resolve here.

export { processGame } from "./processGame.js";
export { analyzeGame, assertAnalysisOk, isDegenerateAnalysis, analysisStatusFromOutcome } from "./analyzeGame.js";
export type { AnalyzeGameOutcome, AnalyzeGameOk, AnalyzeGameErr, AnalyzedGame } from "./analyzeGame.js";
export {
  ANALYSIS_STATUSES,
  isSuccessfulAnalysisStatus,
  analysisStatusLabel,
  analysisStatusDetail,
} from "./analysisStatus.js";
export type { AnalysisStatus } from "./analysisStatus.js";
export { requirePlayerIdx, PlayerMatchError } from "./adaptation.js";
export { buildDerivedInsights } from "./derivedInsights.js";
export { computeAdaptationSignals, findPlayerIdx } from "./adaptation.js";
export { classifyGameResult } from "./helpers.js";
export { detectHighlights } from "./highlights.js";
export { extractFrameEvents } from "./frameEvents.js";
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
