declare module "*.jpg" {
  const src: string;
  export default src;
}
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.webp" {
  const src: string;
  export default src;
}

import type {
  CornermanLiveSnapshot as LiveSnapshot,
  CornermanLivePlayerStats as LivePlayerStats,
  CornermanLiveStatValue as LiveStatValue,
  CornermanLiveBaseline as LiveBaseline,
} from "../cornermanLiveStats";
import type {
  CharacterEventProfile as EventProfile,
  CharacterBlurbResult as BlurbResult,
} from "../characterEventProfile";
import type { CornermanLiveEvent as LiveEvent } from "../cornermanLiveEvents";
import type { ProviderId as LlmProviderId } from "../llm";
import type { ProviderSpeechEvent, ProviderSpeechRequest } from "../providerVoice";
import type { PlayBounds, PlayStatus, PlayCoachingSetup } from "../playMode";
import type { PlayCursor } from "../playEdgePeek";
import type { ChatGPTStatus, ChatGPTModel } from "../chatgptTypes";

declare global {
  // Re-exported from the single source of truth (src/cornermanLiveStats.ts) so
  // the payload shape isn't duplicated across the IPC boundary.
  type CornermanLiveSnapshot = LiveSnapshot;
  type CornermanLivePlayerStats = LivePlayerStats;
  type CornermanLiveStatValue = LiveStatValue;
  type CornermanLiveBaseline = LiveBaseline;

  // Re-exported from src/characterEventProfile.ts (per-character analytics contract).
  type CharacterEventProfile = EventProfile;
  type CharacterBlurbResult = BlurbResult;

  interface CornermanStatus {
    active: boolean;
    opponentTag: string | null;
    opponentKey: string | null;
    wins: number;
    losses: number;
    gamesCount: number;
  }

  interface CornermanCard {
    text: string;
    gameNumber: number;
    opponentTag: string;
    wins: number;
    losses: number;
  }

  type CornermanLiveEvent = LiveEvent;

  interface Window {
    clippi: {
      onCornermanSettingsChanged: (callback: () => void) => () => void;
      getAppVersion: () => Promise<string>;
      chatgptStatus: () => Promise<ChatGPTStatus>;
      chatgptConnect: (options?: { profileId?: string; newProfile?: boolean; requestConsent?: boolean }) => Promise<ChatGPTStatus>;
      chatgptCancel: () => Promise<boolean>;
      chatgptSelect: (id: string) => Promise<ChatGPTStatus>;
      chatgptDisconnect: () => Promise<{ status: ChatGPTStatus; remoteRevoked: boolean }>;
      chatgptModels: () => Promise<ChatGPTModel[]>;
      chatgptUsage: () => Promise<void>;
      playCoachingSetup: () => Promise<PlayCoachingSetup>;
      playPrepareCoaching: () => Promise<PlayCoachingSetup>;
      playStatus: () => Promise<PlayStatus>;
      playStart: (bounds: PlayBounds) => Promise<PlayStatus>;
      playShow: (bounds: PlayBounds) => Promise<PlayStatus>;
      playHide: () => Promise<PlayStatus>;
      playStop: () => Promise<PlayStatus>;
      playGameOnly: (active?: boolean) => Promise<boolean>;
      onPlayCursor: (callback: (cursor: PlayCursor | null) => void) => () => void;
      onPlayGameOnly: (callback: (active: boolean) => void) => () => void;
      onPlayStatus: (callback: (status: PlayStatus) => void) => () => void;
      setupStatus: () => Promise<import("../setupStatus").SetupStatus>;
      loadConfig: () => Promise<any>;
      saveConfig: (config: any) => Promise<any>;
      openFolder: () => Promise<string | null>;
      importFolder: (folderPath: string, targetPlayer: string) => Promise<any>;
      importAndAnalyze: (filePaths: string[], targetPlayer: string) => Promise<any>;
      analyzeReplays: (replayPaths: string[], targetPlayer: string, streamId?: string) => Promise<string>;
      analyzeRecent: (count: number, targetPlayer: string, streamId?: string) => Promise<string>;
      analyzeTrends: (trendSummary: string) => Promise<string>;
      analyzeScoped: (scope: string, id: string | number, targetPlayer?: string, streamId?: string) => Promise<string>;
      generateDossier: (opponentKey: string, targetPlayer?: string, streamId?: string) => Promise<string>;
      analyzeDiscovery: (streamId?: string) => Promise<string>;
      analyzeCharacterBlurb: (character: string, force?: boolean) => Promise<CharacterBlurbResult>;
      analyzeSession: (date: string, force?: boolean) => Promise<string>;
      generatePracticePlan: (weaknessSummary: string) => Promise<{
        id: number;
        name: string;
        weaknessSummary: string | null;
        createdAt: string;
        drills: Array<{ id: number; name: string; target: string; completed: boolean; sortOrder: number }>;
      }>;
      listPracticePlans: () => Promise<Array<{
        id: number;
        name: string;
        weaknessSummary: string | null;
        createdAt: string;
        drills: Array<{ id: number; name: string; target: string; completed: boolean; sortOrder: number }>;
      }>>;
      setDrillCompletion: (drillId: number, completed: boolean) => Promise<boolean>;
      deletePracticePlan: (planId: number) => Promise<boolean>;
      oracleListMessages: () => Promise<Array<{ id: number; role: "user" | "assistant"; content: string; createdAt: string }>>;
      oracleAsk: (text: string) => Promise<{
        user: { id: number; role: "user"; content: string; createdAt: string };
        assistant: { id: number; role: "assistant"; content: string; createdAt: string };
      }>;
      oracleClear: () => Promise<boolean>;
      getLLMModels: () => Promise<any[]>;
      getCurrentModel: () => Promise<{ modelId: string; label: string }>;
      fetchOpenRouterModels: () => Promise<any[]>;
      fetchAllModels: () => Promise<Record<string, Array<{ id: string; label: string; provider: LlmProviderId }>>>;
      startProviderSpeech: (request: ProviderSpeechRequest) => Promise<boolean>;
      cancelProviderSpeech: (requestId: string) => Promise<boolean>;
      onProviderSpeechEvent: (callback: (event: ProviderSpeechEvent) => void) => () => void;
      getQueueStatus: () => Promise<{ pending: number; processing: boolean }>;
      getOverallRecord: () => Promise<any>;
      getMatchupRecords: () => Promise<any[]>;
      getStageRecords: () => Promise<any[]>;
      getRecentGames: (limit: number) => Promise<any[]>;
      getLibraryGames: (filters: {
        search?: string;
        char?: string;
        stage?: string;
        result?: string;
        limit?: number;
        offset?: number;
      }) => Promise<{
        games: Array<
          Record<string, unknown> & {
            id: number;
            searchTechniqueMatch: boolean;
            searchMatches: Array<{
              id: number;
              type: string;
              label: string;
              description: string;
              startFrame: number;
              timestamp: string;
              didKill: boolean;
            }>;
          }
        >;
        total: number;
        totalUnfiltered: number;
        wins: number;
        losses: number;
        uniqueOpponents: number;
        charactersPlayed: number;
        characters: string[];
        stages: string[];
      }>;
      getLatestAnalysis: () => Promise<any[]>;
      getOpponents: (search?: string) => Promise<any[]>;
      clearAllGames: () => Promise<boolean>;
      getSets: () => Promise<any[]>;
      getCharacterList: () => Promise<any[]>;
      getCharacterMatchups: (character: string) => Promise<any[]>;
      getCharacterStageStats: (character: string) => Promise<any[]>;
      getCharacterTechniqueExamples: (character: string, key: string) => Promise<import("../characterTechniqueExamples").CharacterTechniqueExample[]>;
      getCharacterSignatureStats: (character: string) => Promise<any>;
      getCharacterGameStats: (character: string) => Promise<any[]>;
      getCharacterEventProfile: (character: string) => Promise<CharacterEventProfile>;
      getOpponentDetail: (opponentKey: string) => Promise<any>;
      getDashboardHighlights: () => Promise<any>;
      getGameHighlights: (gameId: number) => Promise<any[]>;
      getRecentHighlights: (limit: number) => Promise<any[]>;
      getAnalysisHistory: (limit: number, offset: number, scopeFilter?: string) => Promise<any[]>;
      getGameDetail: (gameId: number) => Promise<any>;
      getSessionsByDay: (daysBack?: number) => Promise<Array<{
        date: string;
        games: number;
        wins: number;
        losses: number;
        draws: number;
        opponents: string[];
        gameIds: number[];
        gameResults: Array<{ id: number; result: "win" | "loss" | "draw" | string }>;
      }>>;
      getTrendSeries: (
        metric:
          | "neutralWinRate"
          | "lCancelRate"
          | "conversionRate"
          | "avgDamagePerOpening"
          | "openingsPerKill"
          | "avgDeathPercent",
        range: "7d" | "30d" | "all",
        filterChar: string | null,
      ) => Promise<Array<{ playedAt: string; value: number }>>;
      getTrendSeriesBundle: (
        range: "7d" | "30d" | "all",
        filterChar: string | null,
      ) => Promise<
        Record<
          | "neutralWinRate"
          | "lCancelRate"
          | "conversionRate"
          | "avgDamagePerOpening"
          | "openingsPerKill"
          | "avgDeathPercent",
          Array<{ playedAt: string; value: number }>
        >
      >;
      getPerformanceHub: () => Promise<PerformanceHub>;
      getTrainingLog: (limit?: number) => Promise<TrainingLogEntry[]>;
      createTrainingLog: (entry: CreateTrainingLogEntry) => Promise<TrainingLogEntry>;
      getGameReviewNotes: (gameId: number) => Promise<GameReviewNote[]>;
      addGameReviewNote: (
        gameId: number,
        note: { content: string; author?: string; category?: string },
      ) => Promise<GameReviewNote>;
      openInDolphin: (replayPath: string) => Promise<boolean>;
      openInDolphinAtFrame: (replayPath: string, frame: number, endFrame?: number) => Promise<boolean>;
      embedReplayOpen: (
        replayPath: string,
        bounds: { x: number; y: number; width: number; height: number },
        startFrame?: number,
        endFrame?: number,
      ) => Promise<{ embedded: boolean; sessionId?: string; reason?: string }>;
      embedReplaySeek: (sessionId: string, frame: number, endFrame?: number) => Promise<boolean>;
      embedReplaySetBounds: (
        sessionId: string,
        bounds: { x: number; y: number; width: number; height: number },
      ) => Promise<boolean>;
      embedReplayClose: (sessionId: string) => Promise<boolean>;
      embedReplaySendKey: (sessionId: string, vk: number) => Promise<boolean>;
      onEmbedReplayReady: (callback: (sessionId: string) => void) => () => void;
      onEmbedReplayError: (callback: (sessionId: string, message: string) => void) => () => void;
      onEmbedReplayExited: (callback: (sessionId: string) => void) => () => void;
      getStockTimeline: (replayPath: string) => Promise<any>;
      openFileDialog: (title: string, filters: { name: string; extensions: string[] }[]) => Promise<string | null>;
      startWatcher: (replayFolder: string, targetPlayer: string) => Promise<boolean>;
      stopWatcher: () => Promise<boolean>;
      onImported: (callback: (result: any) => void) => () => void;
      onWatcherError: (callback: (message: string) => void) => () => void;
      onImportProgress: (
        callback: (progress: {
          current: number;
          total: number;
          lastFile: string;
          importedSoFar: number;
          skippedSoFar: number;
          errorsSoFar: number;
          lastError?: string;
          lastFileStatus: "imported" | "skipped" | "error";
        }) => void,
      ) => () => void;
      onAnalysisStream: (callback: (chunk: string, streamId?: string) => void) => () => void;
      onAnalysisStreamEnd: (callback: (streamId?: string) => void) => () => void;
      cornermanStart: (replayFolder: string, targetPlayer: string) => Promise<CornermanStatus>;
      cornermanStop: () => Promise<CornermanStatus>;
      cornermanStatus: () => Promise<CornermanStatus>;
      cornermanLiveStatsLatest: () => Promise<CornermanLiveSnapshot | null>;
      onCornermanLiveStats: (callback: (snapshot: CornermanLiveSnapshot) => void) => () => void;
      onCornermanStream: (callback: (chunk: string) => void) => () => void;
      onCornermanCard: (callback: (card: CornermanCard) => void) => () => void;
      onCornermanSetUpdate: (callback: (status: CornermanStatus) => void) => () => void;
      onCornermanLiveEvent: (callback: (event: CornermanLiveEvent) => void) => () => void;
      onCornermanError: (callback: (message: string) => void) => () => void;
    };
  }
}

interface PerformanceMetric {
  key:
    | "neutralWinRate"
    | "conversionRate"
    | "avgDamagePerOpening"
    | "openingsPerKill"
    | "recoverySuccessRate"
    | "avgDeathPercent"
    | "lCancelRate"
    | "edgeguardSuccessRate"
    | "diSurvivalScore";
  label: string;
  current: number;
  baseline: number | null;
  delta: number | null;
  higherIsBetter: boolean;
  winValue: number | null;
  lossValue: number | null;
}

interface PerformanceHub {
  sample: { currentGames: number; baselineGames: number; gamesScanned: number };
  metrics: PerformanceMetric[];
  insights: Array<{ kind: "progress" | "focus" | "winSignal"; title: string; detail: string }>;
  reviewQueue: Array<{
    id: number;
    playedAt: string | null;
    playerCharacter: string;
    opponentCharacter: string;
    opponentTag: string;
    stage: string;
    playerFinalStocks: number;
    opponentFinalStocks: number;
    reviewReason: string;
    priority: "high" | "medium";
    noteCount: number;
  }>;
}

interface TrainingLogEntry {
  id: number;
  loggedAt: string;
  activityType: string;
  minutes: number;
  focus: string;
  energy: number | null;
  confidence: number | null;
  notes: string;
  createdAt: string;
}

interface CreateTrainingLogEntry {
  loggedAt?: string;
  activityType: string;
  minutes: number;
  focus?: string;
  energy?: number | null;
  confidence?: number | null;
  notes?: string;
}

interface GameReviewNote {
  id: number;
  gameId: number;
  author: string;
  category: string;
  content: string;
  createdAt: string;
}

export {};
