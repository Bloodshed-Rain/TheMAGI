import { loadConfig } from "../../config.js";
import { MODELS, LLM_DEFAULTS, getModelLabel, type ProviderId } from "../../llm.js";
import { llmQueue } from "../../llmQueue.js";
import type { SafeHandleFn } from "../ipc.js";

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
    const json = await res.json() as { data: { id: string; name: string }[] };
    return json.data
      .filter((m) => !m.id.includes(":free") || m.id.endsWith(":free"))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({ id: m.id, label: m.name, provider: "openrouter" as const }));
  } catch { return []; }
}

async function fetchGeminiModels(apiKey: string): Promise<FetchedModel[]> {
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) return [];
    const json = await res.json() as { models: { name: string; displayName: string; supportedGenerationMethods: string[] }[] };
    return json.models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({
        id: m.name.replace("models/", ""),
        label: m.displayName,
        provider: "gemini" as const,
      }));
  } catch { return []; }
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
    const json = await res.json() as { data: { id: string; display_name: string }[] };
    return json.data.map((m) => ({
      id: m.id,
      label: m.display_name || m.id,
      provider: "anthropic" as const,
    }));
  } catch { return []; }
}

async function fetchOpenAIModels(apiKey: string): Promise<FetchedModel[]> {
  try {
    const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const json = await res.json() as { data: { id: string; owned_by: string }[] };
    return json.data
      .filter((m) => /^(gpt-|o[134]-|chatgpt-)/.test(m.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({
        id: m.id,
        label: m.id,
        provider: "openai" as const,
      }));
  } catch { return []; }
}

export function registerLlmHandlers(safeHandle: SafeHandleFn): void {
  // Fetch OpenRouter models from main process (renderer is blocked by CSP)
  safeHandle("openrouter:models", async () => {
    const res = await fetchWithTimeout("https://openrouter.ai/api/v1/models");
    if (!res.ok) throw new Error(`OpenRouter API ${res.status}`);
    const json = await res.json() as { data: any[] };
    return json.data;
  });

  // Fetch models from all configured providers
  safeHandle("llm:fetch-all-models", async () => {
    const config = loadConfig();
    const openrouterKey = config.openrouterApiKey || process.env.OPENROUTER_API_KEY;
    const geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
    const anthropicKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;

    const fetches: Promise<FetchedModel[]>[] = [];
    const providers: ProviderId[] = [];

    if (openrouterKey) {
      fetches.push(fetchOpenRouterModels());
      providers.push("openrouter");
    }
    if (geminiKey) {
      fetches.push(fetchGeminiModels(geminiKey));
      providers.push("gemini");
    }
    if (anthropicKey) {
      fetches.push(fetchAnthropicModels(anthropicKey));
      providers.push("anthropic");
    }

    const results = await Promise.all(fetches);
    const byProvider: Record<string, FetchedModel[]> = {};
    for (let i = 0; i < providers.length; i++) {
      byProvider[providers[i]!] = results[i]!;
    }

    // OpenAI models are always available via the MAGI proxy — no key needed
    byProvider["openai"] = [
      { id: "gpt-4o-mini", label: "GPT-4o Mini (default)", provider: "openai" },
    ];

    // Always include local option
    byProvider["local"] = [{ id: "local", label: "Local Model (Ollama / LM Studio)", provider: "local" }];

    return byProvider;
  });

  // LLM models list — static fallback for the Settings UI
  safeHandle("llm:models", () => MODELS);
  safeHandle("llm:currentModel", () => {
    const config = loadConfig();
    const modelId = config.llmModelId ?? LLM_DEFAULTS.modelId;
    return { modelId, label: getModelLabel(modelId) };
  });

  // Queue status — so UI can show "3 analyses pending..."
  safeHandle("queue:status", () => ({
    pending: llmQueue.pending,
    processing: llmQueue.isProcessing,
  }));
}
