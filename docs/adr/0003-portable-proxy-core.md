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
