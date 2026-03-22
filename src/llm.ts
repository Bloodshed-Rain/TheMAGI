/**
 * Multi-LLM provider abstraction.
 *
 * Supports:
 *   - OpenRouter (DeepSeek, Claude, etc.)
 *   - Gemini direct  ← default (free tier, no key needed for end users)
 *   - Anthropic direct (Claude)
 *   - OpenAI direct
 *   - Local models via OpenAI-compatible API (Ollama, LM Studio)
 *
 * All providers share the same interface: system prompt + user prompt → text.
 */

// ── Provider types ───────────────────────────────────────────────────

export type ProviderId =
  | "openrouter"
  | "gemini"
  | "anthropic"
  | "openai"
  | "local";

export interface ModelOption {
  id: string;          // model identifier sent to the API
  label: string;       // human-readable name for the UI
  provider: ProviderId;
  costPer1kInput?: number;   // USD per 1k input tokens (for cost estimates)
  costPer1kOutput?: number;
}

/** Static list of supported models. Users can also type custom model IDs. */
export const MODELS: ModelOption[] = [
  // OpenRouter — DeepSeek (default cheap/smart)
  {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek V3 (via OpenRouter)",
    provider: "openrouter",
    costPer1kInput: 0.00014,
    costPer1kOutput: 0.00028,
  },
  {
    id: "deepseek/deepseek-reasoner",
    label: "DeepSeek R1 (via OpenRouter)",
    provider: "openrouter",
    costPer1kInput: 0.00055,
    costPer1kOutput: 0.00219,
  },
  // OpenRouter — Claude
  {
    id: "anthropic/claude-sonnet-4",
    label: "Claude Sonnet 4 (via OpenRouter)",
    provider: "openrouter",
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  // OpenRouter — other
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash (via OpenRouter)",
    provider: "openrouter",
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o (via OpenRouter)",
    provider: "openrouter",
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
  },
  // Gemini direct
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash (direct)",
    provider: "gemini",
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
  // Anthropic direct
  {
    id: "claude-sonnet-4-20250514",
    label: "Claude Sonnet 4 (direct)",
    provider: "anthropic",
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  // OpenAI direct
  {
    id: "gpt-4o",
    label: "GPT-4o (direct)",
    provider: "openai",
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
  },
  // Local
  {
    id: "local",
    label: "Local Model (Ollama / LM Studio)",
    provider: "local",
  },
];

export const DEFAULT_MODEL_ID = "gemini-2.5-flash";

/** Get the provider for a given model ID */
export function getModelProvider(modelId: string): ProviderId {
  const found = MODELS.find((m) => m.id === modelId);
  if (found) return found.provider;
  // Heuristic for custom model IDs
  if (modelId.includes("/")) return "openrouter";
  if (modelId.startsWith("gemini")) return "gemini";
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) return "openai";
  return "local";
}

/** Get human-readable label for a model */
export function getModelLabel(modelId: string): string {
  return MODELS.find((m) => m.id === modelId)?.label ?? modelId;
}

// ── Provider config (stored in user config) ──────────────────────────

export interface LLMConfig {
  modelId: string;
  openrouterApiKey: string | null;
  geminiApiKey: string | null;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  localEndpoint: string | null;   // e.g. "http://localhost:1234/v1"
}

export const LLM_DEFAULTS: LLMConfig = {
  modelId: DEFAULT_MODEL_ID,
  openrouterApiKey: null,
  geminiApiKey: null,
  anthropicApiKey: null,
  openaiApiKey: null,
  localEndpoint: null,
};

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
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeout),
  );
}

class EmptyResponseError extends Error {
  constructor(detail: string) {
    super(`LLM returned empty text after ${MAX_RETRIES} attempts (${detail})`);
    this.name = "EmptyResponseError";
  }
}

// ── Main call function ───────────────────────────────────────────────

export interface CallLLMOptions {
  systemPrompt: string;
  userPrompt: string;
  config: LLMConfig;
  /** Override model for this call (e.g. premium model for demos) */
  modelOverride?: string;
}

export async function callLLM(opts: CallLLMOptions): Promise<string> {
  const modelId = opts.modelOverride ?? opts.config.modelId;
  const provider = getModelProvider(modelId);

  switch (provider) {
    case "openrouter":
      return callOpenRouter(opts.systemPrompt, opts.userPrompt, modelId, opts.config);
    case "gemini":
      return callGemini(opts.systemPrompt, opts.userPrompt, modelId, opts.config);
    case "anthropic":
      return callAnthropic(opts.systemPrompt, opts.userPrompt, modelId, opts.config);
    case "openai":
      return callOpenAI(opts.systemPrompt, opts.userPrompt, modelId, opts.config);
    case "local":
      return callLocal(opts.systemPrompt, opts.userPrompt, modelId, opts.config);
  }
}

// ── OpenRouter (OpenAI-compatible) ───────────────────────────────────

async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
): Promise<string> {
  const apiKey = config.openrouterApiKey ?? process.env["OPENROUTER_API_KEY"];
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
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Bloodshed-Rain/MAGI",
        "X-Title": "MAGI",
      },
      body,
    });

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      if (attempt < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "", 10);
        await sleep((Number.isFinite(retryAfter) ? retryAfter * 1000 : RETRY_DELAY_MS * attempt * 2));
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

// ── Gemini direct ────────────────────────────────────────────────────

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
): Promise<string> {
  const apiKey = config.geminiApiKey ?? process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "Gemini API key is not set. Add it in Settings or set the GEMINI_API_KEY environment variable.",
    );
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

// ── Anthropic direct (Messages API) ──────────────────────────────────

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
): Promise<string> {
  const apiKey = config.anthropicApiKey ?? process.env["ANTHROPIC_API_KEY"];
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
    messages: [
      { role: "user", content: userPrompt },
    ],
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
        await sleep((Number.isFinite(retryAfter) ? retryAfter * 1000 : RETRY_DELAY_MS * attempt * 2));
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

// ── OpenAI direct ────────────────────────────────────────────────────

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: LLMConfig,
): Promise<string> {
  const apiKey = config.openaiApiKey ?? process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "OpenAI API key is not set. Add it in Settings or set the OPENAI_API_KEY environment variable.",
    );
  }

  const url = "https://api.openai.com/v1/chat/completions";
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
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      if (attempt < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "", 10);
        await sleep((Number.isFinite(retryAfter) ? retryAfter * 1000 : RETRY_DELAY_MS * attempt * 2));
        continue;
      }
      if (response.status === 429) {
        throw new Error("OpenAI rate limit exceeded. Please try again in a moment.");
      }
      const errorBody = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const text = data.choices?.[0]?.message?.content;
    if (text) return text;

    if (attempt < MAX_RETRIES) {
      console.error(`OpenAI returned empty response, retrying (${attempt}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY_MS * attempt);
    } else {
      throw new EmptyResponseError("empty choices");
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
        throw new Error(`Local model at ${endpoint} timed out after ${FETCH_TIMEOUT_MS / 1000}s. The model may be loading or the request may be too large.`);
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
