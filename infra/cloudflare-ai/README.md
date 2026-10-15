# Savr Cloudflare AI worker

A tiny, self-hostable **OpenAI-compatible** gateway in front of
[Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/). It lets
Savr's summarization feature use Cloudflare's generous free Workers AI tier
without exposing a Cloudflare account token to the browser, and lets you
**whitelist which models** users can pick.

```
Savr (browser)
  │  Authorization: Bearer <AI_API_KEY>
  ▼
this worker  ──(AI binding, no stored token)──▶  Cloudflare Workers AI
```

Savr already talks to any OpenAI-compatible `/chat/completions` endpoint through
its **Local / Custom** provider, and its ↻ button fills the model dropdown from
`GET /v1/models`. This worker speaks exactly that shape, so **no Savr code
changes are needed** — you just paste the worker URL and key into Preferences.

## Why a worker at all?

- **Keeps Workers AI credentials server-side.** Savr summarization runs in the
  browser. Pointing it straight at `api.cloudflare.com` would mean shipping your
  Cloudflare API token to the browser. Here the browser only ever sees the
  throwaway `AI_API_KEY`; the Cloudflare account stays behind the worker.
- **Whitelisting.** `ALLOWED_MODELS` is enforced server-side and published as the
  `/v1/models` list, so the dropdown can only ever offer models you allow.
- **Self-hostable.** Copy this directory, deploy it to your own Cloudflare
  account, and you have your own private endpoint.

## Prerequisites

- A Cloudflare account (the Workers **free** plan includes Workers AI).
- Node.js 18+ and `npm`.
- `npx wrangler login` (or a `CLOUDFLARE_API_TOKEN` in your environment).

## Setup

```bash
cd infra/cloudflare-ai
npm install
npx wrangler login
```

Generate the key(s) Savr will send, and store them as a worker secret. The
secret takes **one or more** keys, comma- or newline-separated — so you can keep
a list and add/remove entries without ever redeploying:

```bash
# one key, pasted when prompted
openssl rand -hex 32 | npx wrangler secret put AI_API_KEYS

# or several (e.g. one per device), piped as a newline-separated list
K1=$(openssl rand -hex 32); K2=$(openssl rand -hex 32)
printf '%s\n%s\n' "$K1" "$K2" | npx wrangler secret put AI_API_KEYS
```

Optionally edit `wrangler.toml` `[vars]` before deploying:

- `ALLOWED_MODELS` — comma-separated model ids the dropdown may offer.
- `ALLOWED_ORIGINS` — comma-separated browser origins, or `*` (default). Access
  is gated by the key, not the origin, so `*` is fine for personal use.

Deploy:

```bash
npm run deploy
```

Wrangler prints the URL, e.g. `https://savr-cloudflare-ai.<you>.workers.dev`.

## Configure Savr

1. Open **Preferences → AI Summarization** and enable it.
2. Provider: **Local / Custom**.
3. **Server URL**:
   `https://savr-cloudflare-ai.<you>.workers.dev/v1/chat/completions`
4. **API key**: one of the values you put in `AI_API_KEYS`.
5. Press the **↻** button beside **Model** to fetch the whitelist, then pick a
   model. (Or type one of the ids from `ALLOWED_MODELS` manually.)

## Endpoints

| Method | Path                   | Auth   | Purpose                                     |
| ------ | ---------------------- | ------ | ------------------------------------------- |
| GET    | `/v1/models`           | Bearer | Whitelisted model ids (OpenAI list)         |
| POST   | `/v1/chat/completions` | Bearer | Non-streaming chat completion               |
| GET    | `/status`              | Bearer | Version, config, per-model estimates        |
| GET    | `/` , `/health`        | none   | Liveness, version, deploy time              |

`/health` is intentionally minimal (no keys, no counts). `/status` reports the
running version and deploy time (from the `version_metadata` binding), how many
keys are configured, the allowed models, the daily budget, and the per-model
estimates. The worker keeps **no state**, so there are deliberately no usage
counters (summaries run, neurons spent) — those would need a Durable Object.

```bash
BASE=https://savr-cloudflare-ai.<you>.workers.dev
KEY=$(cat ~/.config/savr/worker-key)   # one of the keys in AI_API_KEYS

curl -s "$BASE/v1/models" -H "Authorization: Bearer $KEY"

curl -s "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct-fp8",
    "messages": [{"role": "user", "content": "Summarise: The quick brown fox..."}],
    "max_tokens": 256
  }'
```

### Model estimates on `/v1/models`

Standard OpenAI clients only read `data[].id`, so the worker attaches
Savr-specific estimates under a namespaced `x_savr` key (ignored by everyone
else):

```json
{
  "object": "list",
  "x_savr": {
    "daily_neuron_budget": 10000,
    "article_words": 1000,
    "article_tokens": 1333,
    "prompt_tokens": 150,
    "summary_tokens": 300
  },
  "data": [
    {
      "id": "@cf/meta/llama-3.1-8b-instruct-fp8",
      "object": "model",
      "owned_by": "cloudflare",
      "x_savr": { "neurons_per_summary": 28.3, "summaries_per_day": 353 }
    }
  ]
}
```

The estimate always presumes a **1,000-word article** (~1,333 tokens) plus
~150 tokens of prompt scaffolding and a ~300-token summary at the default
**Moderate** detail level. Neuron cost is driven mostly by article length and,
for large models, output length. Adjust the budget with the
`DAILY_NEURON_BUDGET` var; unknown model ids are still listed, just without an
estimate. (Savr's UI currently renders only `id` — wire the `x_savr` fields
into the model picker if you want to show them.)

Approximate summaries/day at 10,000 neurons for the default whitelist:

| Model | Summaries/day |
| ----- | ------------- |
| `@cf/qwen/qwen3-30b-a3b-fp8` | ~625 |
| `@cf/meta/llama-3.1-8b-instruct-fp8` | ~353 |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | ~160 |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | ~99 |

## Local development

```bash
cp .dev.vars.example .dev.vars   # then edit AI_API_KEYS
npm run dev                      # http://localhost:8787
npm test                         # unit tests for the translation/validation logic
npm run typecheck
```

## Model ids

The defaults in `wrangler.toml` are current Cloudflare-hosted chat models, but
the catalog changes regularly. Browse
<https://developers.cloudflare.com/workers-ai/models/> and filter to **Text
Generation**; use the id shown on the model page (they look like
`@cf/<author>/<model>`). Then update `ALLOWED_MODELS` and redeploy.

## Keys & rotation

- **Multiple keys are supported.** `AI_API_KEYS` holds a comma- or
  newline-separated list; any listed key is accepted. Use one key per device if
  you like.
- **No restart or redeploy.** Keys are a Worker *secret*, read from the
  environment on each request. `wrangler secret put AI_API_KEYS` updates the
  value in place; the running worker picks it up automatically (allow a short
  propagation window). You never edit `wrangler.toml` or redeploy to change keys.
- **Rotate with zero downtime:** add a new key to the list, switch Savr to it,
  then remove the old key from the list.
- **Revoke one key** by dropping it from the list and re-putting the secret
  (e.g. `printf '%s\n' "$REMAINING" | npx wrangler secret put AI_API_KEYS`).
  `wrangler secret delete AI_API_KEYS` removes them all (the worker then returns
  `500` until a key is set).
- **Inspect names only:** `wrangler secret list` shows that `AI_API_KEYS` exists,
  never its value — Cloudflare does not return secret values.

## Notes & caveats

- **Free tier limits.** Workers AI gives a daily neuron allowance; large models
  (70B, MoE) and long articles burn it faster. Note that Savr hard-cuts article
  text at ~12k characters (~2,000 words) *before* sending — it does not chunk —
  so anything longer is summarised from its first part only.
- **Non-streaming only.** Savr requests a single JSON response, so streaming is
  not implemented. Requesting `stream: true` still gets a normal JSON reply.
- **The key is not a secret from its own user.** A key from `AI_API_KEYS` is
  stored in a browser cookie by Savr (like any provider key there). Treat it as
  a personal access token: rotate it with `wrangler secret put` if it leaks. It
  only grants access to the models you whitelisted.
- **Sharing.** The design is per-person: deploy your own worker and key. Don't
  hand out a key that fronts a shared account you care about, since anyone with
  it can spend your Workers AI allowance.
