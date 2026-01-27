// Cloud-based summarization using Groq or OpenAI APIs

// Available providers
export type SummaryProvider = "groq" | "openai";

export type SummaryProviderConfig = {
  id: SummaryProvider;
  name: string;
  models: { id: string; name: string; description: string }[];
};

export const PROVIDERS: SummaryProviderConfig[] = [
  {
    id: "groq",
    name: "Groq",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", description: "Free tier, very fast" },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", description: "Faster, lighter" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast & affordable" },
      { id: "gpt-4o", name: "GPT-4o", description: "Most capable" },
    ],
  },
];

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

  const parts = [
    "Summarize the following text.",
    detailInstructions[settings.detailLevel],
    toneInstructions[settings.tone],
    focusInstructions[settings.focus],
    formatInstruction,
  ].filter(Boolean);

  return `${parts.join(" ")}\n\nText:\n${text}\n\nSummary:`;
}

/**
 * Call the Groq API for summarization
 */
async function callGroqApi(prompt: string, apiKey: string, model: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
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
 * Call the OpenAI API for summarization
 */
async function callOpenAiApi(prompt: string, apiKey: string, model: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
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
 * Summarize article text using cloud LLM API
 */
export async function summarizeText(
  text: string,
  settings: SummarySettings,
  provider: SummaryProvider,
  apiKey: string,
  model: string,
  onProgress?: ProgressCallback
): Promise<string> {
  onProgress?.({ status: "summarizing" });

  // Truncate text if too long (to stay within token limits)
  const maxInputChars = 12000; // ~3000 tokens, leaving room for response
  const truncatedText = text.length > maxInputChars ? text.slice(0, maxInputChars) + "..." : text;

  const prompt = buildPrompt(truncatedText, settings);

  let summary: string;

  if (provider === "groq") {
    summary = await callGroqApi(prompt, apiKey, model);
  } else if (provider === "openai") {
    summary = await callOpenAiApi(prompt, apiKey, model);
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }

  onProgress?.({ status: "ready" });

  return summary.trim();
}

/**
 * Test the API connection with a simple request
 */
export async function testApiConnection(
  provider: SummaryProvider,
  apiKey: string,
  model: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const testPrompt = "Say 'API connection successful' in exactly those words.";

    if (provider === "groq") {
      await callGroqApi(testPrompt, apiKey, model);
    } else if (provider === "openai") {
      await callOpenAiApi(testPrompt, apiKey, model);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
