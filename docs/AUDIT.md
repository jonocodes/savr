# Project Audit — June 2026

Full audit of architecture, code, tests, and documentation. Each item is a
checkbox so progress can be tracked; check items off as they are fixed and
note the commit/PR next to them where useful.

Severity tiers: 🔴 fix first · 🟠 high · 🟡 medium · 🟢 cleanup

---

## 1. Security

- [ ] 🔴 **Sanitize article HTML before store/render.** Article content is
  rendered with `dangerouslySetInnerHTML` (`src/components/ArticleComponent.tsx:46`,
  `src/components/SubmitScreen.tsx:671`) and no sanitizer exists anywhere in the
  repo (acknowledged TODO at `lib/src/ingestion.ts:536`). Readability strips
  `<script>` but keeps inline event handlers and iframes. Run DOMPurify before
  `storeFile` and/or before render.
- [ ] 🔴 **Sandbox or sanitize the "Show Original" view.** `ArticleScreen.tsx`
  (~line 569) injects the verbatim fetched page (`raw.html`, saved unmodified at
  `ingestion.ts:537`) into the app's origin — inline handlers execute with
  access to IndexedDB, the RemoteStorage token, and cookies. Consider a
  sandboxed iframe.
- [ ] 🔴 **Escape template interpolations.** `lib/src/article.ts:51-53`
  interpolates title/byline unescaped; `lib/src/lib.ts:142` builds an
  *unquoted* `href` attribute from the article URL. `lib/src/contentType.ts:91`
  interpolates markdown title into `<title>` unescaped.
- [ ] 🔴 **Add `event.origin` checks to `postMessage` handlers.**
  `ArticleListScreen.tsx:519-534` ingests `event.data.html` from any window;
  `SubmitScreen.tsx:96-102` alerts on messages from any origin. Combined with
  the XSS above this is persistent, sync-propagated XSS.
- [ ] 🟠 **Move LLM API keys out of cookies.** Keys are stored via
  `document.cookie` with no `Secure`/`SameSite` flags (`src/utils/cookies.ts:457-464`)
  so they're sent to the hosting server/CDN on every request. Use localStorage
  at minimum.
- [ ] 🟠 **Stop dumping cookies/localStorage on the Diagnostics page**
  (`DiagnosticsScreen.tsx:572-581`), or at least redact key values.
- [ ] 🟠 **URL-encode the CORS proxy target.** `tools.ts:59` concatenates the
  raw URL onto a `?url=` proxy — any article URL containing `&` or `#` is
  misparsed. Use `encodeURIComponent`.
- [ ] 🟡 **Make the default CORS proxy a conscious decision.** All article and
  image fetches route through a hardcoded personal Cloudflare worker
  (`src/config/environment.ts:33-37`) — full reading history goes to a third
  party. Document it in the privacy policy or make it opt-in.

## 2. Correctness bugs

- [ ] 🔴 **Slug collisions silently overwrite articles.** Slugs derive purely
  from the title (`lib/src/ingestion.ts:289-308`); same-title articles overwrite
  each other in storage and Dexie. Non-Latin titles slugify to `""`, are written
  to `saves//`, and can never sync (reconciler drops empty slugs,
  `src/utils/reconciler.ts:30`). Add a hash suffix; implement the
  "truncate at max length" TODO.
- [ ] 🟠 **Await content writes in ingestion.** `raw.html` and `index.html`
  stores are fire-and-forget (`ingestion.ts:537,559`) while `article.json` is
  awaited — metadata can reach other devices before content exists
  ("(content missing)" rows), and write failures report success.
- [ ] 🟠 **Await metadata updates in ArticleScreen.** `handleToggleFavorite` /
  `handleArchive` / `handleUnarchive` (`ArticleScreen.tsx:179,275,290`) don't
  await `updateArticleMetadata`, so the catch can never fire and the success
  snackbar shows even on failure. (The ArticleListScreen equivalents await —
  the screens diverged.) Also remove the `storage.client!` non-null assertions
  that crash on deep-link before RS init.
- [ ] 🟠 **Make the "Enable synchronization" toggle actually stop sync.** The
  cookie only controls widget visibility (`RemoteStorageProvider.tsx:116-123`,
  `widgetVisibility.ts:46-48`); nothing calls `stopSync()`/`disconnect()`.
- [ ] 🟠 **Surface real ingestion errors.** `ingestion.ts:920-923` discards the
  cause and throws generic "error during ingestion"; UI shows "Error requesting
  article" with no detail. Also the bookmarklet handler's `ingesting` flag is
  never reset on failure (`ArticleListScreen.tsx:517`), sticking the dialog at
  "Ingesting…".
- [ ] 🟡 **Per-row network GETs in the article list.** Content-exists check at
  `ArticleListScreen.tsx:117` lacks `maxAge: false` unlike every other read —
  N+1 requests and "(content missing)" flicker offline.
- [ ] 🟡 **`updateArticleMetadata` race.** Whole-record read-modify-write
  (`tools.ts:28-47`); concurrent writers (scroll-progress saver, summarizer,
  archive, incoming sync) race last-write-wins. Use partial updates /
  transactions.
- [ ] 🟡 **Fix `fetchWithTimeout` timeout detection.** The abort wiring at
  `tools.ts:51-66` means the `TimeoutError` branch never fires; pass
  `AbortSignal.timeout()` directly to fetch.
- [ ] 🟡 **Revoke object URLs in `resizeImage`/`convertToWebP`**
  (`ingestion.ts:361,395`) — leaks a blob per image per ingest.
- [ ] 🟡 **Image extension parsing.** `ingestion.ts:111-115` bakes query
  strings into stored resource names (`photo.jpg?w=800` → ext `jpg?w=800`);
  srcset descriptor comparison mixes `2x` and `100w` units.
- [ ] 🟡 **Public export republishes on every scroll-progress save.**
  `markDirty()` fires on every metadata write (`tools.ts:44`), so the full
  database (incl. read progress and AI summaries) republishes every 45s while
  reading. Debounce/exclude progress writes; mention summaries/progress in the
  prefs warning copy.
- [ ] 🟡 **Triple-click anywhere opens Diagnostics.** Document-level listener
  counts any 3 clicks in 500ms (`ArticleListScreen.tsx:375-396`); scope it to a
  deliberate gesture/element.
- [ ] 🟢 `syncMissingArticles` reports net count deltas (+3/−3 reads as "no
  discrepancies") (`storage.ts:496-506`).
- [ ] 🟢 `recursiveDeleteDirectory` calls `client.remove()` on directory paths,
  polluting `errors` and making success look like failure (`storage.ts:727`).
- [ ] 🟢 `waitForSyncThenClose` leaks its `sync-done` listener on timeout
  (`ArticleListScreen.tsx:413-433`).
- [ ] 🟢 Doctype dropped when rewriting `index.html` after info edit
  (`ArticleScreen.tsx:435`).

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

- [ ] 🟠 **Run more than Jest in CI.** `.github/workflows/test.yml` runs unit
  tests only — no lint, no `tsc --noEmit`, no e2e. Add lint + typecheck, plus a
  stable e2e tier (`smoke`, `natural-sync`, `sync-no-loop`, `bulk-delete`) as a
  separate job.
- [ ] 🟠 **Resolve the dead `syncLogic.ts` module.** It is imported only by its
  own 476-line test file; the app uses `reconciler.ts`. Either wire it in or
  delete both.
- [ ] 🟠 **Unit-test `storage.ts`** (874 lines, zero unit tests) — or keep
  extracting its decision logic into pure modules like `reconciler.ts`.
- [ ] 🟡 **Strengthen `smoke.spec.ts`** to assert one rendered React element
  (e.g. the FAB); today a white-screen crash still passes.
- [ ] 🟡 **Add tests for `summarization.ts`, `publicExport.ts`, and the
  `share-handler` route** (none exist; bookmarklet entry is covered, share
  target is not).
- [ ] 🟡 **Deduplicate e2e boilerplate.** The `.test-env.json` loading block is
  copy-pasted in 9+ specs and the dialog-ingestion sequence in 5+; the existing
  `tests/e2e/utils/test-helpers.ts` is largely unused. Extract `loadTestEnv()` /
  `ingestArticleViaDialog()` fixtures.
- [ ] 🟡 **Remove redundant/dead specs:** multi-browser delete sync is tested
  twice (`multi-browser-sync` steps 6-10 vs `multi-browser-archive-sync` test 1);
  `sync-clears-local-on-connect.spec.ts` is 280 fully-skipped lines for an
  unimplemented feature (delete or convert to an issue);
  `main-page.spec.ts` "working add article button" duplicates
  `add-article-dialog.spec.ts`.
- [ ] 🟡 **Replace hard waits with polling.** ~15 `waitForTimeout` calls in
  `bookmarklet-sync`, `incremental-sync`, `edit-article-info`,
  `widget-visibility`, `main-page` — use the Dexie-polling pattern from
  `natural-sync`. (Keep the intentional 20s wait in `sync-no-loop`.)
- [ ] 🟡 **Fix silent no-op tests:** 4 of 7 `main-page.spec.ts` tests are
  wrapped in `if (count > 0)` / `if (visible)` and can pass without asserting
  anything — seed data deterministically or delete them.
- [ ] 🟢 Remove the deprecated `globals['ts-jest']` block from
  `jest.config.cjs`; consider coverage thresholds.
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
