# 0002. An unconfigured proxy serves a setup page and never proxies

*Status: Accepted · 2026-10-13*

## Context

The Deploy to Cloudflare button makes it easy to stand up a personal proxy and skip the token step. An accidentally-open proxy burns the deployer's free-tier quota and acts as an open relay under their account. The shared instance was previously open by default, which made "open" the path of least resistance.

## Decision

With neither `PUBLIC` nor `PROXY_TOKENS` set, the worker serves a **setup page** (a freshly generated UUID, the `wrangler secret put PROXY_TOKENS` command, and the exact prefix to paste into Savr) and refuses to proxy any request.

Being open is an explicit opt-in: `PUBLIC = "true"`, set only in `[env.public]` for the shared instance. The default worker config is generic (`savr-cors-proxy`) and locked.

## Consequences

- A forgotten deploy step can never leave an open proxy.
- Finishing setup requires visiting the worker URL in a browser; the page is the documentation.
- Tests must keep the property "unconfigured never calls fetch" true for both `/` and `/?url=…`.
- The shared instance is unaffected as long as `--env public` is the deploy target; deploying it without the env would replace the open instance with the setup page.
