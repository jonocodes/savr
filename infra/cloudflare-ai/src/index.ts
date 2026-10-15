// Savr Cloudflare AI worker.
//
// A tiny, self-hostable OpenAI-compatible gateway in front of Cloudflare
// Workers AI. Savr's summarization talks to any OpenAI-compatible
// /chat/completions endpoint, so this worker lets it use Cloudflare's free
// Workers AI tier without exposing a Cloudflare account token to the browser:
//
//   Savr --(Bearer AI_API_KEYS)--> this worker --(AI binding)--> Workers AI
//
// Endpoints:
//   GET  /v1/models            OpenAI model list (the server-side whitelist)
//   POST /v1/chat/completions  OpenAI chat completion (non-streaming)
//   GET  / or /health          tiny liveness payload
//
// The whitelist (ALLOWED_MODELS) lives here, so the browser's model dropdown
// only ever offers ids you allow. Workers AI access uses the `AI` binding, so
// no Cloudflare API token is stored anywhere.

import {
  DEFAULT_DAILY_NEURON_BUDGET,
  buildChatCompletion,
  buildModelsResponse,
  buildStatusResponse,
  corsHeaders,
  extractBearer,
  extractContent,
  isAuthorized,
  parseApiKeys,
  parseModelList,
  validateChatRequest,
} from "./openai";

export interface Env {
  // Workers AI binding, declared in wrangler.toml under [ai].
  AI: Ai;
  // One or more bearer keys Savr may send, comma- or newline-separated. Set with
  // `wrangler secret put AI_API_KEYS`. AI_API_KEY (singular) is still accepted.
  AI_API_KEYS?: string;
  AI_API_KEY?: string;
  // Comma-separated whitelist of model ids. Falls back to a default set.
  ALLOWED_MODELS?: string;
  // Comma-separated browser origins allowed to call the worker ("*" = any).
  ALLOWED_ORIGINS?: string;
  // Daily neuron budget used for the /v1/models estimates (default 10000).
  DAILY_NEURON_BUDGET?: string;
  // Version metadata binding (wrangler.toml [version_metadata]).
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string };
}

// Structural view of the AI binding so a whitelisted id (a runtime string) can
// be passed without fighting the generated per-model overloads.
type AiRunner = {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);
    const json = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors } });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    // Unauthenticated and harmless: handy when someone opens the URL.
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        service: "savr-cloudflare-ai",
        status: "ok",
        version: env.CF_VERSION_METADATA?.id ?? null,
        deployed_at: env.CF_VERSION_METADATA?.timestamp ?? null,
      });
    }

    // Accept both the plural list and the singular legacy secret.
    const apiKeys = [...parseApiKeys(env.AI_API_KEYS), ...parseApiKeys(env.AI_API_KEY)];
    if (apiKeys.length === 0) {
      return json(
        {
          error: {
            message: "Server misconfigured: AI_API_KEYS is not set",
            type: "server_error",
          },
        },
        500
      );
    }

    const provided = extractBearer(request.headers.get("Authorization"));
    if (!isAuthorized(provided, apiKeys)) {
      return json({ error: { message: "Invalid API key", type: "invalid_request_error" } }, 401);
    }

    const allowed = parseModelList(env.ALLOWED_MODELS);
    const budget = Number(env.DAILY_NEURON_BUDGET);
    const dailyBudget = Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_DAILY_NEURON_BUDGET;

    if (request.method === "GET" && url.pathname === "/v1/models") {
      return json(buildModelsResponse(allowed, dailyBudget));
    }

    if (request.method === "GET" && url.pathname === "/status") {
      return json(
        buildStatusResponse({
          version: env.CF_VERSION_METADATA,
          keysConfigured: apiKeys.length,
          allowedModels: allowed,
          dailyNeuronBudget: dailyBudget,
        })
      );
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json(
          { error: { message: "Request body must be valid JSON", type: "invalid_request_error" } },
          400
        );
      }

      const validation = validateChatRequest(body, allowed);
      if (!validation.ok) {
        return json(
          { error: { message: validation.message, type: "invalid_request_error" } },
          validation.status
        );
      }

      const { model, messages, maxTokens } = validation.value;
      try {
        const ai = env.AI as unknown as AiRunner;
        const result = await ai.run(model, { messages, max_tokens: maxTokens });
        return json(buildChatCompletion(model, extractContent(result), result));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json(
          { error: { message: `Workers AI error: ${message}`, type: "upstream_error" } },
          502
        );
      }
    }

    return json(
      {
        error: {
          message: `No route for ${request.method} ${url.pathname}`,
          type: "invalid_request_error",
        },
      },
      404
    );
  },
} satisfies ExportedHandler<Env>;
