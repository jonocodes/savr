# 0003. One portable proxy core, thin platform entries

*Status: Accepted · 2026-10-13*

## Context

Cloudflare Workers is the recommended host for the proxy, but Deno Deploy is a documented alternative (#85), and auth/SSRF/caching behaviour must not drift between the two. Cloudflare-specific APIs (`caches.default`, `ctx.waitUntil`) previously sat inline in the request handler, which would have forced a fork for any second platform.

## Decision

All behaviour lives in `core.js` as a single entry point:

```
handleRequest(request, { tokens, isPublic, cache, waitUntil })
```

`worker.js` is a thin Cloudflare entry: it reads `PROXY_TOKENS`/`PUBLIC` from the environment and supplies `caches.default` and `ctx.waitUntil`. Platform-neutral tests (`node --test`) exercise the core and the Cloudflare entry.

## Consequences

- The Deno entry is a cache adapter plus a `Deno.env` reader, not a fork of the logic.
- New platform-specific capabilities go through the options port (`cache`, `waitUntil`) rather than into the core.
- Edge caching is optional: the core tolerates `cache: null` and still sets correct browser `Cache-Control` headers.
- Tests for shared behaviour should target `core.js` so they can be run against every platform entry.

## Update (2026-10-17, #124): the second platform is Node

The second entry turned out to be Node (`node.js`, also packaged as a Docker image), not Deno. Deno remains possible on the same port. Two things the first entry never needed are now part of the options port:

- `fetch`, the upstream client. Core's SSRF check sees only the target's *literal* hostname, which is enough on Cloudflare's edge because it has no LAN. A self-hosted box does have one, and a hostname can resolve to a private address. So SSRF protection is split: core keeps the literal check as a first line, and each non-Cloudflare entry injects a `fetch` that checks the *resolved* address at connect time (`guarded-fetch.js`, on the pure address policy in `ssrf-policy.js`). Core follows redirects itself, so every hop passes through the injected guard.
- `setupSecretStep`, the runtime-specific "how to set the secret" text on the setup page.

The shared behaviour suite (`shell-cases.mjs`) runs against both entries.
