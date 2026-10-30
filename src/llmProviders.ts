/**
 * Provider registry — single source of truth for everything provider-specific.
 * Lives in its own module with zero Node deps so both main process and renderer
 * can import it without pulling in fs/crypto/etc.
 */

export type ProviderId =
  | "openai"
  | "azure"
  | "openrouter"
  | "anthropic"
  | "gemini"
  | "local"
  | "pollinations"
  | "chatgpt";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  envVar: string; // empty for providers that don't take a key
  keyPlaceholder: string;
  signupUrl: string;
  needsKey: boolean; // false for "local"
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "chatgpt", label: "ChatGPT plan", envVar: "", keyPlaceholder: "", signupUrl: "", needsKey: false },
  {
    id: "openai",
    label: "OpenAI",
    envVar: "OPENAI_API_KEY",
    keyPlaceholder: "sk-...",
    signupUrl: "https://platform.openai.com/api-keys",
    needsKey: true,
  },
  {
    id: "azure",
    label: "Azure OpenAI",
    envVar: "AZURE_OPENAI_API_KEY",
    keyPlaceholder: "Azure OpenAI key",
    signupUrl: "https://ai.azure.com/",
    needsKey: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    keyPlaceholder: "sk-or-...",
    signupUrl: "https://openrouter.ai/keys",
    needsKey: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    keyPlaceholder: "sk-ant-...",
    signupUrl: "https://console.anthropic.com/settings/keys",
    needsKey: true,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    envVar: "GEMINI_API_KEY",
    keyPlaceholder: "AIza...",
    signupUrl: "https://aistudio.google.com/apikey",
    needsKey: true,
  },
  {
    id: "local",
    label: "Local (Ollama / LM Studio)",
    envVar: "",
    keyPlaceholder: "",
    signupUrl: "",
    needsKey: false,
  },
  {
    id: "pollinations",
    label: "Pollinations (Free, No Key Needed)",
    envVar: "",
    keyPlaceholder: "",
    signupUrl: "https://pollinations.ai",
    needsKey: false,
  },
];

export const PROVIDER_BY_ID: Record<ProviderId, ProviderInfo> = PROVIDERS.reduce(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {} as Record<ProviderId, ProviderInfo>,
);
