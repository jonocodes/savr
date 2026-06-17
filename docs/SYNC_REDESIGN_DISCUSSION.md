# Sync Redesign Discussion Notes

> **Status: historical session notes.** The work discussed here was completed
> (all items were marked done in commit `d74274a`). Kept for design rationale;
> not a source of truth for current behavior — see `SYNC_SCENARIOS.md` for
> that.

Conversation context: investigation into perceived sync problems in Savr — long syncs on every reload, articles flashing in and out of the list, a sync counter showing nonsense values (numerator exceeding denominator), and a loading bar that disappears before articles finish appearing. The user wanted a big-picture discussion about whether the sync logic should be rewritten, not an immediate fix.

This doc captures the full analysis, design discussion, instrumentation added, and open questions so the work can be picked up in a future session.

---

## 1. Symptoms observed by the user

From a screen recording the user shared (which I couldn't read directly, but they described):

1. **Funky counter** — sync progress shows `processed / total` like `7 / 5`, i.e. numerator exceeds denominator.
2. **Long sync on every reload** — ~30s of activity even on subsequent reloads where no data should have changed.
3. **Articles flashing** — on reload, the article list shows articles, then they disappear, then reappear, then disappear again.
4. **Loading bar disappears too early** — the sync spinner hides while articles are still being inserted into the list.
5. **Tests don't catch any of this** — the e2e suite is largely "Low CI Reliability" per CLAUDE.md.

The user's working hypothesis was that the JSON "database" / manifest was the problem. They asked: *should we just rely on IndexedDB and add indexes there?*

---

## 2. Architecture as it stands

Mapped via deep code exploration (see file:line citations below).

### Stack
- **RemoteStorage.js** for cross-device sync (user-owned storage; supports Dropbox / Google Drive / RS servers).
- **Dexie / IndexedDB** for local persistence. Single table `articles`, schema `slug, ingestDate, state` (`src/utils/db.ts:14`).
- **React + Vite + TanStack Router** for the UI.
- **dexie-react-hooks `useLiveQuery`** binds the article list to the DB.

### Remote layout
Each article is a directory in RemoteStorage:
```
/savr/saves/<slug>/
  article.json     ← metadata (the thing storage.ts processes)
  raw.html         ← article body (separate from metadata)
  resources/<hash>/...    ← images, etc.
```

**There is no central JSON manifest file.** The "listing" is fetched dynamically via `client.getListing("saves/")`. So the user's premise — that we're "managing our own JSON database and reading it all at once" — was a misconception. IndexedDB is already the local source of truth.

### Sync flow on page load
1. `src/main.tsx:17` → router loads, app mounts.
2. `src/components/RemoteStorageProvider.tsx:47` → async `init()`.
3. `src/utils/storage.ts:initRemote()` registers handlers for: `ready`, `connected`, `disconnected`, `error`, `network-online/offline`, `wire-busy`, `wire-done`, `sync-done`, `sync-req-done`, and `client.on("change")`.
4. On `connected`: checks `db.articles.count()`, branches to "initial" vs "incremental" sync (`storage.ts:386`).
5. On each `change` event for an `article.json` path: `processArticleFile` fetches and `db.articles.put`s (`storage.ts:670`).
6. On `sync-req-done` AND `sync-done`: a post-sweep runs (`processMissingArticles` + `processDeletedArticles`).
7. UI is rendered from `useLiveQuery` watching Dexie directly (`ArticleListScreen.tsx:310`).

---

## 3. Root cause of each symptom

### 3.1 Funky counter (numerator > denominator)
- `total` is set on the *first* `change` event by counting entries from `getListing("saves/")` (`storage.ts:677–706`).
- `processed` is `db.articles.count()` after each write (`storage.ts:737`).
- Two race conditions cause overshoot:
  - The listing can include directories that don't yet have a valid `article.json` (dangling), inflating the total — *or* missing entries that arrive later, deflating it.
  - The subsequent `processMissingArticles` post-sweep adds articles that weren't in the original listing count.
- The state machine uses two separate flags (`hasSetTotalArticles`, `hasFinalizedTotal`) which permit edge cases where neither is true.

### 3.2 Articles flashing
- The article list uses `useLiveQuery` (`ArticleListScreen.tsx:310`). Every `db.articles.put()` and `db.articles.delete()` triggers an immediate re-render.
- **Two separate post-sweeps run** — one for `sync-req-done` (`storage.ts:534`) and one for `sync-done` (`storage.ts:464`), gated by flags. Each calls `processDeletedArticles` *then* `processMissingArticles`.
- So an article can be: inserted by a `change` event → deleted by `processDeletedArticles` → re-inserted by `processMissingArticles` → potentially deleted again on the second handler run.
- Each contradictory write triggers a re-render.
- **Key insight (later in the discussion): flicker is not caused by frequent writes. It's caused by contradictory writes.** If every article were written exactly once per sync to its final state, live updates would be fine.

### 3.3 Loading bar disappears early
- `isSyncing` is flipped to `false` *inside* the `sync-req-done` handler (`storage.ts:557`), *before* the async `processMissingArticles` it just spawned has finished writing rows.
- The spinner hides while inserts are still landing.

### 3.4 Long sync on every reload
- Initial assumption (later revised): we re-fetch every article. **Wrong.**
  - `processArticleFile` (`storage.ts:166`) has no revision check, but it only runs in response to RS `change` events, which RS only fires when its cache sees a revision diff.
  - `processMissingArticles` (`storage.ts:228`) does check `db.articles.get(slug)` and skips articles already in Dexie.
- So we're **not** unconditionally re-fetching. But the events log shows **thousands of `change` events on every reload**, all with `hasNew: true, hasOld: false`, for `raw.html` and `resources/*` paths (see §6 for full quote of what the user saw).
- The app filters out non-`article.json` paths and ignores them — they don't touch Dexie. But RS is still firing them, which means RS's *in-memory* state at reload-start has no record of those files even if its on-disk cache does. Whether RS actually re-fetches them or just announces them from cache depends on `wire-busy` activity — that observation was still pending when the conversation ended.

### 3.5 Tests don't catch any of this
- `smoke.spec.ts` uses `waitUntil: "commit"` (initial HTML only). Doesn't run React.
- Most other suites are marked "Low CI Reliability" per CLAUDE.md and skipped/flaky.
- No test polls intermediate state during sync, asserts counter invariants, or watches for flicker.
- Headless browser hydration crashes are a known issue, documented in CLAUDE.md.

---

## 4. Design proposals discussed

### Option A — minimal surgery on existing sync
- Delete one of the two post-sweep handlers (`sync-done` *or* `sync-req-done`).
- Fetch the listing once per cycle; compute the diff against Dexie up-front.
- Compute `total` from the diff (`adds + updates`); counter stays monotonic.
- Only flip `isSyncing = false` after writes commit.

### Option B — reconciliation-driven rewrite (recommended)
- Replace the event-stream state machine with: *fetch listing → diff against local → apply diff in batches → done*.
- Treat RS `change` events purely as invalidation signals ("reconcile soon"), not as imperative "act now" triggers.
- The reconciler is a pure function: `(localState, remoteListing) => Op[]`. Trivially unit-testable.
- Apply ops live and progressively (preserves the user's preferred "articles popping in one by one" feel), but **idempotently and monotonically** — each article written once, to its final state.

### Option C — UI decoupling (safety net)
- Batch / debounce the `useLiveQuery` subscription so React renders aren't tied 1:1 to DB writes.
- Cheap; hides flicker even if root cause isn't fixed.

**Recommendation: B with C as backup.** Roughly 30% of current `storage.ts` survives.

### Things we'd keep in a from-scratch rewrite
- Local-first with IndexedDB / Dexie.
- RemoteStorage as the backend.
- UI subscribed to local DB via live queries.
- One `article.json` per article directory; no central manifest.

### Things we'd add
- Per-article remote revision stored on Dexie rows — *initially proposed, then walked back* (see §5).
- A sync queue with explicit op types — easier to reason about, pausable, observable.
- Possibly move the sync loop to a Web Worker (deferred; see drawbacks below).

---

## 5. Important corrections made during the discussion

### 5.1 ETag tracking — proposed then withdrawn
- Initially proposed storing a `lastSyncedRevision` field per article so we can skip re-fetching unchanged ones.
- The user correctly pushed back: doesn't RS already handle revision tracking?
- Yes — RS does track revisions and only fires `change` events when its cache sees a diff. So the gate is already there at the RS layer.
- The reason subsequent reloads *seemed* slow wasn't re-fetching; it was the in-memory `processedSet` resetting on each reload, plus the post-sweep walking the full listing and checking Dexie for each entry. That's an N×IndexedDB-read scan on every reload, even when nothing's missing.
- **Revised plan: trust RS's events as ground truth, delete the post-sweep, no ETag field needed.** Defense-in-depth via stored revisions is only useful if RS-cache and Dexie drift apart, which is rare enough to handle with a one-shot reconcile-on-startup rather than a per-row field.

### 5.2 Batching vs live updates
- I initially proposed batching all writes into a single transaction per cycle ("one re-render at the end").
- The user correctly pointed out: if a fresh sync takes 5 minutes, waiting until the end is jarring. They prefer the live "articles pop in" experience.
- Flicker isn't caused by *frequent* writes; it's caused by *contradictory* writes. So keep live per-article updates, but make each write the final state of that article for the cycle.

### 5.3 Web Workers
- Proposed: move sync into a Web Worker to remove main-thread contention.
- Drawbacks discussed:
  - **Potential blocker**: RemoteStorage.js was designed for window context. Uses fetch + IndexedDB (fine in workers), but if it touches `localStorage` or DOM anywhere, it won't run in a worker. Needs verification before committing.
  - Debugging: workable but mildly harder (separate context in devtools).
  - `postMessage` cost (mitigated since Dexie works in workers).
- **Recommendation: defer until after the reconciler refactor.** Premature otherwise.

---

## 6. Findings from autonomous Playwright observation (May 2026)

The decisive observation was made using `scripts/watch-sync.ts` (see §9), which reads `window.__savrDiag` from a live Dropbox-connected session at `http://localhost:3000`. Two full sync runs were captured and analysed.

### 6.1 Wire-busy: zero network activity on reload — CONFIRMED

**Both runs showed 0 `wire-busy` events.** RS fires no network requests for resource files (`raw.html`, images) on reload. The thousands of `change` events with `hasNew: true, hasOld: false` are purely in-memory cache announcements — RS rebuilding its session-start file index from its on-disk cache, not from the network.

**Conclusion:** the 30s reload burst is free from a network perspective. The slowness is entirely in our state machine doing N×IndexedDB reads via `processMissingArticles` on every connect.

This settles the branch in §10 step 4: proceed to **Option B (reconciler refactor)**.

### 6.2 Counter overshoot — reproduced

Run 2 showed **40 `progress` events where `processed > total`**, finishing at `processed: 118, total: 103`. Run 1 showed 0 overshoot. The race is non-deterministic — depends on when the listing snapshot is taken relative to how fast change events arrive. This confirms §3.1.

### 6.3 Post-sweep inconsistency

- Run 1: 109 `change` events → 121 `db-put`s (12 added by `processMissingArticles` post-sweep)
- Run 2: 124 `change` events → 124 `db-put`s (post-sweep added nothing)

The post-sweep is non-deterministic. Some reloads it contributes articles; others it finds nothing to add. This is consistent with the race condition in §3.1 — the listing and the change stream sometimes agree, sometimes don't.

### 6.4 Handler firing rate

`sync-req-done` fires ~2–7× per `change` event depending on the run (282–766 handler calls for ~110–124 changes). In both runs, `willProcess` was `false` for all but the first firing — the flag guards work, but the repeated no-op calls confirm RS fires `sync-req-done` for every internal sub-request, not once per sync cycle.

### 6.5 Sync duration

Run 2: **46 seconds** from first event to last `db-put`. This is consistent with user reports of ~30s syncs. The cost is the `processMissingArticles` post-sweep walking the full listing and hitting Dexie once per article.

### Summary table

| Metric | Run 1 | Run 2 |
|--------|-------|-------|
| `change` events | 109 | 124 |
| `db-put`s | 121 | 124 |
| Post-sweep additions | 12 | 0 |
| Counter overshoot events | 0 | 40 |
| `wire-busy` events | 0 | 0 |
| `handler` firings | 766 | 282 |
| First event → last db-put | — | 46s |

---

## 7. Instrumentation added

To support the diagnosis, the following changes were made (and committed in working state):

### `src/utils/storage.ts`
- New diagnostic event channel: `subscribeDiagnostic(listener) => unsubscribe` and internal `emitDiagnostic(category, data)`.
- Emits on:
  - `db-put` — `{slug, source}` where source is `"change-event"` or `"missing-sweep"`.
  - `db-delete` — `{slug, source}` where source is `"change-event"` or `"deleted-sweep"`.
  - `change` — `{path, hasNew, hasOld}` whenever the app receives an `article.json` change.
  - `progress` — every `notifySyncProgress` call, with `{isSyncing, phase, processed, total}`.
  - `handler` — `{name, willProcess, ...}` when `sync-done` / `sync-req-done` handlers enter.
- `processArticleFile` now takes a `source` parameter so writes can be attributed to their trigger.
- `emitDiagnostic` also writes to `window.__savrDiag` (ring buffer, last 2000 events) so Playwright and browser devtools can read the stream without subscribing to the React component.

### `src/components/DiagnosticsScreen.tsx`
- Event log cap raised 50 → 1000.
- Timestamps now include milliseconds.
- New listener on `remoteStorageClient.on("change", ...)` — previously these weren't captured at all.
- New subscription to `subscribeDiagnostic` — app-side events merged into the same timeline as RS native events.

### What this enables
- A merged timeline showing: RS announced change → we fetched → we wrote slug X to DB → progress went 5/4 → handler entered twice.
- Filtering by `wire-busy` paths to answer the "is RS actually re-fetching" question.
- Detecting both-handlers-fire bug in real time.
- Detecting counter overshoot live (look for `progress` events where `processed > total`).

---

## 8. Testing strategy (proposed but not implemented)

Why current tests miss these bugs: decisions and side effects are tangled together in `storage.ts`. To test the decisions you have to run a real browser with a real RS backend.

### Proposed refactor for testability
```ts
reconcile(localState, remoteListing): Op[]      // pure
applyOps(ops, dexie, remoteStorage): void       // side-effectful
```

### Test layers
1. **Unit tests on `reconcile`.** Feed it states, assert ops. Trivial.
2. **Property-based tests** (fast-check). Generate random `(localState, remoteListing)` pairs. Verify invariants:
   - Applying ops twice = applying once (idempotent).
   - `reconcile(state-after-ops, listing) === []` (convergent).
   - No op both adds and deletes the same slug.
   - `processed ≤ total` at every step.
3. **Integration tests on the apply layer.** Real Dexie + fake RemoteStorage in node. Many-article and concurrent-trigger scenarios. No browser.
4. **Subscribe to progress events in tests** and assert invariants *across the whole sequence*: counter monotonic, list-size monotonic during sync, spinner only hides after last write. This is the test the user couldn't write today.
5. **A small set of real e2e tests** just for React → Dexie wire-up.

---

## 9. Autonomous Playwright watching

Claude can observe a live sync session by reading `window.__savrDiag` from a running browser, without the user pasting output. This is implemented in `scripts/watch-sync.ts`.

### Setup

The script requires the dev server to already be running at `http://localhost:3000` (not the test server at 3002). Start it with:

```fish
flox activate -- npm run dev
```

Then in a second terminal:

```fish
flox activate -- npx tsx scripts/watch-sync.ts
```

A headed Chromium window opens. On first run, complete the Dropbox OAuth (or other RS backend) in that window. Subsequent runs reuse the saved session from `~/.savr-watch-profile` — no re-login needed.

The script waits for sync activity to begin, then observes for 60 seconds (configurable), writing all events to `/tmp/savr-diag.jsonl` as newline-delimited JSON. Claude can read that file directly.

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `WATCH_URL` | `http://localhost:3000` | Target app URL |
| `WATCH_DURATION` | `60` | Seconds to observe after sync starts |
| `WATCH_FILTER` | _(all)_ | Comma-separated categories to print to terminal (e.g. `wire-busy,change`) |

### Output

At the end of the run the script prints:
- Event counts by category
- `wire-busy` breakdown: directory listings vs `article.json` vs resource/raw files
- Total elapsed time

All raw events are in `/tmp/savr-diag.jsonl` for post-hoc analysis.

### What can be observed autonomously
- Counter overshoot (`processed > total` in `progress` events).
- Dual handler firing (`sync-done` AND `sync-req-done` both processing).
- `wire-busy` path distribution — is RS re-downloading resources or just announcing cache?
- Time from first event to last `db-put` (sync duration).
- Post-sweep contribution (`db-put` count vs `change` count).

### Limitations
- Requires a real RS backend with real data — cannot use Armadietto test server for this (no actual sync load).
- The MCP Playwright tools (used by Claude directly in conversation) cannot open a browser on NixOS/flox due to the Nix store being read-only for browser profile dirs. The script workaround writes to `/tmp/savr-diag.jsonl` which Claude reads via the filesystem instead.

---

## 10. Reconciler rewrite — status (May 2026)

The state machine in `storage.ts` was rewritten using the reconciler approach (Option B). The pure diff logic lives in `src/utils/reconciler.ts` with 24 unit tests.

### What changed

- `processMissingArticles` and `processDeletedArticles` deleted (~115 lines gone).
- All state flags deleted: `hasProcessedAfterFirstCycle`, `hasProcessedAfterSyncDone`, `hasSetTotalArticles`, `hasFinalizedTotal`, `isInitialSync`, `isPreparingForSync`, `processedArticles` Set.
- `sync-done` and `sync-req-done` handlers are now diagnostic-only — no reconcile triggered.
- `runReconcile()` fetches listing, diffs against Dexie, applies ops with up to 10 parallel workers; progress counter is derived from `ops.length` upfront (guaranteed monotonic).
- When `ops.length === 0`, `runReconcile` emits idle immediately and returns — no spinner flash.
- Change handler applies its op immediately for responsiveness, then schedules a 5s safety-net reconcile.
- Change handler delete path uses `event.origin` to short-circuit: skips the `getFile` cache check for `origin: "local"` deletes (we called `client.remove()`, Dexie already updated); keeps the check for `origin: "remote"` / `"window"` to guard against storeFile-in-flight races.
- Reconcile triggered only on `connected` and via the change handler's 5s debounce.
- `changeEvents: { local: false }` on the `RemoteStorage` constructor: suppresses `fireInitial()` on `ready`, eliminating both the hundreds of no-op change events on reload and the listing-cache perturbation that caused spurious 1-op reconcile cycles.

### What improved (confirmed by observation)

- **Counter overshoot eliminated.** `ops.length` is computed before any writes; `processed` can never exceed `total`.
- **Handler firing rate collapsed.** 766 → 1 handler diagnostic per sync cycle.
- **Cache-rebuild skip.** Change events with `hasOld=false` for articles already in Dexie are skipped immediately without retrying — eliminates the 88 × 5 retry loops seen in the old code.
- **0 wire-busy confirmed again** across all runs.
- **Loop regression test added.** `tests/e2e/sync-no-loop.spec.ts` — seeds 5 articles, connects, waits for settle, asserts ≤3 reconcile cycles in 20s.

### Known issues found and fixed during rewrite

1. **Continuous reconcile loop (fixed).** Root cause: `runReconcile` calls `getListing()`, which triggers RS to fire `sync-done`. Our `sync-done` handler was scheduling another reconcile → `getListing()` → `sync-done` → loop at ~1.8 cycles/second. Confirmed by regression test (36 cycles in 20s). **Fix:** `sync-done` is now diagnostic-only. Change events + 5s safety-net cover real-time updates from other devices.

2. **`sync-req-done` over-triggering (fixed).** `sync-req-done` fires ~7× per article. Previously scheduled a reconcile on each firing. **Fix:** `sync-req-done` is now diagnostic-only.

3. **Single op failure aborting reconcile (fixed).** If `processArticleFile` threw for one slug, the error propagated out of the op loop leaving the article out of Dexie. Next reconcile found it missing → 1 op → fail → loop. **Fix:** each op is individually try/catched.

### Remaining known issues

_(none currently open — all known issues resolved)_

---

## 11. Next steps (suggested order)

1. ~~**Observe `wire-busy` distribution on reload.**~~ **DONE** — 0 wire-busy confirmed.
2. ~~**Expose diagnostics to `window.__savrDiag`**~~ **DONE** — `scripts/watch-sync.ts`.
3. ~~**Reconciler rewrite (Option B).**~~ **DONE** — `src/utils/reconciler.ts` + rewritten `initRemote`.
4. ~~**Write loop regression test.**~~ **DONE** — `tests/e2e/sync-no-loop.spec.ts`.
5. ~~**Investigate RS in-memory cache rebuild on every reload.**~~ **DONE — resolved.** See §12 open question 2 for full findings and fix applied.
6. ~~**Fix cold-cache initial sync performance.**~~ **DONE** — `runReconcile` now runs up to 10 ops concurrently; eliminates the N×IDB-read serialisation bottleneck.
7. ~~**Suppress no-op reconcile progress notifications.**~~ **DONE** — `runReconcile` emits idle and returns immediately when `ops.length === 0`; also fixed `changeEvents: { local: false }` which was the root cause of spurious 1-op cycles on reload.

---

## 12. Key code locations

| What | Where |
|------|-------|
| Pure reconciler (diff logic) | `src/utils/reconciler.ts` |
| Reconciler unit tests | `src/utils/reconciler.test.ts` |
| `initRemote` — connection setup + event handlers | `src/utils/storage.ts` (`initRemote`) |
| `runReconcile` — fetch listing, diff, apply ops | `src/utils/storage.ts` (inside `initRemote`) |
| `processArticleFile` — fetch + parse + Dexie put | `src/utils/storage.ts` |
| Diagnostic event channel | `src/utils/storage.ts` (`subscribeDiagnostic` / `emitDiagnostic` / `window.__savrDiag`) |
| Article list (live query) | `src/components/ArticleListScreen.tsx:310` |
| Diagnostics page | `src/components/DiagnosticsScreen.tsx` |
| Legacy sync helpers (old model, kept for reference) | `src/utils/syncLogic.ts` |
| Dexie schema | `src/utils/db.ts` |
| RemoteStorage provider | `src/components/RemoteStorageProvider.tsx` |
| Observation script | `scripts/watch-sync.ts` |
| Test infra | `tests/e2e/global-setup.ts`, `playwright.config.ts` |

---

## 12. Open questions

1. ~~Does RS re-download resource files on every reload?~~ **RESOLVED** — No. Zero `wire-busy` events confirmed.
2. ~~**Why does RS fire hundreds of `change` events with `hasOld:false` on every reload?**~~ **RESOLVED.**

   Root cause: `fireInitial()` — an intentional RS mechanism present since v0.10.0 (2014). On every `ready` event, RS does an IndexedDB cursor scan over every stored node and fires a `change` event for each one with `oldValue: undefined` (hence `hasOld:false`). This is RS's mechanism for notifying the app of its full local state on startup so the app can hydrate itself without knowing what's already cached. No network requests are made — pure local IndexedDB reads, which is why `wire-busy` is always 0.

   The `cache: false` constructor option is a global kill switch that removes the entire local storage module (no IndexedDB, no sync, no offline support) — far too heavy a trade-off.

   **Fix applied:** pass `changeEvents: { local: false, window: false, remote: true, conflict: true }` to the `RemoteStorage` constructor. This makes `fireInitial()` return immediately without emitting anything. Remote and conflict events are unaffected. Savr uses Dexie + `useLiveQuery` for hydration, not RS local events, so nothing is lost. (Note: the RS docs warn that you must specify all four keys explicitly — omitting any disables it.)

   Reference: [remotestoragejs source — cachinglayer.ts `fireInitial()`](https://github.com/remotestorage/remotestorage.js), issue [#1287](https://github.com/remotestorage/remotestorage.js/issues/1287).
3. Does RemoteStorage.js work in a Web Worker? (Deferred — lower priority now that the state machine is clean.)
4. Should resource files (`raw.html`, images) also be tracked in Dexie for offline rendering, or do we re-fetch them when an article is opened?
