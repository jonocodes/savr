// Summarization via any OpenAI-compatible chat-completions endpoint.
//
// Groq, OpenAI, Gemini (via its OpenAI-compat endpoint), OpenRouter, and local
// servers such as llama.cpp's llama-server, Ollama, LM Studio and vLLM all speak
// the same POST /chat/completions shape. That means a single call path plus a
// table of endpoints covers all of them — adding a provider is a data edit here,
// not new code. The "custom" provider lets the user point at any base URL and
// type a model name by hand (e.g. a local llama-server or a self-hosted model).
import { getSummarySettingsFromCookie } from "../cookies";

// Provider ids are open-ended now that providers are just data, so this is a
// plain string alias rather than a closed union.
export type SummaryProvider = string;

export type SummaryProviderConfig = {
  id: SummaryProvider;
  name: string;
  // Full OpenAI-compatible chat-completions URL. Empty for custom providers,
  // where the user supplies the base URL at runtime.
  baseUrl: string;
  // Whether an API key is mandatory. Local servers usually don't need one.
  requiresApiKey: boolean;
  // Custom providers let the user type a base URL and model name freely instead
  // of picking from the model dropdown.
  isCustom?: boolean;
  // Hint shown under the API key field in preferences.
  apiKeyHint?: string;
};

export const PROVIDERS: SummaryProviderConfig[] = [
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    requiresApiKey: true,
    apiKeyHint: "Get a free key at console.groq.com",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    requiresApiKey: true,
    apiKeyHint: "Get a key at platform.openai.com",
  },
  {
    id: "gemini",
    name: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    requiresApiKey: true,
    apiKeyHint: "Get a key at aistudio.google.com/apikey",
  },
  {
    id: "custom",
    name: "Local / Custom",
    baseUrl: "",
    requiresApiKey: false,
    isCustom: true,
    apiKeyHint: "Optional — most local servers don't need a key",
  },
];

export function getProviderConfig(provider: SummaryProvider): SummaryProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === provider);
}

/**
 * Resolve the chat-completions endpoint for a provider. For custom providers the
 * URL comes from the caller (user-supplied); for built-ins it comes from the
 * provider table.
 */
function resolveEndpoint(provider: SummaryProvider, baseUrlOverride?: string): string {
  const config = getProviderConfig(provider);
  const url = (config?.isCustom ? baseUrlOverride : config?.baseUrl)?.trim();
  if (!url) {
    throw new Error(`No API endpoint configured for provider "${provider}"`);
  }
  return url;
}

// Detail level options (0-4)
export const DETAIL_LEVELS = ["Brief", "Concise", "Moderate", "Detailed", "Comprehensive"] as const;
export type DetailLevel = 0 | 1 | 2 | 3 | 4;

// Tone options
export const TONE_OPTIONS = [
  { value: "neutral", label: "Neutral" },
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "technical", label: "Technical" },
] as const;
export type ToneOption = (typeof TONE_OPTIONS)[number]["value"];

// Focus options
export const FOCUS_OPTIONS = [
  { value: "general", label: "General" },
  { value: "key-facts", label: "Key Facts" },
  { value: "action-items", label: "Action Items" },
  { value: "themes", label: "Main Themes" },
  { value: "arguments", label: "Arguments" },
] as const;
export type FocusOption = (typeof FOCUS_OPTIONS)[number]["value"];

// Format options
export const FORMAT_OPTIONS = [
  { value: "paragraphs", label: "Paragraphs" },
  { value: "bullets", label: "Bullet Points" },
] as const;
export type FormatOption = (typeof FORMAT_OPTIONS)[number]["value"];

// Summary settings
export interface SummarySettings {
  detailLevel: DetailLevel;
  tone: ToneOption;
  focus: FocusOption;
  format: FormatOption;
  customPrompt: string;
}

export const DEFAULT_SUMMARY_SETTINGS: SummarySettings = {
  detailLevel: 2,
  tone: "neutral",
  focus: "general",
  format: "paragraphs",
  customPrompt: "",
};

export function buildSummarySettings(): SummarySettings {
  const cookieSettings = getSummarySettingsFromCookie();
  return {
    ...DEFAULT_SUMMARY_SETTINGS,
    detailLevel: cookieSettings.detailLevel as SummarySettings["detailLevel"],
    tone: cookieSettings.tone as SummarySettings["tone"],
    focus: cookieSettings.focus as SummarySettings["focus"],
    format: cookieSettings.format as SummarySettings["format"],
    customPrompt: cookieSettings.customPrompt,
  };
}

// Progress callback types (kept for compatibility)
export type SummarizationProgress = {
  status: "summarizing" | "ready";
};

export type ProgressCallback = (progress: SummarizationProgress) => void;

/**
 * Build the prompt for summarization based on settings
 */
export function buildPrompt(text: string, settings: SummarySettings): string {
  // If custom prompt is provided, use it (with {text} placeholder)
  if (settings.customPrompt.trim()) {
    return settings.customPrompt.replace("{text}", text);
  }

  const detailInstructions: Record<DetailLevel, string> = {
    0: "Provide a very brief 1-2 sentence summary capturing only the core message.",
    1: "Provide a concise summary in 3-4 sentences covering the main points.",
    2: "Provide a moderate summary covering key points and some supporting details.",
    3: "Provide a detailed summary with main points, supporting details, and examples.",
    4: "Provide a comprehensive summary capturing all significant points, details, nuances, and examples.",
  };

  const toneInstructions: Record<ToneOption, string> = {
    neutral: "",
    formal: "Use formal, professional language.",
    casual: "Use casual, conversational language.",
    technical: "Use precise technical terminology.",
  };

  const focusInstructions: Record<FocusOption, string> = {
    general: "",
    "key-facts": "Focus on extracting key facts and data points.",
    "action-items": "Focus on identifying action items and next steps.",
    themes: "Focus on identifying main themes and patterns.",
    arguments: "Focus on the main arguments and supporting evidence.",
  };

  const formatInstruction =
    settings.format === "bullets"
      ? "Use bullet points to organize the information."
      : "Write in flowing paragraphs.";

  // A single flat ceiling, not a per-level target: detailInstructions above
  // already shapes length ("1-2 sentences" vs "comprehensive"). This just
  // stops the open-ended top end (Comprehensive) from running unbounded.
  const lengthCeiling = "Regardless of detail level, keep the summary under 800 words.";

  const parts = [
    "Summarize the following text.",
    detailInstructions[settings.detailLevel],
    toneInstructions[settings.tone],
    focusInstructions[settings.focus],
    formatInstruction,
    lengthCeiling,
  ].filter(Boolean);

  return `${parts.join(" ")}\n\nText:\n${text}\n\nSummary:`;
}

/**
 * Flat output-token safety net for the /chat/completions call. This is not
 * meant to shape summary length — buildPrompt's word-count ceiling does that —
 * it only guards against a model ignoring that instruction and generating
 * without bound. Generous enough to leave headroom for "thinking" models
 * (e.g. Gemini 2.5) that spend part of the budget on reasoning before the
 * visible answer, but still well under common per-request output limits.
 */
const MAX_OUTPUT_TOKENS = 4096;

/**
 * Call any OpenAI-compatible /chat/completions endpoint. The Authorization
 * header is omitted when no key is provided so local servers that don't require
 * auth (llama-server, Ollama, LM Studio, ...) work out of the box.
 */
async function callChatApi(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      // `max_tokens` is the widely-supported field across OpenAI-compatible
      // endpoints (Groq, Gemini's compat layer, llama.cpp, Ollama, ...). Note
      // this caps *output* tokens, and "thinking" models such as Gemini 2.5
      // spend part of that budget on internal reasoning before the answer — so
      // it needs headroom or the visible summary gets truncated.
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error.error?.message || res.statusText);
  }

  const data = await res.json();
  return data.choices[0]?.message?.content || "";
}

/**
 * Summarize article text using an OpenAI-compatible LLM API.
 *
 * @param baseUrl Endpoint override for custom providers (ignored for built-ins).
 */
export async function summarizeText(
  text: string,
  settings: SummarySettings,
  provider: SummaryProvider,
  apiKey: string,
  model: string,
  onProgress?: ProgressCallback,
  baseUrl?: string
): Promise<string> {
  onProgress?.({ status: "summarizing" });

  // Truncate text if too long (to stay within token limits)
  const maxInputChars = 12000; // ~3000 tokens, leaving room for response
  const truncatedText = text.length > maxInputChars ? text.slice(0, maxInputChars) + "..." : text;

  const prompt = buildPrompt(truncatedText, settings);
  const endpoint = resolveEndpoint(provider, baseUrl);

  const summary = await callChatApi(endpoint, apiKey, model, prompt, MAX_OUTPUT_TOKENS);

  onProgress?.({ status: "ready" });

  return summary.trim();
}

/**
 * Test the API connection with a simple request.
 *
 * @param baseUrl Endpoint override for custom providers (ignored for built-ins).
 */
export async function testApiConnection(
  provider: SummaryProvider,
  apiKey: string,
  model: string,
  baseUrl?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const endpoint = resolveEndpoint(provider, baseUrl);
    const testPrompt = "Say 'API connection successful' in exactly those words.";
    // Give reasoning models headroom so the short reply isn't eaten by thinking.
    await callChatApi(endpoint, apiKey, model, testPrompt, 512);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Fetch the list of model ids a provider currently offers via its
 * OpenAI-compatible `GET /v1/models` endpoint (derived from the chat-completions
 * URL by swapping the path). Works for Groq, OpenAI, Gemini's compat layer and
 * local servers. Returns a sorted list of model ids.
 *
 * @param baseUrl Endpoint override for custom providers (ignored for built-ins).
 */
export async function fetchAvailableModels(
  provider: SummaryProvider,
  apiKey: string,
  baseUrl?: string
): Promise<string[]> {
  const endpoint = resolveEndpoint(provider, baseUrl);
  const modelsUrl = endpoint.replace(/\/chat\/completions\/?$/, "/models");
  if (modelsUrl === endpoint) {
    throw new Error(
      "Could not derive a models URL — the endpoint should end with /chat/completions"
    );
  }

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(modelsUrl, { headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error.error?.message || res.statusText);
  }

  const data = await res.json();
  const list: unknown[] = Array.isArray(data?.data) ? data.data : [];
  const ids = list
    .map((m) => (m && typeof m === "object" ? (m as { id?: unknown }).id : undefined))
    // Gemini's compat endpoint prefixes ids with "models/"; strip it so the id
    // matches what the chat-completions call expects.
    .map((id) => (typeof id === "string" ? id.replace(/^models\//, "") : ""))
    .filter((id): id is string => id.length > 0);

  return Array.from(new Set(ids)).sort();
}
