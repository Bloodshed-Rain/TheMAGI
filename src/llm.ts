/**
 * Multi-LLM provider abstraction.
 *
 * Supports:
 *   - OpenAI direct
 *   - Azure OpenAI
 *   - OpenRouter (DeepSeek, Claude, etc.)
 *   - Anthropic direct (Claude)
 *   - Gemini direct
 *   - Local models via OpenAI-compatible API (Ollama, LM Studio)
 *
 * All providers share the same interface: system prompt + user prompt → text.
 * Every remote provider requires the user to supply their own API key.
 */

// ── Provider types ───────────────────────────────────────────────────

export type { ProviderId } from "./llmProviders";
import { PROVIDER_BY_ID, type ProviderId } from "./llmProviders";

export interface ModelOption {
  id: string; // model identifier sent to the API
  label: string; // human-readable name for the UI
  provider: ProviderId;
  costPer1kInput?: number; // USD per 1k input tokens (for cost estimates)
  costPer1kOutput?: number;
}

/** Static fallback list of suggested models, one per remote provider.
 *  Used by the Settings UI when dynamic model fetching hasn't run yet.
 *  Users can always type a custom model ID. */
export const MODELS: ModelOption[] = [
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "openai",
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek V3",
    provider: "openrouter",
    costPer1kInput: 0.00014,
    costPer1kOutput: 0.00028,
  },
  {
    id: "claude-sonnet-4-20250514",
    label: "Claude Sonnet 4",
    provider: "anthropic",
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
  {
    id: "local",
    label: "Local Model (Ollama / LM Studio)",
    provider: "local",
  },
  {
    id: "pollinations",
    label: "Pollinations Free AI",
    provider: "pollinations",
  },
];

/** No default — users must pick a provider and model in Settings. */
export const DEFAULT_MODEL_ID: string | null = null;

/** Get the provider for a given model ID */
export function getModelProvider(modelId: string): ProviderId {
  const found = MODELS.find((m) => m.id === modelId);
  if (found) return found.provider;
  // Heuristic for custom model IDs
  if (modelId.includes("/")) return "openrouter";
  if (modelId.startsWith("gemini")) return "gemini";
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId === "pollinations") return "pollinations";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) return "openai";
  return "local";
}

/** Get human-readable label for a model */
export function getModelLabel(modelId: string): string {
  return MODELS.find((m) => m.id === modelId)?.label ?? modelId;
}

// ── Provider config (stored in user config) ──────────────────────────

export interface LLMConfig {
  modelId: string | null; // null = no provider/model selected yet
  activeProvider: ProviderId | null;
  apiKeys: Partial<Record<ProviderId, string>>;
  localEndpoint: string | null; // e.g. "http://localhost:1234/v1"
  azureEndpoint: string | null; // e.g. "https://resource.openai.azure.com"
}

export const LLM_DEFAULTS: LLMConfig = {
  modelId: null,
  activeProvider: null,
  apiKeys: {},
  localEndpoint: null,
  azureEndpoint: null,
};

/** Resolve the active model from a config that has activeProvider + modelByProvider.
 *  Falls back to legacy `llmModelId` if present. Returns null when nothing is selected. */
export function getActiveModelId(config: {
  activeProvider?: ProviderId | null;
  modelByProvider?: Partial<Record<ProviderId, string>>;
  llmModelId?: string | null;
}): string | null {
  const provider = config.activeProvider ?? null;
  if (provider) {
    const m = config.modelByProvider?.[provider];
    if (m) return m;
  }
  return config.llmModelId ?? null;
}

/** Resolve an API key: user config first, then env var. */
export function getApiKey(provider: ProviderId, config: LLMConfig): string | null {
  const fromConfig = config.apiKeys[provider];
  if (fromConfig) return fromConfig;
  const info = PROVIDER_BY_ID[provider];
  if (info?.envVar) {
    const fromEnv = process.env[info.envVar];
    if (fromEnv) return fromEnv;
  }
  return null;
}

// ── Shared retry logic ───────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 120_000; // 2 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

class EmptyResponseError extends Error {
  constructor(detail: string) {
    super(`LLM returned empty text after ${MAX_RETRIES} attempts (${detail})`);
    this.name = "EmptyResponseError";
  }
}

/** Provider control/status messages are not usable model answers. */
export function isUsableLLMResponse(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  return !/^(?:(?:user|assistant|model)\s+)?safety\s*:\s*(?:safe|unsafe|unknown)\s*[.!]?$/i.test(normalized);
}

class InvalidResponseError extends Error {
  constructor() {
    super(
      "The AI provider returned a safety status instead of an analysis. Try again or choose a specific model instead of an automatic/free model router.",
    );
    this.name = "InvalidResponseError";
  }
}

// ── Main call function ───────────────────────────────────────────────

export interface CallLLMOptions {
  signal?: AbortSignal;
  systemPrompt: string;
  userPrompt: string;
  config: LLMConfig;
  /** Override model for this call (e.g. premium model for demos) */
  modelOverride?: string;
}

/** Thrown when no provider/model has been chosen in Settings. */
export class NoModelSelectedError extends Error {
  constructor() {
    super(
      "No AI model selected. Choose a provider and model in Settings (the free Pollinations provider needs no API key).",
    );
    this.name = "NoModelSelectedError";
  }
}

// Provider failures propagate to the caller — never silently reroute the
// user's gameplay data to a different service than the one they picked.
export async function callLLM(opts: CallLLMOptions): Promise<string> {
  const modelId = opts.modelOverride ?? opts.config.modelId;

  if (!modelId) {
    throw new NoModelSelectedError();
  }

  const provider = opts.modelOverride
    ? getModelProvider(modelId)
    : (opts.config.activeProvider ?? getModelProvider(modelId));

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let text: string;
    switch (provider) {
      case "openrouter":
        text = await callOpenRouter(opts.systemPrompt, opts.userPrompt, modelId, opts.config);
        break;
      case "gemini":
        text = await callGemini(opts.systemPrompt, opts.userPrompt, modelId, opts.config);
        break;
      case "anthropic":
        text = await callAnthropic(opts.systemPrompt, opts.userPrompt, modelId, opts.config);
        break;
      case "openai":
        text = await callOpenAI(opts.systemPrompt, opts.userPrompt, modelId, opts.config);
        break;
      case "azure":
        text = await callOpenAI(opts.systemPrompt, opts.userPrompt, modelId, opts.config, "azure");
        break;
      case "pollinations":
        text = await callPollinations(opts.systemPrompt, opts.userPrompt, modelId, opts.config);
        break;
      case "local":
        text = await callLocal(opts.systemPrompt, opts.userPrompt, modelId, opts.config);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    if (isUsableLLMResponse(text)) return text;
    if (attempt < MAX_RETRIES) {
      console.error(`AI provider returned status metadata, retrying (${attempt}/${MAX_RETRIES})...`);
    }
  }

  throw new InvalidResponseError();
}

// ── Streaming support ────────────────────────────────────────────────

/** Callback invoked for each text chunk during streaming */
export type StreamChunkCallback = (chunk: string) => void;

/**
 * Stream an LLM response, calling onChunk for each text fragment as it arrives.
 * Returns the full accumulated text when complete.
 */
export async function callLLMStream(opts: CallLLMOptions, onChunk: StreamChunkCallback): Promise<string> {
  opts.signal?.throwIfAborted();
  const modelId = opts.modelOverride ?? opts.config.modelId;

  if (!modelId) {
    throw new NoModelSelectedError();
  }

  const provider = opts.modelOverride
    ? getModelProvider(modelId)
    : (opts.config.activeProvider ?? getModelProvider(modelId));

  switch (provider) {
    case "gemini":
      return await callGeminiStream(opts.systemPrompt, opts.userPrompt, modelId, opts.config, onChunk, opts.signal);
    case "openrouter":
      return await callOpenRouterStream(opts.systemPrompt, opts.userPrompt, modelId, opts.config, onChunk, opts.signal);
    case "anthropic":
      return await callAnthropicStream(opts.systemPrompt, opts.userPrompt, modelId, opts.config, onChunk, opts.signal);
    case "openai":
      return await callOpenAIStream(opts.systemPrompt, opts.userPrompt, modelId, opts.config, onChunk, "openai", opts.signal);
    case "azure":
      return await callOpenAIStream(opts.systemPrompt, opts.userPrompt, modelId, opts.config, onChunk, "azure", opts.signal);
    case "pollinations":
      return await callPollinationsStream(opts.systemPrompt, opts.userPrompt, modelId, opts.config, onChunk, opts.signal);
    case "local":
      return await callLocalStream(opts.systemPrompt, opts.userPrompt, modelId, opts.config, onChunk, opts.signal);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Shared SSE reader for OpenAI-compatible streams ─────────────────

function consumeSseLines(buffer: string, onLine: (line: string) => void, flush: boolean = false): string {
  const lines = buffer.split(/\r?\n/);
  const remainder = flush ? "" : (lines.pop() ?? "");
  for (const line of lines) onLine(line);
  return remainder;
}

function getSseData(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  return trimmed.slice(5).trimStart();
}

/**
 * Reads an SSE stream from an OpenAI-compatible API (OpenRouter, OpenAI, Local).
 * Parses `data: {"choices":[{"delta":{"content":"..."}}]}` events.
 */
async function readOpenAICompatibleStream(
  response: Response,
  onChunk: StreamChunkCallback,
  timeoutHandle: ReturnType<typeof setTimeout>,
): Promise<string> {
  let accumulated = "";
  try {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Streaming response has no body");

    const decoder = new TextDecoder();
    let buffer = "";
    const processLine = (line: string) => {
      const dataText = getSseData(line);
      if (!dataText || dataText === "[DONE]") return;

      try {
        const data = JSON.parse(dataText) as {
          choices?: { delta?: { content?: string } }[];
        };
        const text = data.choices?.[0]?.delta?.content;
        if (text) {
          accumulated += text;
          onChunk(text);
        }
      } catch {
        // Malformed JSON chunk — skip
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = consumeSseLines(buffer, processLine);
    }
    buffer += decoder.decode();
    consumeSseLines(buffer, processLine, true);
  } finally {
    clearTimeout(timeoutHandle);
  }
  return accumulated;
}

// ── OpenRouter (OpenAI-compatible) ───────────────────────────────────

async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
): Promise<string> {
  const apiKey = getApiKey("openrouter", config);
  if (!apiKey) {
    throw new Error(
      "OpenRouter API key is not set. Add it in Settings or set the OPENROUTER_API_KEY environment variable.",
    );
  }

  const url = "https://openrouter.ai/api/v1/chat/completions";
  const body = JSON.stringify({
    model: modelId,
    max_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Bloodshed-Rain/TheMAGI",
        "X-Title": "MAGI",
      },
      body,
    });

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      if (attempt < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "", 10);
        await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : RETRY_DELAY_MS * attempt * 2);
        continue;
      }
      if (response.status === 429) {
        throw new Error("OpenRouter rate limit exceeded. Please try again in a moment.");
      }
      const errorBody = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const text = data.choices?.[0]?.message?.content;
    if (text) return text;

    if (attempt < MAX_RETRIES) {
      console.error(`OpenRouter returned empty response, retrying (${attempt}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY_MS * attempt);
    } else {
      throw new EmptyResponseError("empty choices");
    }
  }

  throw new EmptyResponseError("unknown");
}

// ── OpenRouter streaming ────────────────────────────────────────────

async function callOpenRouterStream(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getApiKey("openrouter", config);
  if (!apiKey) {
    throw new Error(
      "OpenRouter API key is not set. Add it in Settings or set the OPENROUTER_API_KEY environment variable.",
    );
  }

  const url = "https://openrouter.ai/api/v1/chat/completions";
  const body = JSON.stringify({
    model: modelId,
    max_tokens: 8192,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  let anyChunksSent = false;
  const wrappedOnChunk: StreamChunkCallback = (chunk) => {
    anyChunksSent = true;
    onChunk(chunk);
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/Bloodshed-Rain/TheMAGI",
          "X-Title": "MAGI",
        },
        body,
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      clearTimeout(timeout);
      if (attempt < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "", 10);
        await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : RETRY_DELAY_MS * attempt * 2);
        continue;
      }
      if (response.status === 429) throw new Error("OpenRouter rate limit exceeded. Please try again in a moment.");
      const errorBody = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
    }

    if (!response.ok) {
      clearTimeout(timeout);
      const errorBody = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
    }

    const accumulated = await readOpenAICompatibleStream(response, wrappedOnChunk, timeout);
    if (accumulated) return accumulated;

    // Only retry if no chunks were sent to the UI — prevents duplicate text on partial failures
    if (anyChunksSent) throw new EmptyResponseError("streaming returned partial text");

    if (attempt < MAX_RETRIES) {
      console.error(`OpenRouter stream returned empty, retrying (${attempt}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY_MS * attempt);
    } else {
      throw new EmptyResponseError("streaming returned no text");
    }
  }

  throw new EmptyResponseError("unknown");
}

// ── Gemini direct ────────────────────────────────────────────────────

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
): Promise<string> {
  const apiKey = getApiKey("gemini", config);
  if (!apiKey) {
    throw new Error("Gemini API key is not set. Add it in Settings or set the GEMINI_API_KEY environment variable.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens: 8192 },
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body,
    });

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt * 2);
        continue;
      }
      if (response.status === 429) {
        throw new Error("Gemini rate limit exceeded. Please try again in a moment.");
      }
      const errorBody = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        finishReason?: string;
      }[];
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text;

    const reason = data.candidates?.[0]?.finishReason ?? "unknown";
    if (attempt < MAX_RETRIES) {
      console.error(
        `Gemini returned empty response (finishReason: ${reason}), retrying (${attempt}/${MAX_RETRIES})...`,
      );
      await sleep(RETRY_DELAY_MS * attempt);
    } else {
      throw new EmptyResponseError(`finishReason: ${reason}`);
    }
  }

  throw new EmptyResponseError("unknown");
}

// ── Gemini streaming ─────────────────────────────────────────────────

async function callGeminiStream(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getApiKey("gemini", config);
  if (!apiKey) {
    throw new Error("Gemini API key is not set. Add it in Settings or set the GEMINI_API_KEY environment variable.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse`;
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens: 8192 },
  });

  let anyChunksSent = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body,
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      clearTimeout(timeout);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt * 2);
        continue;
      }
      if (response.status === 429) {
        throw new Error("Gemini rate limit exceeded. Please try again in a moment.");
      }
      const errorBody = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
    }

    if (!response.ok) {
      clearTimeout(timeout);
      const errorBody = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
    }

    // Parse the SSE stream
    let accumulated = "";
    try {
      const reader = response.body?.getReader();
      if (!reader) {
        clearTimeout(timeout);
        throw new Error("Gemini streaming response has no body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      const processLine = (line: string) => {
        const dataText = getSseData(line);
        if (!dataText || dataText === "[DONE]") return;

        try {
          const data = JSON.parse(dataText) as {
            candidates?: {
              content?: { parts?: { text?: string }[] };
            }[];
          };

          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            accumulated += text;
            anyChunksSent = true;
            onChunk(text);
          }
        } catch {
          // Malformed JSON chunk — skip it
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        buffer = consumeSseLines(buffer, processLine);
      }
      buffer += decoder.decode();
      consumeSseLines(buffer, processLine, true);
    } finally {
      clearTimeout(timeout);
    }

    if (accumulated) return accumulated;

    // Only retry if no chunks were sent to the UI — prevents duplicate text on partial failures
    if (anyChunksSent) throw new EmptyResponseError("streaming returned partial text");

    if (attempt < MAX_RETRIES) {
      console.error(`Gemini stream returned empty response, retrying (${attempt}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY_MS * attempt);
    } else {
      throw new EmptyResponseError("streaming returned no text");
    }
  }

  throw new EmptyResponseError("unknown");
}

// ── Anthropic direct (Messages API) ──────────────────────────────────

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
): Promise<string> {
  const apiKey = getApiKey("anthropic", config);
  if (!apiKey) {
    throw new Error(
      "Anthropic API key is not set. Add it in Settings or set the ANTHROPIC_API_KEY environment variable.",
    );
  }

  const url = "https://api.anthropic.com/v1/messages";
  const body = JSON.stringify({
    model: modelId,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body,
    });

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      if (attempt < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "", 10);
        await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : RETRY_DELAY_MS * attempt * 2);
        continue;
      }
      if (response.status === 429) {
        throw new Error("Anthropic rate limit exceeded. Please try again in a moment.");
      }
      const errorBody = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };

    const text = data.content?.find((b) => b.type === "text")?.text;
    if (text) return text;

    if (attempt < MAX_RETRIES) {
      console.error(`Anthropic returned empty response, retrying (${attempt}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY_MS * attempt);
    } else {
      throw new EmptyResponseError("empty content blocks");
    }
  }

  throw new EmptyResponseError("unknown");
}

// ── Anthropic streaming ─────────────────────────────────────────────

async function callAnthropicStream(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getApiKey("anthropic", config);
  if (!apiKey) {
    throw new Error(
      "Anthropic API key is not set. Add it in Settings or set the ANTHROPIC_API_KEY environment variable.",
    );
  }

  const url = "https://api.anthropic.com/v1/messages";
  const body = JSON.stringify({
    model: modelId,
    max_tokens: 8192,
    stream: true,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  let anyChunksSent = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body,
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      clearTimeout(timeout);
      if (attempt < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "", 10);
        await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : RETRY_DELAY_MS * attempt * 2);
        continue;
      }
      if (response.status === 429) throw new Error("Anthropic rate limit exceeded. Please try again in a moment.");
      const errorBody = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
    }

    if (!response.ok) {
      clearTimeout(timeout);
      const errorBody = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
    }

    // Anthropic uses a different SSE format: event: content_block_delta, data: {"delta":{"text":"..."}}
    let accumulated = "";
    try {
      const reader = response.body?.getReader();
      if (!reader) {
        clearTimeout(timeout);
        throw new Error("Streaming response has no body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      const processLine = (line: string) => {
        const dataText = getSseData(line);
        if (!dataText) return;

        try {
          const data = JSON.parse(dataText) as {
            type?: string;
            delta?: { type?: string; text?: string };
          };
          if (data.type === "content_block_delta" && data.delta?.text) {
            accumulated += data.delta.text;
            anyChunksSent = true;
            onChunk(data.delta.text);
          }
        } catch {
          // Malformed JSON — skip
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        buffer = consumeSseLines(buffer, processLine);
      }
      buffer += decoder.decode();
      consumeSseLines(buffer, processLine, true);
    } finally {
      clearTimeout(timeout);
    }

    if (accumulated) return accumulated;

    // Only retry if no chunks were sent to the UI — prevents duplicate text on partial failures
    if (anyChunksSent) throw new EmptyResponseError("streaming returned partial text");

    if (attempt < MAX_RETRIES) {
      console.error(`Anthropic stream returned empty, retrying (${attempt}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY_MS * attempt);
    } else {
      throw new EmptyResponseError("streaming returned no text");
    }
  }

  throw new EmptyResponseError("unknown");
}

// ── OpenAI and Azure OpenAI ─────────────────────────────────────────

type OpenAICloudProvider = "openai" | "azure";

function resolveAzureChatCompletionsUrl(config: LLMConfig): string {
  const endpoint = config.azureEndpoint?.trim() || process.env.AZURE_OPENAI_ENDPOINT?.trim();
  if (!endpoint) {
    throw new Error(
      "Azure OpenAI endpoint is not set. Add it in Settings or set the AZURE_OPENAI_ENDPOINT environment variable.",
    );
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Azure OpenAI endpoint must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Azure OpenAI endpoint must use HTTPS.");
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (!path) {
    url.pathname = "/openai/v1/chat/completions";
  } else if (/\/openai$/i.test(path)) {
    url.pathname = `${path}/v1/chat/completions`;
  } else if (/\/openai\/v1$/i.test(path)) {
    url.pathname = `${path}/chat/completions`;
  } else {
    url.pathname = `${path}/openai/v1/chat/completions`;
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function resolveOpenAIEndpoint(
  config: LLMConfig,
  provider: OpenAICloudProvider = "openai",
): { url: string; headers: Record<string, string> } {
  const apiKey = getApiKey(provider, config);
  if (!apiKey) {
    const envVar = PROVIDER_BY_ID[provider].envVar;
    throw new Error(
      `${PROVIDER_BY_ID[provider].label} API key is not set. Add it in Settings or set the ${envVar} environment variable.`,
    );
  }
  if (provider === "azure") {
    return {
      url: resolveAzureChatCompletionsUrl(config),
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
    };
  }
  return {
    url: "https://api.openai.com/v1/chat/completions",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
  provider: OpenAICloudProvider = "openai",
): Promise<string> {
  const body = JSON.stringify({
    model: modelId,
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const { url, headers } = resolveOpenAIEndpoint(config, provider);
  const providerLabel = PROVIDER_BY_ID[provider].label;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body,
    });

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      if (attempt < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "", 10);
        await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : RETRY_DELAY_MS * attempt * 2);
        continue;
      }
      if (response.status === 429) {
        throw new Error(`${providerLabel} rate limit exceeded. Please try again in a moment.`);
      }
      const errorBody = await response.text();
      throw new Error(`${providerLabel} API error (${response.status}): ${errorBody}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`${providerLabel} API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const text = data.choices?.[0]?.message?.content;
    if (text) return text;

    if (attempt < MAX_RETRIES) {
      console.error(`${providerLabel} returned empty response, retrying (${attempt}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY_MS * attempt);
    } else {
      throw new EmptyResponseError("empty choices");
    }
  }

  throw new EmptyResponseError("unknown");
}

// ── OpenAI streaming ────────────────────────────────────────────────

async function callOpenAIStream(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
  onChunk: StreamChunkCallback,
  provider: OpenAICloudProvider = "openai",
  signal?: AbortSignal,
): Promise<string> {
  const body = JSON.stringify({
    model: modelId,
    max_completion_tokens: 8192,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const { url, headers } = resolveOpenAIEndpoint(config, provider);
  const providerLabel = PROVIDER_BY_ID[provider].label;

  let anyChunksSent = false;
  const wrappedOnChunk: StreamChunkCallback = (chunk) => {
    anyChunksSent = true;
    onChunk(chunk);
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      clearTimeout(timeout);
      if (attempt < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "", 10);
        await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : RETRY_DELAY_MS * attempt * 2);
        continue;
      }
      if (response.status === 429) {
        throw new Error(`${providerLabel} rate limit exceeded. Please try again in a moment.`);
      }
      const errorBody = await response.text();
      throw new Error(`${providerLabel} API error (${response.status}): ${errorBody}`);
    }

    if (!response.ok) {
      clearTimeout(timeout);
      const errorBody = await response.text();
      throw new Error(`${providerLabel} API error (${response.status}): ${errorBody}`);
    }

    const accumulated = await readOpenAICompatibleStream(response, wrappedOnChunk, timeout);
    if (accumulated) return accumulated;

    // Only retry if no chunks were sent to the UI — prevents duplicate text on partial failures
    if (anyChunksSent) throw new EmptyResponseError("streaming returned partial text");

    if (attempt < MAX_RETRIES) {
      console.error(`${providerLabel} stream returned empty, retrying (${attempt}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY_MS * attempt);
    } else {
      throw new EmptyResponseError("streaming returned no text");
    }
  }

  throw new EmptyResponseError("unknown");
}

// ── Local (OpenAI-compatible: Ollama, LM Studio) ─────────────────────

async function callLocal(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
): Promise<string> {
  const endpoint = config.localEndpoint ?? "http://localhost:1234/v1";
  const url = `${endpoint}/chat/completions`;

  const body = JSON.stringify({
    model: modelId === "local" ? undefined : modelId,
    max_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(
          `Local model at ${endpoint} timed out after ${FETCH_TIMEOUT_MS / 1000}s. The model may be loading or the request may be too large.`,
        );
      }
      throw new Error(
        `Could not reach local model at ${endpoint}. Is Ollama or LM Studio running?\n${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Local model API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const text = data.choices?.[0]?.message?.content;
    if (text) return text;

    if (attempt < MAX_RETRIES) {
      console.error(`Local model returned empty response, retrying (${attempt}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY_MS * attempt);
    } else {
      throw new EmptyResponseError("empty choices");
    }
  }

  throw new EmptyResponseError("unknown");
}

// ── Local streaming (OpenAI-compatible) ─────────────────────────────

async function callLocalStream(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal,
): Promise<string> {
  const endpoint = config.localEndpoint ?? "http://localhost:1234/v1";
  const url = `${endpoint}/chat/completions`;

  const body = JSON.stringify({
    model: modelId === "local" ? undefined : modelId,
    max_tokens: 8192,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        `Local model at ${endpoint} timed out after ${FETCH_TIMEOUT_MS / 1000}s. The model may be loading or the request may be too large.`,
      );
    }
    throw new Error(
      `Could not reach local model at ${endpoint}. Is Ollama or LM Studio running?\n${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    clearTimeout(timeout);
    const errorBody = await response.text();
    throw new Error(`Local model API error (${response.status}): ${errorBody}`);
  }

  const accumulated = await readOpenAICompatibleStream(response, onChunk, timeout);
  if (accumulated) return accumulated;
  throw new EmptyResponseError("streaming returned no text");
}

// ── Pollinations (Free, OpenAI-compatible) ───────────────────────────

async function callPollinations(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  _config: LLMConfig,
): Promise<string> {
  const url = "https://text.pollinations.ai/openai";
  const body = JSON.stringify({
    model: modelId === "pollinations" ? "openai" : modelId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(`Pollinations timed out after ${FETCH_TIMEOUT_MS / 1000}s.`);
      }
      throw new Error(`Could not reach Pollinations API.\n${err instanceof Error ? err.message : String(err)}`);
    }

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt * 2);
        continue;
      }
      throw new Error(`Pollinations rate limit/server error (${response.status}). Please try again later.`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Pollinations API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const text = data.choices?.[0]?.message?.content;
    if (text) return text;

    if (attempt < MAX_RETRIES) {
      console.error(`Pollinations returned empty response, retrying (${attempt}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY_MS * attempt);
    } else {
      throw new EmptyResponseError("empty choices");
    }
  }

  throw new EmptyResponseError("unknown");
}

async function callPollinationsStream(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  _config: LLMConfig,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal,
): Promise<string> {
  const url = "https://text.pollinations.ai/openai";
  const body = JSON.stringify({
    model: modelId === "pollinations" ? "openai" : modelId,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Pollinations timed out after ${FETCH_TIMEOUT_MS / 1000}s.`);
    }
    throw new Error(`Could not reach Pollinations API.\n${err instanceof Error ? err.message : String(err)}`);
  }

  if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
    clearTimeout(timeout);
    throw new Error(`Pollinations rate limit/server error (${response.status}). Please try again later.`);
  }

  if (!response.ok) {
    clearTimeout(timeout);
    const errorBody = await response.text();
    throw new Error(`Pollinations API error (${response.status}): ${errorBody}`);
  }

  const accumulated = await readOpenAICompatibleStream(response, onChunk, timeout);
  if (accumulated) return accumulated;
  throw new EmptyResponseError("streaming returned no text");
}
