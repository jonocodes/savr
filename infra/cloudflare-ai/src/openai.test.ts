import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_NEURON_BUDGET,
  DEFAULT_MODELS,
  MAX_OUTPUT_TOKENS,
  MODEL_RATES,
  buildChatCompletion,
  buildModelsResponse,
  buildStatusResponse,
  corsHeaders,
  estimateNeurons,
  extractBearer,
  extractContent,
  isAuthorized,
  isModelAllowed,
  parseApiKeys,
  parseModelList,
  resolveCorsOrigin,
  safeEqual,
  validateChatRequest,
} from "./openai";

const ALLOWED = ["@cf/meta/llama-3.1-8b-instruct-fp8", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"];

const validBody = {
  model: ALLOWED[0],
  messages: [{ role: "user", content: "summarise this" }],
  max_tokens: 512,
};

describe("parseModelList", () => {
  it("falls back to the default set when unset", () => {
    expect(parseModelList(undefined)).toEqual(DEFAULT_MODELS);
  });

  it("falls back to the default set when blank", () => {
    expect(parseModelList("   ")).toEqual(DEFAULT_MODELS);
  });

  it("splits, trims and drops empties", () => {
    expect(parseModelList(" a , b ,, c ")).toEqual(["a", "b", "c"]);
  });

  it("does not alias the default array", () => {
    const parsed = parseModelList(undefined);
    parsed.push("x");
    expect(DEFAULT_MODELS).not.toContain("x");
  });
});

describe("isModelAllowed", () => {
  it("accepts a whitelisted id", () => {
    expect(isModelAllowed(ALLOWED[1], ALLOWED)).toBe(true);
  });

  it("rejects non-strings and unknown ids", () => {
    expect(isModelAllowed(42, ALLOWED)).toBe(false);
    expect(isModelAllowed("not-a-model", ALLOWED)).toBe(false);
    expect(isModelAllowed(undefined, ALLOWED)).toBe(false);
  });
});

describe("validateChatRequest", () => {
  it("accepts a well-formed request", () => {
    const result = validateChatRequest(validBody, ALLOWED);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.model).toBe(ALLOWED[0]);
      expect(result.value.messages).toEqual(validBody.messages);
      expect(result.value.maxTokens).toBe(512);
    }
  });

  it("rejects a non-object body", () => {
    const result = validateChatRequest("nope", ALLOWED);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("rejects a model outside the whitelist and names the allowed set", () => {
    const result = validateChatRequest({ ...validBody, model: "gpt-4" }, ALLOWED);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(ALLOWED[0]);
  });

  it("rejects empty or malformed messages", () => {
    expect(validateChatRequest({ ...validBody, messages: [] }, ALLOWED).ok).toBe(false);
    expect(validateChatRequest({ ...validBody, messages: [{ role: "user" }] }, ALLOWED).ok).toBe(
      false
    );
    expect(
      validateChatRequest({ ...validBody, messages: [{ role: 1, content: "x" }] }, ALLOWED).ok
    ).toBe(false);
  });

  it("defaults max_tokens and clamps absurd values", () => {
    const withoutMax = validateChatRequest(
      { model: ALLOWED[0], messages: validBody.messages },
      ALLOWED
    );
    if (withoutMax.ok) expect(withoutMax.value.maxTokens).toBe(MAX_OUTPUT_TOKENS);

    const huge = validateChatRequest({ ...validBody, max_tokens: 10_000_000 }, ALLOWED);
    if (huge.ok) expect(huge.value.maxTokens).toBe(MAX_OUTPUT_TOKENS);

    const negative = validateChatRequest({ ...validBody, max_tokens: -5 }, ALLOWED);
    if (negative.ok) expect(negative.value.maxTokens).toBe(MAX_OUTPUT_TOKENS);
  });
});

describe("extractContent", () => {
  it("reads the native { response } shape", () => {
    expect(extractContent({ response: "hello" })).toBe("hello");
  });

  it("reads an OpenAI-ish choices array", () => {
    expect(extractContent({ choices: [{ message: { content: "hi" } }] })).toBe("hi");
  });

  it("falls back to { text } and empty", () => {
    expect(extractContent({ text: "t" })).toBe("t");
    expect(extractContent(null)).toBe("");
    expect(extractContent({ nope: true })).toBe("");
  });
});

describe("buildChatCompletion", () => {
  it("produces the OpenAI shape Savr reads", () => {
    const completion = buildChatCompletion(ALLOWED[0], "summary", {
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    });
    expect(completion.object).toBe("chat.completion");
    expect(completion.model).toBe(ALLOWED[0]);
    expect(completion.choices[0].message).toEqual({ role: "assistant", content: "summary" });
    expect(completion.usage.total_tokens).toBe(14);
  });

  it("zeroes usage when the model reports none", () => {
    const completion = buildChatCompletion(ALLOWED[0], "x", { response: "x" });
    expect(completion.usage).toEqual({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
  });
});

describe("estimateNeurons", () => {
  it("matches a measured Workers AI call", () => {
    // Real call: 17 prompt + 2 completion tokens returned 0.2865 neurons.
    const neurons = estimateNeurons(MODEL_RATES["@cf/meta/llama-3.1-8b-instruct-fp8"], 17, 2);
    expect(neurons).toBeCloseTo(0.2865, 3);
  });

  it("produces the ballpark per-summary cost used in the docs table", () => {
    const neurons = estimateNeurons(MODEL_RATES["@cf/meta/llama-3.1-8b-instruct-fp8"]);
    expect(neurons).toBeGreaterThan(25);
    expect(neurons).toBeLessThan(40);
  });
});

describe("buildModelsResponse", () => {
  it("maps ids into an OpenAI list", () => {
    const trimmed = ALLOWED.map((id) => MODEL_RATES[id]).every(Boolean);
    expect(trimmed).toBe(true);
    expect(buildModelsResponse(ALLOWED).data.map((m) => m.id)).toEqual(ALLOWED);
  });

  it("attaches x_savr estimates for known models and the budget assumptions", () => {
    const response = buildModelsResponse(ALLOWED, 5000);
    expect(response.x_savr.daily_neuron_budget).toBe(5000);
    const withEstimate = response.data.find((m) => m.id === ALLOWED[0]) as {
      x_savr?: { summaries_per_day: number };
    };
    expect(withEstimate.x_savr).toBeDefined();
    expect(withEstimate.x_savr?.summaries_per_day).toBeLessThan(DEFAULT_DAILY_NEURON_BUDGET);
  });

  it("returns unknown models without the estimate", () => {
    const [model] = buildModelsResponse(["@cf/unknown/model"]).data;
    expect(model.id).toBe("@cf/unknown/model");
    expect("x_savr" in model).toBe(false);
  });
});

describe("buildStatusResponse", () => {
  it("reports version, config and per-model estimates without usage counters", () => {
    const status = buildStatusResponse({
      version: { id: "v1", tag: "prod", timestamp: "2026-10-05T00:00:00Z" },
      keysConfigured: 2,
      allowedModels: ALLOWED,
      dailyNeuronBudget: 5000,
    });
    expect(status.version).toEqual({
      id: "v1",
      tag: "prod",
      deployed_at: "2026-10-05T00:00:00Z",
    });
    expect(status.keys_configured).toBe(2);
    expect(status.daily_neuron_budget).toBe(5000);
    expect(status.models.every((m) => "summaries_per_day" in m)).toBe(true);
    // No stateful fields sneak in.
    expect(status).not.toHaveProperty("summaries_today");
    expect(status).not.toHaveProperty("neurons_used_today");
  });

  it("tolerates a missing version binding and unknown models", () => {
    const status = buildStatusResponse({
      keysConfigured: 1,
      allowedModels: ["@cf/unknown/model"],
      dailyNeuronBudget: 10000,
    });
    expect(status.version).toEqual({ id: null, tag: null, deployed_at: null });
    expect(status.models).toEqual([{ id: "@cf/unknown/model" }]);
  });
});

describe("extractBearer", () => {
  it("parses a bearer token case-insensitively", () => {
    expect(extractBearer("Bearer abc123")).toBe("abc123");
    expect(extractBearer("bearer   abc123  ")).toBe("abc123");
  });

  it("returns null for missing or non-bearer headers", () => {
    expect(extractBearer(null)).toBeNull();
    expect(extractBearer("Basic abc")).toBeNull();
    expect(extractBearer("Bearer ")).toBeNull();
  });
});

describe("safeEqual", () => {
  it("matches equal strings and rejects different ones", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("secret", "secret ")).toBe(false);
  });
});

describe("parseApiKeys", () => {
  it("splits on commas, whitespace and newlines", () => {
    expect(parseApiKeys("a,b,c")).toEqual(["a", "b", "c"]);
    expect(parseApiKeys("a b\tc")).toEqual(["a", "b", "c"]);
    expect(parseApiKeys("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list when unset or blank", () => {
    expect(parseApiKeys(undefined)).toEqual([]);
    expect(parseApiKeys("   \n , ")).toEqual([]);
  });
});

describe("isAuthorized", () => {
  const keys = ["key-one", "key-two"];

  it("accepts any configured key", () => {
    expect(isAuthorized("key-one", keys)).toBe(true);
    expect(isAuthorized("key-two", keys)).toBe(true);
  });

  it("rejects unknown or missing keys", () => {
    expect(isAuthorized("key-three", keys)).toBe(false);
    expect(isAuthorized(null, keys)).toBe(false);
    expect(isAuthorized("key-one", [])).toBe(false);
  });

  it("supports rotation: removing a key revokes only that key", () => {
    const rotated = ["key-two", "key-three"];
    expect(isAuthorized("key-one", rotated)).toBe(false);
    expect(isAuthorized("key-two", rotated)).toBe(true);
    expect(isAuthorized("key-three", rotated)).toBe(true);
  });
});

describe("CORS", () => {
  it("allows any origin when the list is * or empty", () => {
    expect(resolveCorsOrigin("https://savr.link", "*")).toBe("*");
    expect(resolveCorsOrigin("https://savr.link", undefined)).toBe("*");
  });

  it("echoes an allowed origin and otherwise falls back to the first entry", () => {
    expect(resolveCorsOrigin("https://savr.link", "https://savr.link,https://a.test")).toBe(
      "https://savr.link"
    );
    expect(resolveCorsOrigin("https://evil.test", "https://savr.link")).toBe("https://savr.link");
  });

  it("adds Vary only for a fixed origin", () => {
    expect(corsHeaders("https://savr.link", "*").Vary).toBeUndefined();
    expect(corsHeaders("https://savr.link", "https://savr.link").Vary).toBe("Origin");
  });

  it("advertises the Authorization header for preflight", () => {
    expect(corsHeaders(null, "*")["Access-Control-Allow-Headers"]).toContain("Authorization");
  });
});
