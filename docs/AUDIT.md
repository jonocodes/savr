# Project Audit — June 2026

Full audit of architecture, code, tests, and documentation. Each item is a
checkbox so progress can be tracked; check items off as they are fixed and
note the commit/PR next to them where useful.

Severity tiers: 🔴 fix first · 🟠 high · 🟡 medium · 🟢 cleanup

---

## 1. Security

- [x] 🔴 **Sanitize article HTML before store/render.** DOMPurify added at
  render time in `ArticleComponent.tsx` (covers both the readability view and
  "Show Original"). Also added to `SubmitScreen.tsx` preview.
- [x] 🔴 **Sandbox or sanitize the "Show Original" view.** DOMPurify now strips
  event handlers, iframes, and scripts from raw.html at render time. A proper
  sandboxed-iframe approach remains as a future improvement.
- [x] 🔴 **Escape template interpolations.** `lib/src/article.ts` now has an
  `escapeHtml` helper applied to title/byline/published/readTime (content
  intentionally left as-is). `lib/src/lib.ts` href is now quoted and restricted
  to http/https protocols. `lib/src/contentType.ts` markdown title escaped.
- [x] 🔴 **Add `event.origin` checks to `postMessage` handlers.**
  Both `ArticleListScreen.tsx` and `SubmitScreen.tsx` now reject messages with
  a null/missing origin. The bookmarklet handler also gained try/catch and
  properly resets the `ingesting` flag in a finally block.
- [x] 🟠 **Move LLM API keys out of cookies → localStorage.** `cookies.ts`
  now stores keys in localStorage; includes one-time migration from cookie
  (copies value, then clears the cookie so it's no longer sent over the network).
- [x] 🟠 **Stop dumping sensitive values on the Diagnostics page.** localStorage
  values for keys matching `api.key`, `api_key`, `token`, `secret`, `password`
  are now shown as `[redacted]`.
- [x] 🟠 **URL-encode the CORS proxy target.** `tools.ts` now uses
  `encodeURIComponent(url)` when a proxy is set.
- [ ] 🟡 **Make the default CORS proxy a conscious decision.** All article and
  image fetches route through a hardcoded personal Cloudflare worker
  (`src/config/environment.ts:33-37`) — full reading history goes to a third
  party. Document it in the privacy policy or make it opt-in.

## 2. Correctness bugs

- [x] 🔴 **Slug collisions silently overwrite articles.** Added `finalizeSlug`
  in `lib/src/ingestion.ts`: empty slugs (non-Latin titles) fall back to the
  plain base `article`; a hash suffix is appended *only* when the slug is
  already taken by a different article; re-ingesting the same URL stays
  idempotent. Slugs are also truncated at 80 chars. Covered by
  `lib/__tests__/ingestion-slug.test.ts`.
- [x] 🟠 **Await content writes in ingestion.** `raw.html` and `index.html`
  stores are now awaited, so failures surface and metadata can't reach other
  devices before content exists.
- [x] 🟠 **Await metadata updates in ArticleScreen.** Favorite/archive/
  unarchive/edit handlers are async, await the write, and guard on
  `storage.client` (snackbar instead of crash when storage isn't ready).
- [x] 🟠 **"Enable synchronization" toggle now actually stops sync.**
  `RemoteStorageProvider` calls `remoteStorage.stopSync()`/`startSync()` when
  the setting changes (previously it only hid the widget).
- [x] 🟠 **Surface real ingestion errors.** `ingestUrl` rethrows the original
  error instead of a generic wrapper; the add-article dialog shows the actual
  message. (The stuck `ingesting` flag was fixed in the security pass.)
- [x] 🟡 **Per-row network GETs in the article list.** Content-exists check
  now uses `maxAge: false` (local cache only); thumbnail effect dep fixed.
- [x] 🟡 **Metadata write race.** Replaced whole-object
  `updateArticleMetadata` with `patchArticleMetadata(client, slug, partial)`
  which merges over the latest Dexie record in a transaction — concurrent
  writers no longer clobber each other's fields with stale copies. All
  callers converted.
- [x] 🟡 **`fetchWithTimeout` timeout detection.** Passes
  `AbortSignal.timeout()` directly to fetch; `TimeoutError` branch now works.
- [x] 🟡 **Object URL leaks** in `resizeImage`/`convertToWebP` — URLs revoked
  in both onload and onerror paths.
- [x] 🟡 **Image extension parsing.** New `getImageExtensionFromUrl` parses
  the URL path (query strings/hashes no longer baked into resource names);
  srcset selection no longer compares `w` and `x` descriptors against each
  other (prefers width descriptors when present).
- [x] 🟡 **Public export republish on scroll.** Progress-only saves pass
  `skipPublicExport`, so reading an article no longer republishes the
  database. (Prefs warning copy about summaries/progress still worth a look.)
- [x] 🟡 **Triple-click anywhere opened Diagnostics.** Removed the
  document-level gesture entirely — Diagnostics is reachable from Preferences.
- [x] 🟢 `syncMissingArticles` now diffs slug sets instead of counts.
- [x] 🟢 `recursiveDeleteDirectory` no longer calls `remove()` on folder paths
  (RS folders are implicit); successful deletes no longer report errors.
- [x] 🟢 `waitForSyncThenClose` removes its `sync-done` listener on timeout.
- [x] 🟢 Edit-info rewrite preserves the stored document shape (fragment stays
  a fragment; doctype preserved for full documents).

## 3. Architecture & repo hygiene

- [ ] 🟠 **Invert the lib→src dependency.** `lib/src/ingestion.ts:19-29` imports
  from `~/utils/storage`, `tools`, `summarization`, `cookies` — the "shared
  library" depends on the app layer and can't be reused. Inject these as
  callbacks or move persistence up into `src/`.
- [ ] 🟠 **Move server/test tooling out of `dependencies`.** `fastify` (+
  plugins), `armadietto`, `playwright`, `commander`, `http-proxy`, `ts-node`,
  `tsx`, `mozilla-readability-cli` belong in devDependencies; `typescript`
  appears in both sections at different versions — keep one (dev).
- [ ] 🟠 **Split the god modules** (follow the `reconciler.ts` extraction
  pattern): `ArticleScreen.tsx` (1,314 lines), `PreferenceScreen.tsx` (1,273),
  `DiagnosticsScreen.tsx` (1,137), `ArticleListScreen.tsx` (1,005),
  `lib/src/ingestion.ts` (1,087), `src/utils/storage.ts` (874).
- [ ] 🟡 **Pick one browser extension.** `browser-extension/` is Manifest v2
  (dead on Chrome since 2022); `extension2/` is v3 but looks like a test
  harness; plus five bookmarklet variants in `bookmarklet/`. Keep one, delete
  the rest, document the choice.
- [ ] 🟡 **Delete abandoned code:** `proxy.js` ("TODO: never quite got this to
  work"), the WiFi-only-sync feature commented out across ~5 files
  (`RemoteStorageProvider.tsx`, `network.ts`, `cookies.ts`,
  `PreferenceScreen.tsx`, `MANUAL_TESTING_WIFI_SYNC.md`), commented-out blocks
  in `ingestion.ts:399-433,942-1087` and `ArticleListScreen.tsx:940-1002`.
- [ ] 🟡 **Remove committed compiled artifacts.** `lib/__tests__/index.test.js`
  (a stale placeholder, not a build of the current test), `.js.map`, `.d.ts`;
  gitignore `lib/__tests__/*.test.js*` (keep `setup.js` and `__mocks__/*.js`).
- [ ] 🟡 **Pick one lockfile.** Both `bun.lock` and `package-lock.json` are
  committed.
- [ ] 🟢 Remove top-level `console.log(generateRandomString())` that runs on
  every import (`ingestion.ts:627`), the base64-image dump at
  `ingestion.ts:163`, and the ~98 console.log lines across src+lib.
- [ ] 🟢 Deduplicate the summarize flow (~40 lines triplicated in
  `ArticleScreen.tsx:207,1182,1247`, plus near-copies in `SubmitScreen.tsx` and
  `ingestion.ts`).
- [ ] 🟢 Group `src/utils/` into subdirectories (sync/, article/, ai/, ui/,
  net/).
- [ ] 🟢 Remove dead exports `deleteAllRemoteStorage`,
  `resetSyncStateAndReplaceWithServer` (`storage.ts:781,831`); `removeArticle`
  ignores its first parameter (`tools.ts:23`).
- [ ] 🟢 `share-handler.tsx:66-89` renders debug output to end users and always
  says "Redirecting in 2 seconds" though the delay is 0 outside debug mode.

## 4. Tests & CI

- [x] 🟠 **Run more than Jest in CI.** Added lint + typecheck steps to the
  `unit-tests` job; added a separate `e2e-smoke` job that installs Playwright
  and runs `smoke.spec.ts` on every push/PR. Full RS-backed e2e in CI (natural-
  sync, sync-no-loop, bulk-delete) still needs further work (server provisioning).
- [x] 🟠 **Resolve the dead `syncLogic.ts` module.** Deleted `src/utils/syncLogic.ts`
  and its 476-line test file — the app uses `reconciler.ts` exclusively.
- [ ] 🟠 **Unit-test `storage.ts`** (874 lines, zero unit tests) — or keep
  extracting its decision logic into pure modules like `reconciler.ts`.
- [x] 🟡 **Strengthen `smoke.spec.ts`** to assert one rendered React element.
  Added a third test that waits for `networkidle` then asserts the FAB is
  visible — a white-screen crash now fails.
- [ ] 🟡 **Add tests for `summarization.ts`, `publicExport.ts`, and the
  `share-handler` route** (none exist; bookmarklet entry is covered, share
  target is not).
- [x] 🟡 **Deduplicate e2e boilerplate.** Extracted `loadTestEnv()` (+ `TestEnv`
  type) into `tests/e2e/utils/test-helpers.ts`. Updated all 11 spec files that
  copy-pasted the `.test-env.json` loading block (saved ~130 lines total).
  `ingestArticleViaDialog()` deduplication left as future work.
- [x] 🟡 **Remove redundant/dead specs.** Deleted
  `sync-clears-local-on-connect.spec.ts` (280 fully-skipped lines for an
  unimplemented feature). Trimmed `main-page.spec.ts` from 7 tests to 3 that
  always assert (removed the "add article button" duplicate and 3 silent no-ops).
- [ ] 🟡 **Replace hard waits with polling.** ~14 `waitForTimeout` calls in
  `bookmarklet-sync`, `incremental-sync`, `edit-article-info`,
  `widget-visibility` — use the Dexie-polling pattern from `natural-sync`.
  (Keep the intentional 20s wait in `sync-no-loop`.)
- [x] 🟡 **Fix silent no-op tests:** deleted the 4 conditional tests from
  `main-page.spec.ts` (see above).
- [x] 🟢 Removed the deprecated `globals['ts-jest']` block from `jest.config.cjs`.
- [ ] 🟢 No React component tests exist (node test env, no jsdom/RTL);
  `useTextToSpeech.test.ts` covers only the exported pure helpers.

## 5. Documentation

- [x] Fix `README.md`: `npm run start:prod` doesn't exist (→ `npm run start`).
- [x] Update `CLAUDE.md` test table: listed 6 of 16 specs and wrongly marked
  `multi-browser-sync` as skipped.
- [x] Delete `README-tanstack.md` (leftover TanStack.com starter boilerplate,
  `pnpm` commands, describes a different project); fold the useful env-mode
  notes into `docs/ENVIRONMENT_VARIABLES.md`.
- [x] Document `VITE_APP_MODE` status in `docs/ENVIRONMENT_VARIABLES.md`
  (set by `dev:prod` and test mocks but never read by app code — flagged as
  vestigial).
- [x] Fix port references: `docs/WIDGET-QUICKSTART.md` (8000 → 3000 for
  `npm run dev`), `docs/README-connect-widget.md` OAuth example.
- [x] Mark `SYNC_TESTING.md` as a proposal with a status note (the extracted
  `syncLogic.ts` it proposed exists but is currently unused by the app).
- [x] Mark `docs/SYNC_REDESIGN_DISCUSSION.md` as historical session notes
  (work completed).
- [ ] 🟢 Remove `VITE_APP_MODE` from the `dev:prod` script and test mocks once
  confirmed unused (code change, not just docs).
- [ ] 🟢 Consolidate doc sprawl: move root-level `SYNC_SCENARIOS.md`,
  `SYNC_SCENARIOS_ADDITIONAL.md`, `SYNC_TESTING.md`,
  `MANUAL_TESTING_WIFI_SYNC.md` into `docs/`; keep README/CLAUDE/LICENSE at
  root.
- [ ] 🟢 Add a CONTRIBUTING/developer-setup doc; document the Dexie schema and
  how the browser extension integrates with the PWA.

---

## Suggested order

1. **Security** (section 1, 🔴 items) — sanitization, origin checks, API-key
   storage.
2. **Data integrity** (section 2, 🔴/🟠) — slugs, awaited writes.
3. **CI** (section 4, first item) — lint + typecheck + stable e2e tier, so the
   rest of the work has a regression net.
4. **Cleanup sweep** (🟢 items across sections) — low effort, high clarity.
5. **Refactors** (section 3) — lib/src inversion, god-module splits, ongoing.

## What's healthy (no action needed)

- `reconciler.ts` is a small pure module with unit tests; `storage.ts` event
  handling has well-documented guards against sync feedback loops.
- `rsPatchDisconnect.ts` is an exemplary workaround (documented, upstream
  issue linked).
- Dexie `useLiveQuery` reactive state; careful blob-URL cleanup in
  ArticleScreen's content effect.
- Project typechecks and lints clean; 261/261 unit tests pass in ~1.6s.
- Broad e2e suite (16 specs) covering sync, multi-browser, PDF/markdown/image
  ingestion, TTS, bookmarklet.
