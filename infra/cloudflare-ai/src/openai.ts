// Pure helpers translating between the OpenAI chat-completions shape that Savr
// speaks and the native Workers AI (`env.AI.run`) shape. Deliberately free of
// any Cloudflare runtime types so they can be unit-tested in plain Node.

// Default server-side whitelist. Model ids churn, so these are only defaults —
// override with the ALLOWED_MODELS var. Verify against
// https://developers.cloudflare.com/workers-ai/models/
export const DEFAULT_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct-fp8",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
];

// Cap on generated output tokens. Savr asks for 4096; anything wildly larger is
// almost certainly a mistake, so clamp.
export const MAX_OUTPUT_TOKENS = 8192;

// Free Workers AI allocation, in neurons per day.
export const DEFAULT_DAILY_NEURON_BUDGET = 10000;

// Assumptions behind the per-model estimates published in GET /v1/models.
// We always presume a 1,000-word cleaned article; the summary is the default
// "Moderate" detail level. Kept as plain constants so the numbers are auditable.
export const EST_ARTICLE_WORDS = 1000;
// ~0.75 words per token for English.
export const EST_ARTICLE_TOKENS = Math.round(EST_ARTICLE_WORDS / 0.75);
// Prompt scaffolding (instructions + framing) sent alongside the article.
export const EST_PROMPT_TOKENS = 150;
export const EST_SUMMARY_TOKENS = 300;

// Published neuron rates (per million tokens), keyed by model id. Only models
// listed here get an estimate; unknown ids are still returned, just without one.
// Source: https://developers.cloudflare.com/workers-ai/platform/pricing/
export type ModelRate = { inPerM: number; outPerM: number };

export const MODEL_RATES: Record<string, ModelRate> = {
  "@cf/meta/llama-3.1-8b-instruct-fp8": { inPerM: 13778, outPerM: 26128 },
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": { inPerM: 26668, outPerM: 204805 },
  "@cf/mistralai/mistral-small-3.1-24b-instruct": { inPerM: 31876, outPerM: 50488 },
  "@cf/qwen/qwen3-30b-a3b-fp8": { inPerM: 4625, outPerM: 30475 },
};

/**
 * Neurons for a request with the given token counts. Defaults to the presumed
 * summary shape (1,000-word article + prompt scaffolding in, moderate summary
 * out); pass explicit counts to model a real call.
 */
export function estimateNeurons(
  rate: ModelRate,
  inputTokens = EST_ARTICLE_TOKENS + EST_PROMPT_TOKENS,
  outputTokens = EST_SUMMARY_TOKENS
): number {
  return (inputTokens / 1e6) * rate.inPerM + (outputTokens / 1e6) * rate.outPerM;
}

export type ChatMessage = { role: string; content: string };

export type ValidatedChatRequest = {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
};

export type ValidationResult =
  | { ok: true; value: ValidatedChatRequest }
  | { ok: false; status: number; message: string };

/** Parse a comma-separated whitelist, falling back to DEFAULT_MODELS. */
export function parseModelList(raw: string | undefined): string[] {
  const models = (raw ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  return models.length > 0 ? models : [...DEFAULT_MODELS];
}

export function isModelAllowed(model: unknown, allowed: string[]): model is string {
  return typeof model === "string" && allowed.includes(model);
}

function normalizeMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const messages: ChatMessage[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (typeof role !== "string" || typeof content !== "string") return null;
    messages.push({ role, content });
  }
  return messages;
}

/** Validate an incoming OpenAI chat request and normalise the fields we use. */
export function validateChatRequest(body: unknown, allowed: string[]): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, message: "Request body must be a JSON object" };
  }
  const { model, messages, max_tokens: maxTokensRaw } = body as Record<string, unknown>;
  if (!isModelAllowed(model, allowed)) {
    return {
      ok: false,
      status: 400,
      message: `Model "${String(model)}" is not allowed. Allowed models: ${allowed.join(", ")}`,
    };
  }
  const normalized = normalizeMessages(messages);
  if (!normalized) {
    return {
      ok: false,
      status: 400,
      message: "`messages` must be a non-empty array of { role, content } strings",
    };
  }
  const maxTokens =
    typeof maxTokensRaw === "number" && Number.isFinite(maxTokensRaw) && maxTokensRaw > 0
      ? Math.min(Math.floor(maxTokensRaw), MAX_OUTPUT_TOKENS)
      : MAX_OUTPUT_TOKENS;
  return { ok: true, value: { model, messages: normalized, maxTokens } };
}

/**
 * Pull the assistant text out of a native Workers AI text-generation result.
 * Chat models return `{ response: "..." }`; some newer models return an
 * OpenAI-ish `choices` array, so handle both.
 */
export function extractContent(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const r = result as Record<string, unknown>;
  if (typeof r.response === "string") return r.response;
  const choices = r.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const message = (choices[0] as { message?: { content?: unknown } }).message;
    if (message && typeof message.content === "string") return message.content;
  }
  if (typeof r.text === "string") return r.text;
  return "";
}

type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };

function extractUsage(result: unknown): Usage {
  if (!result || typeof result !== "object") return {};
  const usage = (result as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return {};
  const u = usage as Record<string, unknown>;
  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
  return {
    prompt_tokens: num(u.prompt_tokens),
    completion_tokens: num(u.completion_tokens),
    total_tokens: num(u.total_tokens),
  };
}

/** Build a non-streaming OpenAI chat-completion response. */
export function buildChatCompletion(model: string, content: string, result: unknown) {
  return {
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      { index: 0, message: { role: "assistant", content }, finish_reason: "stop" },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      ...extractUsage(result),
    },
  };
}

/**
 * Build the OpenAI `GET /v1/models` response from the whitelist.
 *
 * Standard clients only read `data[].id`, so we can safely attach Savr-specific
 * estimates under a namespaced `x_savr` key: per-model neurons per summary and
 * how many summaries the daily budget affords. Unknown model ids are returned
 * without the extension rather than dropped.
 */
export function buildModelsResponse(models: string[], dailyNeuronBudget = DEFAULT_DAILY_NEURON_BUDGET) {
  return {
    object: "list",
    x_savr: {
      daily_neuron_budget: dailyNeuronBudget,
      article_words: EST_ARTICLE_WORDS,
      article_tokens: EST_ARTICLE_TOKENS,
      prompt_tokens: EST_PROMPT_TOKENS,
      summary_tokens: EST_SUMMARY_TOKENS,
    },
    data: models.map((id) => {
      const rate = MODEL_RATES[id];
      if (!rate) {
        return { id, object: "model", created: 0, owned_by: "cloudflare" };
      }
      const neurons = estimateNeurons(rate);
      return {
        id,
        object: "model",
        created: 0,
        owned_by: "cloudflare",
        x_savr: {
          neurons_per_summary: Math.round(neurons * 10) / 10,
          summaries_per_day: Math.floor(dailyNeuronBudget / neurons),
        },
      };
    }),
  };
}

export type VersionMetadata = { id?: string; tag?: string; timestamp?: string };

/**
 * Build the authenticated `/status` payload. Everything here is derived from
 * configuration and the Cloudflare version-metadata binding — the worker keeps
 * no state, so there are no usage counters (summaries run, neurons spent).
 */
export function buildStatusResponse(opts: {
  version?: VersionMetadata;
  keysConfigured: number;
  allowedModels: string[];
  dailyNeuronBudget: number;
}) {
  return {
    service: "savr-cloudflare-ai",
    status: "ok",
    version: {
      id: opts.version?.id ?? null,
      tag: opts.version?.tag ?? null,
      deployed_at: opts.version?.timestamp ?? null,
    },
    keys_configured: opts.keysConfigured,
    allowed_models: opts.allowedModels,
    daily_neuron_budget: opts.dailyNeuronBudget,
    estimates: {
      article_words: EST_ARTICLE_WORDS,
      article_tokens: EST_ARTICLE_TOKENS,
      prompt_tokens: EST_PROMPT_TOKENS,
      summary_tokens: EST_SUMMARY_TOKENS,
    },
    models: opts.allowedModels.map((id) => {
      const rate = MODEL_RATES[id];
      if (!rate) return { id };
      const neurons = estimateNeurons(rate);
      return {
        id,
        neurons_per_summary: Math.round(neurons * 10) / 10,
        summaries_per_day: Math.floor(opts.dailyNeuronBudget / neurons),
      };
    }),
  };
}

/** Extract a bearer token from an Authorization header. */
export function extractBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Length-aware, early-exit-free string compare for a single API key. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Parse one or more API keys from a single secret. Accepts commas, whitespace
 * and newlines as separators, so keys can be listed one-per-line or comma-joined
 * (e.g. AI_API_KEYS="key1,key2" or a file piped into `wrangler secret put`).
 */
export function parseApiKeys(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,]+/)
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

/** True if the presented key matches any configured key. */
export function isAuthorized(provided: string | null, keys: string[]): boolean {
  if (!provided) return false;
  return keys.some((key) => safeEqual(provided, key));
}

/** Resolve which origin to echo back for CORS. */
export function resolveCorsOrigin(origin: string | null, allowedOrigins: string | undefined): string {
  const allowList = (allowedOrigins ?? "*")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowList.length === 0 || allowList.includes("*")) return "*";
  if (origin && allowList.includes(origin)) return origin;
  return allowList[0];
}

/**
 * CORS headers for a request. Savr calls the worker directly from the browser
 * with an Authorization header, so preflight must be answered and the origin
 * echoed. Access is gated by the API key, not by origin.
 */
export function corsHeaders(
  origin: string | null,
  allowedOrigins: string | undefined
): Record<string, string> {
  const allowOrigin = resolveCorsOrigin(origin, allowedOrigins);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (allowOrigin !== "*") headers.Vary = "Origin";
  return headers;
}
