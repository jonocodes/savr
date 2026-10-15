# implement/84
*Started: 2026-10-13 · Updated: 2026-10-13*

**What this branch did**
Made the CORS proxy self-deployable with token auth (one-click Deploy to Cloudflare button), and stopped the Savr app from ever leaking the proxy token. Merged as PR #87 (`d359397`); issue #84 closed. The shared public worker was then deployed with the new code (`--env public`).

The durable contracts from this branch are recorded as ADRs — [0001](../adr/0001-locked-proxy-token-auth.md) (token auth), [0002](../adr/0002-unconfigured-proxy-fails-closed.md) (fail-closed setup), [0003](../adr/0003-portable-proxy-core.md) (portable core), [0004](../adr/0004-proxy-token-is-a-secret.md) (secret handling). This file keeps the session-level reasoning the ADRs deliberately don't hold.

**Decisions** (session-level; contracts live in the ADRs above)
- Deploy button points at the monorepo subdirectory (`.../tree/main/infra/cors-worker`) — supported because the subdir is isolated; added `package.json` with `cloudflare.bindings.PROXY_TOKENS.description` so the button prompts for the secret. A separate template repo was unnecessary.
- Worker tests run in CI via a bash-expanded glob (`node --test infra/cors-worker/*.test.mjs`) because the Node 20 runner has no `--test` glob support.
- Cookie→localStorage migration runs at startup in `main.tsx`, not lazily in Preferences, so the legacy cookie dies on the next load even if the user never opens the screen.

**Rejected**
- Generic masking of *every* `token=` in every string — would mangle legitimate target URLs in logs; only the configured proxy's token is masked.
- Over-masking arbitrary path segments — only UUID-shaped ones are masked; a non-UUID custom path token is a known gap (acceptable while the setup page issues UUIDs).
- 401 for bad tokens — tells scanners the endpoint is real.
- SameSite/HttpOnly tweaks to keep the proxy cookie — localStorage is the right store for a value only the proxy should see.
- App-side "test proxy on paste" UI — not asked for in #84; the `/health` endpoint exists for #86/probing instead.

**Gotchas**
- `node --test infra/cors-worker/` (directory arg) fails on Node 24 (treats it as a module). Use `cd infra/cors-worker && node --test` or the glob.
- Wrangler warns "Multiple environments are defined" when deploying without `--env`; the worker's `deploy` script uses `--env=""` for top-level and the README documents `--env public` for the shared instance.
- `infra/cors-worker/package-lock.json` is intentionally an empty lockfile, kept so the deploy button's isolated-subdir build has a lockfile to `npm ci`.
- Jest `lib/__tests__/setup.js` globally mocks `~/utils/article/tools` and `~/config/environment` (only `VITE_DEBUG`). `corsProxy.ts` reads `environmentConfig.defaultCorsProxy`, so tests touching it must add that to their environment mock (done in `failureReport.test.ts`).
- Worker tests stub `globalThis.caches`; `worker.js` reads `globalThis.caches?.default` so tests without a cache stub don't crash.
- The public worker was deployed and verified on 2026-10-13 (health reports `authRequired: false`; proxied `example.com` → 200 with CORS). Future worker changes need a redeploy to take effect.

**Open threads**
- #85 (Deno Deploy): reuse `core.js` per ADR 0003; needs a cache adapter (`caches.open("savr-proxy")` + fire-and-forget put) and `Deno.env` for `PROXY_TOKENS`/`PUBLIC`; run the shared test suite against the Deno entry too.
- #86 (proxy-exhausted UX): its probe deliberately needs no `/health`; a locked proxy's 404 still carries CORS headers, which reads as "running, but misconfigured" — keep that property when touching `plain()`/`notFound()` (ADR 0001).
- Non-UUID path-style tokens are not masked in app diagnostics (ADR 0004); extend `tokenCandidates()` if custom token formats become common.
- Any future worker change must be redeployed: `npx wrangler deploy --env public` (shared instance) and the default env for self-deployers.
