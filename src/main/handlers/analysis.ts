import crypto from "crypto";
import fs from "fs";
import { pipeline } from "stream/promises";
import { loadConfig } from "../../config.js";
import {
  CAREER_ALL_GAMES_LIMIT,
  CAREER_ANALYSIS_MIN_GAMES,
  CAREER_DRIFT_WINDOW_GAMES,
  CAREER_RECENT_WINDOW_GAMES,
  CAREER_TOP_CHARACTERS,
  CAREER_TOP_MATCHUPS,
  type CareerAnalysisResult,
} from "../../careerAnalysis.js";
import { EVENT_SAMPLE_GUARDS, type CharacterBlurbResult } from "../../characterEventProfile.js";
import { buildCoachingContext } from "../../coachingContext.js";
import {
  getDb,
  insertCoachingAnalysis,
  getPlayerHistory,
  getPatternData,
  getGamesBySession,
  getGameById,
  getAggregateStats,
  getCareerDrift,
  getCareerOverview,
  getCharacterEventProfile,
  getOpponentDetail,
  getDeepInsightsData,
  insertGame,
  insertGameStats,
  insertSignatureStats,
  insertHighlights,
  type AggregateStatsParams,
  type CareerOverview,
} from "../../db.js";
import {
  computeAdaptationSignals,
  findPlayerIdx,
  assembleUserPrompt,
  SYSTEM_PROMPT,
  COACHING_PROMPT_VERSION,
  assembleAggregatePrompt,
  SYSTEM_PROMPT_AGGREGATE,
  SYSTEM_PROMPT_CHARACTER_BLURB,
  assembleCareerPrompt,
  SYSTEM_PROMPT_CAREER,
  SYSTEM_PROMPT_SCOUT,
  assembleOpponentDossierPrompt,
  stripNulls,
  type CareerPromptData,
  type GameResult,
  type PatternData,
} from "../../pipeline/index.js";
import { formatPatternBreakdown, formatRecurringPatterns } from "../../pipeline/patterns.js";
import { callLLM, callLLMStream, getActiveModelId, isUsableLLMResponse, type LLMConfig } from "../../llm.js";
import { llmQueue } from "../../llmQueue.js";
import { parsePool } from "../../parsePool.js";
import { buildInsertGameParams, buildInsertGameStatsParams } from "../../replayAnalyzer.js";
import { type SafeHandleFn, validatePath } from "../ipc.js";
import { getMainWindow } from "../state.js";

/** Async streaming SHA-256 hash — avoids blocking main thread on large files */
async function hashFileAsync(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest("hex");
}

/** Build LLMConfig from user config. The provider abstraction handles env-var
 *  fallbacks. Returns modelId=null when no provider/model is selected — the
 *  LLM call will throw a clear error in that case. */
export function resolveLLMConfig(): LLMConfig {
  const config = loadConfig();
  return {
    modelId: getActiveModelId(config),
    activeProvider: config.activeProvider,
    apiKeys: config.apiKeys,
    localEndpoint: config.localEndpoint ?? null,
    azureEndpoint: config.azureEndpoint ?? null,
  };
}

/**
 * Shared multi-game analysis logic used by analyze:run, analyze:recent and
 * session scope. `excludeGameIds` = DB rows for the games being analyzed, so
 * the recurring-pattern history does not count them twice.
 */
function runMultiGameAnalysis(
  gameResults: GameResult[],
  targetPlayer: string,
  excludeGameIds: number[] = [],
): { targetTag: string; userPrompt: string } {
  const firstGame = gameResults[0]!.gameSummary;
  const targetTag =
    targetPlayer || firstGame.players.find((p) => p.tag.toLowerCase() !== "unknown")?.tag || firstGame.players[0].tag;

  if (gameResults.length >= 2) {
    const p0Tag = firstGame.players[0].tag;
    const p1Tag = firstGame.players[1].tag;
    const p0Signals = computeAdaptationSignals(gameResults, p0Tag);
    const p1Signals = computeAdaptationSignals(gameResults, p1Tag);
    const lastResult = gameResults[gameResults.length - 1]!;
    const lastP0Idx = findPlayerIdx(lastResult.gameSummary, p0Tag);
    const lastP1Idx = findPlayerIdx(lastResult.gameSummary, p1Tag);
    lastResult.derivedInsights[lastP0Idx].adaptationSignals = p0Signals;
    lastResult.derivedInsights[lastP1Idx].adaptationSignals = p1Signals;
  }

  const { background, patterns } = buildCoachingContext(gameResults, targetTag, excludeGameIds);
  const userPrompt = assembleUserPrompt(gameResults, targetTag, background, patterns);
  return { targetTag, userPrompt };
}

/** Aggregate scopes get the same measured-pattern block: the scope vs the player's overall baseline. */
function aggregatePatternLines(scope: string, id: string): string {
  try {
    const scoped =
      scope === "character"
        ? getPatternData({ label: `as ${id}`, character: id })
        : scope === "stage"
          ? getPatternData({ label: `on ${id}`, stage: id })
          : scope === "opponent"
            ? getPatternData({ label: "vs this opponent", opponentKey: id })
            : null;
    const baseline = getPatternData({ label: "all your games" });
    const lines = formatRecurringPatterns({ matchup: scoped, character: baseline });
    if (lines.length === 0) return "";
    return [
      "",
      "=== MEASURED PATTERNS — this scope vs your overall baseline (primary evidence for habits; findings stay inside the scope) ===",
      ...lines,
    ].join("\n");
  } catch (err) {
    console.warn("[coaching] aggregate patterns unavailable:", err instanceof Error ? err.message : err);
    return "";
  }
}

export function registerAnalysisHandlers(safeHandle: SafeHandleFn): void {
  // Analyze — deduplicated. Returns cached analysis if already exists.
  // Streams LLM chunks to the renderer via "analyze:stream" IPC events when possible.
  safeHandle("analyze:run", async (_e, replayPaths: string[], targetPlayer: string, streamId?: string) => {
    const safePaths = replayPaths.map(validatePath);
    const llmConfig = resolveLLMConfig();
    const win = getMainWindow();

    const db = getDb();
    const fileHashes = await Promise.all(safePaths.map((p) => hashFileAsync(p)));
    const existingIds = fileHashes.map(
      (h) =>
        (db.prepare("SELECT id FROM games WHERE replay_hash = ?").get(h) as { id: number } | undefined)?.id ?? null,
    );

    // Check DB cache for single replays — skip LLM if already analyzed with the current prompt
    if (safePaths.length === 1 && existingIds[0] != null) {
      const cachedAnalysis = db
        .prepare(
          "SELECT analysis_text FROM coaching_analyses WHERE game_id = ? AND scope = 'game' AND prompt_version = ? ORDER BY created_at DESC LIMIT 1",
        )
        .get(existingIds[0], COACHING_PROMPT_VERSION) as { analysis_text: string } | undefined;
      if (cachedAnalysis) {
        return cachedAnalysis.analysis_text;
      }
      // Not cached — fall through to streaming path
    }

    // Multi-replay (set analysis) — parse off main thread via pool
    const gameResults = await parsePool.parseMany(safePaths);

    if (gameResults.length === 0) {
      throw new Error("No games to analyze.");
    }

    const { targetTag, userPrompt } = runMultiGameAnalysis(
      gameResults,
      targetPlayer,
      existingIds.filter((id): id is number => id != null),
    );

    // Use streaming when a window is available to receive chunks
    const analysis = await llmQueue.enqueue(() =>
      callLLMStream({ systemPrompt: SYSTEM_PROMPT, userPrompt, config: llmConfig }, (chunk) => {
        try {
          win?.webContents.send("analyze:stream", chunk, streamId);
        } catch {
          // Window may have been closed during streaming — ignore
        }
      }),
    );

    // Signal streaming is done
    try {
      win?.webContents.send("analyze:stream-end", streamId);
    } catch {
      // ignore
    }

    // Persist game data for each replay so stats/trends/dedup work
    const gameIds: number[] = [];
    for (let i = 0; i < gameResults.length; i++) {
      const gameResult = gameResults[i]!;
      const filePath = safePaths[i]!;
      const fileHash = fileHashes[i] ?? (await hashFileAsync(filePath));

      const existing = db.prepare("SELECT id FROM games WHERE replay_hash = ?").get(fileHash) as
        | { id: number }
        | undefined;

      if (existing) {
        gameIds.push(existing.id);
      } else {
        const gameParams = buildInsertGameParams(gameResult, targetTag, filePath, fileHash, null);
        const gameId = insertGame(gameParams);
        insertGameStats(buildInsertGameStatsParams(gameId, gameResult, targetTag));
        const playerIdx = findPlayerIdx(gameResult.gameSummary, targetTag);
        const player = gameResult.gameSummary.players[playerIdx];
        if (player.signatureStats) {
          insertSignatureStats(gameId, JSON.stringify(player.signatureStats));
        }
        const playerHighlights = gameResult.highlights[playerIdx];
        if (playerHighlights && playerHighlights.length > 0) {
          insertHighlights(gameId, playerHighlights);
        }
        gameIds.push(gameId);
      }
    }

    insertCoachingAnalysis(
      gameIds[0] ?? null,
      null,
      llmConfig.modelId || "pollinations",
      analysis,
      undefined,
      undefined,
      undefined,
      COACHING_PROMPT_VERSION,
    );

    return analysis;
  });

  // Unified scoped analysis handler
  safeHandle("analyze:scoped", async (_e, scope: string, id: any, targetPlayer?: string, streamId?: string) => {
    const llmConfig = resolveLLMConfig();
    const win = getMainWindow();
    const db = getDb();

    // Check cache for ALL scopes (ignore model_used to reuse any past analysis),
    // but only analyses written with the current coaching prompt.
    let cachedCandidates: { analysis_text: string }[];
    if (scope === "game") {
      cachedCandidates = db
        .prepare(
          "SELECT analysis_text FROM coaching_analyses WHERE game_id = ? AND scope = 'game' AND prompt_version = ? ORDER BY created_at DESC LIMIT 10",
        )
        .all(Number(id), COACHING_PROMPT_VERSION) as { analysis_text: string }[];
    } else if (scope === "session") {
      cachedCandidates = db
        .prepare(
          "SELECT analysis_text FROM coaching_analyses WHERE session_id = ? AND prompt_version = ? ORDER BY created_at DESC LIMIT 10",
        )
        .all(Number(id), COACHING_PROMPT_VERSION) as { analysis_text: string }[];
    } else {
      cachedCandidates = db
        .prepare(
          "SELECT analysis_text FROM coaching_analyses WHERE scope = ? AND scope_identifier = ? AND prompt_version = ? ORDER BY created_at DESC LIMIT 10",
        )
        .all(scope, String(id), COACHING_PROMPT_VERSION) as { analysis_text: string }[];
    }
    const cached = cachedCandidates.find((entry) => isUsableLLMResponse(entry.analysis_text));
    if (cached) return cached.analysis_text;

    let systemPrompt = SYSTEM_PROMPT;
    let userPrompt = "";
    let gameIdForCache: number | null = null;
    let sessionIdForCache: number | null = null;

    if (scope === "game") {
      const game = getGameById(Number(id));
      if (!game) throw new Error("Game not found");
      const result = await parsePool.parse(game.replay_path, 1);
      const tag = targetPlayer || game.player_tag;
      const { background, patterns } = buildCoachingContext([result], tag, [game.id]);
      userPrompt = assembleUserPrompt([result], tag, background, patterns);
      gameIdForCache = game.id;
    } else if (scope === "session") {
      const sessionId = Number(id);
      const games = getGamesBySession(sessionId);
      if (games.length === 0) throw new Error("No games found for session");
      const gameResults = await parsePool.parseMany(games.map((g) => g.replay_path));
      const { userPrompt: prompt } = runMultiGameAnalysis(
        gameResults,
        targetPlayer || "",
        games.map((g) => g.id),
      );
      userPrompt = prompt;
      sessionIdForCache = sessionId;
    } else if (scope === "career") {
      // The Dashboard's all-games analysis; this path shares its cache and stream.
      const career = await runCareerAnalysis(false, streamId);
      if (career.insufficient) {
        throw new Error(
          `Import at least ${CAREER_ANALYSIS_MIN_GAMES} games for an analysis of your whole record (${career.gamesPlayed} so far).`,
        );
      }
      return career.text;
    } else if (scope === "character" || scope === "stage" || scope === "opponent") {
      // Each scope is the player's own games filtered one way; the lifetime
      // profile stays out so the report cannot drift to other characters.
      const filters: AggregateStatsParams = {};
      if (scope === "character") filters.character = String(id);
      if (scope === "stage") filters.stage = String(id);
      if (scope === "opponent") filters.opponentKey = String(id);

      const stats = getAggregateStats(filters);
      if (!stats) throw new Error("No data found for this scope");

      systemPrompt = SYSTEM_PROMPT_AGGREGATE;
      userPrompt =
        assembleAggregatePrompt(stats, scope, String(id), { lifetimeGames: getCareerOverview().games }) +
        aggregatePatternLines(scope, String(id));
    } else {
      throw new Error(`Invalid analysis scope: ${scope}`);
    }

    const analysis = await llmQueue.enqueue(() => {
      // A character report is short enough to validate before showing it. Some
      // automatic/free routers occasionally return only "User Safety: safe".
      if (scope === "character") {
        return callLLM({ systemPrompt, userPrompt, config: llmConfig });
      }

      return callLLMStream({ systemPrompt, userPrompt, config: llmConfig }, (chunk) => {
        try {
          win?.webContents.send("analyze:stream", chunk, streamId);
        } catch {
          // ignore
        }
      });
    });

    if (!isUsableLLMResponse(analysis)) {
      throw new Error("The AI provider returned a status message instead of an analysis. Please try again.");
    }

    try {
      win?.webContents.send("analyze:stream-end", streamId);
    } catch {
      // ignore
    }

    insertCoachingAnalysis(
      gameIdForCache,
      sessionIdForCache,
      llmConfig.modelId || "pollinations",
      analysis,
      scope,
      String(id),
      undefined,
      COACHING_PROMPT_VERSION,
    );
    return analysis;
  });

  // Opponent scouting dossier — scout-framed, streamed over the shared analyze:stream
  // channel, cached under scope='dossier'. Phase B will pass real tendencies (4th arg).
  safeHandle("analyze:dossier", async (_e, opponentKey: string, targetPlayer?: string, streamId?: string) => {
    const llmConfig = resolveLLMConfig();
    const win = getMainWindow();
    const db = getDb();

    const cached = db
      .prepare(
        "SELECT analysis_text FROM coaching_analyses WHERE scope = 'dossier' AND scope_identifier = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(String(opponentKey)) as { analysis_text: string } | undefined;
    if (cached) {
      try {
        win?.webContents.send("analyze:stream", cached.analysis_text, streamId);
        win?.webContents.send("analyze:stream-end", streamId);
      } catch {
        // window may have closed
      }
      return cached.analysis_text;
    }

    const detail = getOpponentDetail(String(opponentKey));
    if (!detail || detail.totalGames === 0) throw new Error("No games found against this opponent.");

    const headToHead = {
      opponentTag: detail.opponentTag,
      wins: detail.wins,
      losses: detail.losses,
      totalGames: detail.totalGames,
      winRate: detail.winRate,
      characterBreakdown: detail.characterBreakdown,
      stageBreakdown: detail.stageBreakdown,
    };
    const yourStatsVsThem = getAggregateStats({ opponentKey: String(opponentKey) });
    const playerHistory = targetPlayer ? (getPlayerHistory(targetPlayer) ?? null) : null;

    const userPrompt = assembleOpponentDossierPrompt(headToHead, yourStatsVsThem, playerHistory, null);

    const analysis = await llmQueue.enqueue(() =>
      callLLMStream({ systemPrompt: SYSTEM_PROMPT_SCOUT, userPrompt, config: llmConfig }, (chunk) => {
        try {
          win?.webContents.send("analyze:stream", chunk, streamId);
        } catch {
          // ignore
        }
      }),
    );

    try {
      win?.webContents.send("analyze:stream-end", streamId);
    } catch {
      // ignore
    }

    insertCoachingAnalysis(
      null,
      null,
      llmConfig.modelId || "pollinations",
      analysis,
      "dossier",
      String(opponentKey),
      `${detail.opponentTag} Dossier`,
    );
    return analysis;
  });

  // Character identity blurb — short scouting-report summary of how the player
  // pilots one character, grounded in the v10-v14 per-instance event profile.
  // Non-streaming; cached under scope='character-blurb' until force-refreshed.
  safeHandle(
    "analyze:characterBlurb",
    async (_e, character: string, force?: boolean): Promise<CharacterBlurbResult> => {
      const stats = getAggregateStats({ character });
      const gamesPlayed = stats?.gamesPlayed ?? 0;
      if (!stats || gamesPlayed < EVENT_SAMPLE_GUARDS.blurbGamesMin) {
        return { insufficient: true, gamesPlayed };
      }

      const db = getDb();
      if (!force) {
        const cached = db
          .prepare(
            "SELECT analysis_text, model_used, created_at FROM coaching_analyses WHERE scope = 'character-blurb-plain-v2' AND scope_identifier = ? ORDER BY created_at DESC LIMIT 1",
          )
          .get(character) as { analysis_text: string; model_used: string; created_at: string } | undefined;
        if (cached) {
          return {
            text: cached.analysis_text,
            modelUsed: cached.model_used,
            createdAt: cached.created_at,
            cached: true,
          };
        }
      }

      const llmConfig = resolveLLMConfig();
      const events = getCharacterEventProfile(character);
      const userPrompt =
        assembleAggregatePrompt(stats, "character", character, { lifetimeGames: getCareerOverview().games }) +
        "\n\nPER-INSTANCE EVENT PROFILE (measured, with sample sizes):\n" +
        JSON.stringify(stripNulls(events));

      const text = await llmQueue.enqueue(() =>
        callLLM({ systemPrompt: SYSTEM_PROMPT_CHARACTER_BLURB, userPrompt, config: llmConfig }),
      );

      const modelUsed = llmConfig.modelId || "pollinations";
      insertCoachingAnalysis(null, null, modelUsed, text, "character-blurb-plain-v2", character);
      return { text, modelUsed, createdAt: new Date().toISOString(), cached: false };
    },
  );

  // All-games ("career") coaching — the Dashboard's analysis. See runCareerAnalysis.
  safeHandle("analyze:career", async (_e, force?: boolean, streamId?: string) => runCareerAnalysis(!!force, streamId));
}

/**
 * The career prompt's inputs, all from the database: overview and drift
 * (db.ts), measured patterns for the recent window vs the whole record, the
 * same measures per main character and per common opponent character, and the
 * descriptive win/loss separators. Rows for a character or matchup with fewer
 * than CAREER_ANALYSIS_MIN_GAMES games are left out rather than shown as noise.
 */
function buildCareerPromptData(overview: CareerOverview): CareerPromptData {
  const config = loadConfig();
  const tag = config.targetPlayer || config.connectCode || "the player";

  const all = getPatternData({ label: "all games", limit: CAREER_ALL_GAMES_LIMIT });
  const recent = getPatternData({
    label: `last ${CAREER_RECENT_WINDOW_GAMES} games`,
    limit: CAREER_RECENT_WINDOW_GAMES,
  });
  const recentVsAllLines = all
    ? formatRecurringPatterns({ character: all, matchup: recent && all.games > recent.games ? recent : null })
    : [];

  const present = (rows: (PatternData | null)[]): PatternData[] => rows.filter((p): p is PatternData => p != null);
  const byCharacterLines = formatPatternBreakdown(
    present(
      overview.characters
        .filter((c) => c.games >= CAREER_ANALYSIS_MIN_GAMES)
        .slice(0, CAREER_TOP_CHARACTERS)
        .map((c) =>
          getPatternData({ label: `as ${c.character}`, character: c.character, limit: CAREER_ALL_GAMES_LIMIT }),
        ),
    ),
  );
  const byMatchupLines = formatPatternBreakdown(
    present(
      overview.opponentCharacters
        .filter((m) => m.games >= CAREER_ANALYSIS_MIN_GAMES)
        .slice(0, CAREER_TOP_MATCHUPS)
        .map((m) =>
          getPatternData({
            label: `vs ${m.opponentCharacter}`,
            opponentCharacter: m.opponentCharacter,
            limit: CAREER_ALL_GAMES_LIMIT,
          }),
        ),
    ),
  );

  let determinants: CareerPromptData["determinants"] = null;
  try {
    determinants = getDeepInsightsData();
  } catch (err) {
    console.warn("[coaching] win/loss determinants unavailable:", err instanceof Error ? err.message : err);
  }

  return {
    tag,
    overview,
    drift: getCareerDrift(CAREER_DRIFT_WINDOW_GAMES),
    recentVsAllLines,
    byCharacterLines,
    byMatchupLines,
    determinants,
  };
}

/**
 * One cached career analysis per prompt version. `scope_identifier` stores
 * the game count it covered, so the Dashboard can say how many games a
 * refresh would add. Streams over analyze:stream like the other scopes.
 */
async function runCareerAnalysis(force: boolean, streamId?: string): Promise<CareerAnalysisResult> {
  const overview = getCareerOverview();
  if (overview.games < CAREER_ANALYSIS_MIN_GAMES) {
    return { insufficient: true, gamesPlayed: overview.games, minGames: CAREER_ANALYSIS_MIN_GAMES };
  }

  const db = getDb();
  if (!force) {
    const rows = db
      .prepare(
        "SELECT analysis_text, model_used, created_at, scope_identifier FROM coaching_analyses WHERE scope = 'career' AND prompt_version = ? ORDER BY created_at DESC, id DESC LIMIT 5",
      )
      .all(COACHING_PROMPT_VERSION) as {
      analysis_text: string;
      model_used: string;
      created_at: string;
      scope_identifier: string | null;
    }[];
    const cached = rows.find((r) => isUsableLLMResponse(r.analysis_text));
    if (cached) {
      return {
        text: cached.analysis_text,
        gamesAnalyzed: Number(cached.scope_identifier) || overview.games,
        gamesNow: overview.games,
        modelUsed: cached.model_used,
        createdAt: cached.created_at,
        cached: true,
      };
    }
  }

  const llmConfig = resolveLLMConfig();
  const win = getMainWindow();
  const userPrompt = assembleCareerPrompt(buildCareerPromptData(overview));
  const analysis = await llmQueue.enqueue(() =>
    callLLMStream({ systemPrompt: SYSTEM_PROMPT_CAREER, userPrompt, config: llmConfig }, (chunk) => {
      try {
        win?.webContents.send("analyze:stream", chunk, streamId);
      } catch {
        // ignore
      }
    }),
  );
  try {
    win?.webContents.send("analyze:stream-end", streamId);
  } catch {
    // ignore
  }
  if (!isUsableLLMResponse(analysis)) {
    throw new Error("The AI provider returned a status message instead of an analysis. Please try again.");
  }

  const modelUsed = llmConfig.modelId || "pollinations";
  insertCoachingAnalysis(
    null,
    null,
    modelUsed,
    analysis,
    "career",
    String(overview.games),
    undefined,
    COACHING_PROMPT_VERSION,
  );
  return {
    text: analysis,
    gamesAnalyzed: overview.games,
    gamesNow: overview.games,
    modelUsed,
    createdAt: new Date().toISOString(),
    cached: false,
  };
}
