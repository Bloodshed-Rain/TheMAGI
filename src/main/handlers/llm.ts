import { loadConfig } from "../../config.js";
import {
  getGamesOnDate,
  getSessionReport,
  setSessionReport,
  insertPracticePlan,
  listPracticePlans,
  setDrillCompletion,
  deletePracticePlan,
  listOracleMessages,
  appendOracleExchange,
  clearOracleMessages,
  getRecentGames,
  getPerformanceHub,
} from "../../db.js";
import { callLLMStream, callLLM, MODELS, getActiveModelId, getModelLabel, type ProviderId } from "../../llm.js";
import { llmQueue } from "../../llmQueue.js";
import { SYSTEM_PROMPT_SESSION, SYSTEM_PROMPT_PRACTICE, SYSTEM_PROMPT_ORACLE } from "../../pipeline/prompt.js";
import type { SafeHandleFn } from "../ipc.js";
import { resolveLLMConfig } from "./analysis.js";

interface FetchedModel {
  id: string;
  label: string;
  provider: ProviderId;
}

const FETCH_TIMEOUT = 8000;

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOpenRouterModels(): Promise<FetchedModel[]> {
  try {
    const res = await fetchWithTimeout("https://openrouter.ai/api/v1/models");
    if (!res.ok) return [];
    const json = (await res.json()) as { data: { id: string; name: string }[] };
    return json.data
      .filter((m) => !m.id.includes(":free") || m.id.endsWith(":free"))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({ id: m.id, label: m.name, provider: "openrouter" as const }));
  } catch {
    return [];
  }
}

async function fetchGeminiModels(apiKey: string): Promise<FetchedModel[]> {
  try {
    const res = await fetchWithTimeout("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      models: { name: string; displayName: string; supportedGenerationMethods: string[] }[];
    };
    return json.models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({
        id: m.name.replace("models/", ""),
        label: m.displayName,
        provider: "gemini" as const,
      }));
  } catch {
    return [];
  }
}

async function fetchAnthropicModels(apiKey: string): Promise<FetchedModel[]> {
  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: { id: string; display_name: string }[] };
    return json.data.map((m) => ({
      id: m.id,
      label: m.display_name || m.id,
      provider: "anthropic" as const,
    }));
  } catch {
    return [];
  }
}

async function fetchOpenAIModels(apiKey: string): Promise<FetchedModel[]> {
  try {
    const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: { id: string; owned_by: string }[] };
    return json.data
      .filter((m) => /^(gpt-|o[134]-|chatgpt-)/.test(m.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({
        id: m.id,
        label: m.id,
        provider: "openai" as const,
      }));
  } catch {
    return [];
  }
}

function buildOracleContext(): string {
  const games = getRecentGames(20);
  if (games.length === 0) return "No games in DB yet.";
  const lines = games.map(
    (g, i) =>
      `${i + 1}. ${g.playerCharacter} vs ${g.opponentCharacter} (${g.opponentTag}) — ${g.result.toUpperCase()} | neutral ${(g.neutralWinRate * 100).toFixed(0)}%, l-cancel ${(g.lCancelRate * 100).toFixed(0)}%, conv ${(g.conversionRate * 100).toFixed(0)}%, dmg/op ${g.avgDamagePerOpening.toFixed(1)}, edge ${(g.edgeguardSuccessRate * 100).toFixed(0)}%`,
  );
  return `Recent games (newest first):\n${lines.join("\n")}`;
}

export function registerLlmHandlers(safeHandle: SafeHandleFn): void {
  // Fetch OpenRouter models from main process (renderer is blocked by CSP)
  safeHandle("openrouter:models", async () => {
    const res = await fetchWithTimeout("https://openrouter.ai/api/v1/models");
    if (!res.ok) throw new Error(`OpenRouter API ${res.status}`);
    const json = (await res.json()) as { data: any[] };
    return json.data;
  });

  // Fetch models from each provider that has a configured key.
  // Providers without a key return an empty list so the UI can show
  // "configure key to load models".
  safeHandle("llm:fetch-all-models", async () => {
    const config = loadConfig();
    const openaiKey = config.apiKeys.openai || process.env.OPENAI_API_KEY;
    const openrouterKey = config.apiKeys.openrouter || process.env.OPENROUTER_API_KEY;
    const anthropicKey = config.apiKeys.anthropic || process.env.ANTHROPIC_API_KEY;
    const geminiKey = config.apiKeys.gemini || process.env.GEMINI_API_KEY;

    const fetches: Promise<FetchedModel[]>[] = [];
    const providers: ProviderId[] = [];

    if (openaiKey) {
      fetches.push(fetchOpenAIModels(openaiKey));
      providers.push("openai");
    }
    if (openrouterKey) {
      fetches.push(fetchOpenRouterModels());
      providers.push("openrouter");
    }
    if (anthropicKey) {
      fetches.push(fetchAnthropicModels(anthropicKey));
      providers.push("anthropic");
    }
    if (geminiKey) {
      fetches.push(fetchGeminiModels(geminiKey));
      providers.push("gemini");
    }

    const results = await Promise.all(fetches);
    const byProvider: Record<string, FetchedModel[]> = {
      openai: [],
      azure: [],
      openrouter: [],
      anthropic: [],
      gemini: [],
      local: [{ id: "local", label: "Local Model (Ollama / LM Studio)", provider: "local" }],
      pollinations: [{ id: "pollinations", label: "Pollinations Free AI", provider: "pollinations" }],
    };
    for (let i = 0; i < providers.length; i++) {
      byProvider[providers[i]!] = results[i]!;
    }

    return byProvider;
  });

  // LLM models list — static fallback for the Settings UI
  safeHandle("llm:models", () => MODELS);
  safeHandle("llm:currentModel", () => {
    const config = loadConfig();
    const modelId = getActiveModelId(config);
    return { modelId, label: modelId ? getModelLabel(modelId) : "(none selected)" };
  });

  // Queue status — so UI can show "3 analyses pending..."
  safeHandle("queue:status", () => ({
    pending: llmQueue.pending,
    processing: llmQueue.isProcessing,
  }));

  // Per-day session report — cached in session_reports table so repeat calls
  // for the same date return instantly without re-spending LLM tokens.
  safeHandle("llm:analyzeSession", async (_e, date: string, force: boolean = false) => {
    if (!force) {
      const cached = getSessionReport(date);
      if (cached) return cached;
    }

    const games = getGamesOnDate(date);
    if (games.length === 0) return "No games found for that day.";

    const wins = games.filter((g) => g.result === "win").length;
    const losses = games.filter((g) => g.result === "loss").length;

    const summary = [
      `Date: ${date}`,
      `Games: ${games.length} (${wins}W-${losses}L)`,
      "",
      ...games.map(
        (g, i) =>
          `Game ${i + 1}: ${g.playerCharacter} vs ${g.opponentCharacter} (${g.opponentTag}) on ${g.stage} — ${g.result.toUpperCase()} ${g.playerFinalStocks}-${g.opponentFinalStocks} | neutral ${(g.neutralWinRate * 100).toFixed(0)}%, l-cancel ${(g.lCancelRate * 100).toFixed(0)}%, conv ${(g.conversionRate * 100).toFixed(0)}%, dmg/op ${g.avgDamagePerOpening.toFixed(1)}`,
      ),
    ].join("\n");

    const llmConfig = resolveLLMConfig();
    const response = await llmQueue.enqueue(() =>
      callLLM({ systemPrompt: SYSTEM_PROMPT_SESSION, userPrompt: summary, config: llmConfig }),
    );
    setSessionReport(date, response);
    return response;
  });

  safeHandle("llm:generatePracticePlan", async (_e, weaknessSummary: string) => {
    const hub = getPerformanceHub();
    const baselineJson = JSON.stringify({ capturedAt: new Date().toISOString(), sampleGames: hub.sample.currentGames, latestReplayId: getRecentGames(1)[0]?.id ?? null, evidenceReplayId: hub.reviewQueue[0]?.id ?? null, metrics: hub.metrics.filter(metric => metric.current !== null).map(metric => ({ key: metric.key, label: metric.label, value: metric.current })) });
    const llmConfig = resolveLLMConfig();
    const raw = await llmQueue.enqueue(() =>
      callLLM({ systemPrompt: SYSTEM_PROMPT_PRACTICE + " Each drill target must include concrete setup, actions, repetitions or duration, and a measurable success criterion. Do not claim a drill caused a future improvement.", userPrompt: weaknessSummary, config: llmConfig }),
    );
    let parsed: unknown;
    try {
      const cleaned = raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`LLM returned non-JSON response: ${raw.slice(0, 140)}…`);
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("LLM response missing required fields (name, drills[]).");
    }
    const candidate = parsed as { name?: unknown; drills?: unknown };
    const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, 120) : "";
    const drills = Array.isArray(candidate.drills)
      ? candidate.drills
          .filter(
            (drill): drill is { name: string; target: string } =>
              !!drill &&
              typeof drill === "object" &&
              typeof (drill as { name?: unknown }).name === "string" &&
              typeof (drill as { target?: unknown }).target === "string",
          )
          .map((drill) => ({ name: drill.name.trim().slice(0, 120), target: drill.target.trim().slice(0, 500) }))
          .filter((drill) => drill.name.length > 0 && drill.target.length > 0)
          .slice(0, 12)
      : [];
    if (!name || drills.length === 0) {
      throw new Error("LLM response missing required fields (name, drills[]).");
    }
    const cleanSummary = weaknessSummary.trim().slice(0, 4000);
    return insertPracticePlan(name, cleanSummary || null, drills, baselineJson);
  });

  safeHandle("llm:listPracticePlans", () => listPracticePlans());

  safeHandle("llm:setDrillCompletion", (_e, drillId: number, completed: boolean) => {
    setDrillCompletion(drillId, completed);
    return true;
  });

  safeHandle("llm:deletePracticePlan", (_e, planId: number) => {
    deletePracticePlan(planId);
    return true;
  });

  safeHandle("llm:oracleListMessages", () => listOracleMessages());

  const oracleRequests = new Map<string, AbortController>();
  safeHandle("llm:oracleCancel", (event, requestId: string) => { oracleRequests.get(`${event.sender.id}:${requestId}`)?.abort(); return true; });
  safeHandle("llm:oracleAsk", async (_e, text: string, requestId: string = "legacy") => {
    if (typeof requestId !== "string" || requestId.length > 100) throw new Error("Invalid Oracle request.");
    const requestKey = `${_e.sender.id}:${requestId}`;
    if (oracleRequests.has(requestKey)) throw new Error("This question is already running.");
    const cleanText = text.trim().slice(0, 4000);
    if (!cleanText) throw new Error("Ask the Oracle a non-empty question.");
    const history = listOracleMessages();
    const dialog = [...history, { role: "user" as const, content: cleanText }]
      .slice(-20)
      .map((m) => `${m.role === "user" ? "User" : "Oracle"}: ${m.content}`)
      .join("\n\n");
    const context = buildOracleContext();
    const userPrompt = `${context}\n\n---\n\n${dialog}\n\nOracle:`;
    const llmConfig = resolveLLMConfig();
    const controller = new AbortController();
      oracleRequests.set(requestKey, controller);
      const send = (chunk: string, status: string) => { if (!_e.sender.isDestroyed()) _e.sender.send("oracle:stream", {requestId, chunk, status}); };
      send("", "Queued for coaching");
      try {
        const response = await llmQueue.enqueue(() => {
          controller.signal.throwIfAborted();
          send("", "Reading your replay context");
          return callLLMStream({ systemPrompt: SYSTEM_PROMPT_ORACLE, userPrompt, config: llmConfig, signal: controller.signal }, chunk => { if (!controller.signal.aborted) send(chunk, "Responding"); });
        });
        controller.signal.throwIfAborted();
        return appendOracleExchange(cleanText, response);
      } finally { oracleRequests.delete(requestKey); }
  });

  safeHandle("llm:oracleClear", () => {
      if (oracleRequests.size) throw new Error("Stop the current response before clearing history.");
    clearOracleMessages();
    return true;
  });
}
