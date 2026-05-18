# RemoteStorage.js sync behavior — observed semantics

Notes on how `remotestorage.js` actually behaves, gathered while
debugging sync races in `src/utils/storage.ts`. The library's docs
cover the API surface but leave several timing and edge-case behaviors
implicit; this doc captures what we verified against an Armadietto
server in e2e tests, so the next person poking at sync code doesn't
have to re-derive it.

Scope: RS 1.x with caching enabled (`remoteStorage.caching.enable("/savr/")`).

## Mental model

RS sits between three layers:

1. **Server** — the remote storage account (Armadietto, 5apps, etc).
2. **RS local cache** — RS's own IndexedDB store, keyed by path. Holds
   file bodies, revisions, and dirty/deleted markers per node. Also
   holds cached directory listings.
3. **App** — receives change events, calls `storeFile`/`remove`/
   `getFile`/`getListing` against the scope client.

A sync cycle reconciles (2) with (1), pushing dirty writes up and
pulling remote changes down. Change events fire on transitions in (2),
so they fire both for local writes ("origin: local") and for remote
changes pulled in during sync ("origin: remote").

## API behavior

### `client.getFile(path, maxAge?)`

The `maxAge` parameter is more load-bearing than the docs imply.

- `maxAge: false` — **read from local cache only.** No network. If the
  file is in cache (including a dirty/just-written entry from
  `storeFile`), returns `{data, contentType, revision}`. If not in
  cache, returns an empty-ish object (no `data` field).
- `maxAge: undefined` (default) — **falls through to the server** if
  the cached entry is missing or stale. We saw this hit the network
  even when the file was just `storeFile`'d locally, producing a
  GET 404 against the server because the upload hadn't landed yet.
- `maxAge: <ms>` — return cached entry only if fresh enough.

Concrete consequence: if you use `getFile()` (no maxAge) as a "is this
file present?" check during the window between `storeFile` and the
subsequent upload completing, you'll get a 404 from the server even
though the data is locally cached and queued for upload. **Pass
`maxAge: false` whenever you only care about local truth.**

### `client.storeFile(mimeType, path, body)`

- Writes synchronously to the local cache and marks the node dirty.
- Fires a local-origin change event for the path immediately (before
  the upload).
- The actual HTTP PUT happens during the next sync cycle. With our
  config that's typically very soon — we saw uploads start firing
  through Armadietto while `ingestHtml` was still running its later
  steps.
- Returns a promise that resolves after the local write, not after the
  remote PUT. Don't treat its resolution as "the server has it now."

### `client.remove(path)`

- Marks the cached node as deleted, fires a local-origin change event
  with `newValue: undefined`, and queues a DELETE for the next sync.
- After `remove`, `getFile(path, false)` returns nothing — the cache
  is updated synchronously even though the server delete is async.

### `client.getListing(prefix, maxAge?)`

- Returns a `Record<string, true>` where keys ending in `/` are
  subdirectories and others are files.
- Same `maxAge` semantics as `getFile`. With default `maxAge`, RS will
  hit the server if it thinks the listing is stale.
- **The cached listing is not always synchronized with `storeFile`
  writes.** We saw `getListing` come back empty (or missing a recently
  storeFile'd slug) during the window where the local cache held the
  data but the listing tree had not been refreshed yet. This made
  reconcile compute spurious delete ops: "I have it locally, the
  listing doesn't include it, must be a deletion from another device."

### Calling `getListing` from inside a `sync-done` handler

`getListing` (under default `maxAge`) can trigger another sync cycle,
which fires another `sync-done`. If your handler unconditionally calls
`getListing`, you get a feedback loop. We hit this — confirmed by
[sync-no-loop.spec.ts](../tests/e2e/sync-no-loop.spec.ts) — at roughly
1.8 cycles/second. Fixes:

- Gate the call so it runs once per connection, not once per
  `sync-done`.
- Or, pass `maxAge: false` so the listing is served from cache and no
  sync is triggered.

## Change events

`client.on("change", evt => ...)` is the primary integration point.
Important fields:

- `evt.path` / `evt.relativePath` — absolute vs scope-relative.
- `evt.oldValue`, `evt.newValue` — file bodies, or `undefined`.
- `evt.origin` — one of `local`, `remote`, `window`, `conflict`. We
  haven't relied on this much, but it's the principled way to
  distinguish "I just wrote this" from "another device wrote this."

### `newValue` is not always the file body

The classic case is "remote delete" → `newValue: undefined`. But
`newValue` can also be:

- `null` — RS knows something changed but hasn't materialized the
  body. We saw this fire during certain sync flows. Code that calls
  `JSON.parse(rawData)` or treats `!== undefined` as "data present"
  will trip on `null`.
- The actual body — for normal `storeFile`/sync-down events.

In our change handler we treat both `undefined` and `null` as "fetch
the file yourself," falling back to `processArticleFile` which does
its own `getFile` (with retries).

### Determining op type from `newValue`

We use `event.newValue !== undefined` as the signal:

- `!== undefined` → treat as fetch (add/update).
- `=== undefined` → treat as delete.

`null` falls under "fetch" by this rule, which is what we want — we'll
re-fetch the body. A `null` newValue should never indicate a delete.

### Change-event timing relative to local cache commit

We initially read fresh data via `client.getFile()` inside the change
handler. That returned **stale** data in some cases (e.g. archive
state for a re-synced article still showed the previous value).
Cause: the change event fires before the local cache commit fully
settles. Workaround: use `event.newValue` directly when available;
fall back to `getFile` only when `newValue` is empty.

### Spurious delete events during sync

In the bookmarklet flow we observed cases where a change event with
`newValue: undefined` fired for a file that had been `storeFile`'d
locally but not yet PUT to the server. RS may have been reconciling
its own state mid-sync. If your change handler unconditionally
deletes from local DB on every undefined-newValue event, you'll lose
data that's about to be uploaded.

Mitigation: before acting on a delete event, check
`getFile(path, maxAge: false)`. If the local cache still has the
body, the file is dirty/in-flight and should not be deleted locally.

## Sync lifecycle events

Observed firing order during a sync cycle:

```
connected        // once, on initial connect
wire-busy        // each HTTP request starts
wire-done        // each HTTP request finishes
sync-req-done    // each subtree sync finishes — fires ~7x per article
sync-done        // entire sync cycle finishes
```

- `wire-busy`/`wire-done` are noisy and per-request. Useful as
  liveness indicators, not as boundaries.
- `sync-req-done` fires many times per logical "sync." Don't treat it
  as a sync boundary. (We learned this the hard way — scheduling work
  here meant doing it ~7x per article.)
- `sync-done` is the right boundary for "this sync cycle is over."
- `connected` fires once when RS attaches. It's NOT a guarantee that
  the local cache has been refreshed from the server; that happens
  during the first sync cycle after `connected`.

`network-online` / `network-offline` exist; we re-trigger reconcile on
the first online-after-sync transition.

### "When is RS ready?"

There isn't a single ready event that means "cache matches server."
`connected` means the auth handshake completed. The first `sync-done`
after `connected` means the first sync cycle finished — which is the
earliest moment `getListing` (against cache) reliably reflects the
server.

This matters for any code that wants to compare local state against
remote state on startup. If you run a reconcile-style diff at
`connected` time, the listing is empty and you'll wrongly conclude
"the server has nothing." We defer the initial reconcile to the
first `sync-done` for this reason.

## Race conditions we hit

### 1. Reconcile runs while a local write is in flight

Timeline:

1. App calls `storeFile("article.json", data)` (local cache updated,
   queued for upload).
2. App also writes the article into Dexie directly.
3. Something triggers `runReconcile` before the upload PUT lands.
4. `reconcile` sees: local Dexie has the slug, server listing doesn't.
5. `reconcile` computes a delete op for that slug.
6. `applyOp(delete)` proceeds and removes the article from Dexie.

The article reappears later when the upload completes and the
listing refreshes — but only if some downstream signal triggers
another reconcile or fetch. In our case, the delete was sticky.

Fix: in the delete branch of `applyOp` (and the change handler), guard
with `client.getFile(path, false)`. If the file is in the local cache
(dirty/just-written), skip the delete. The article will eventually
upload and the next reconcile will see it on both sides.

### 2. `getListing` returning empty during active upload

Variant of (1). Even after one of the article's files has PUT'd
successfully to the server, the cached listing may still be stale —
either because RS hasn't refreshed it, or because the listing was
captured before the PUT. So `parseListing(listing)` returns `[]` and
reconcile thinks the slug doesn't exist remotely.

We don't have a tidy fix for this at the RS layer. Our mitigation is
(1): the local-cache guard in `applyOp` keeps us from deleting locally
during the window where the listing is wrong.

### 3. `sync-done` → `getListing` → `sync-done` loop

`getListing` with default `maxAge` triggers a sync. The handler that
ran reconcile on every `sync-done` ended up looping at ~1.8 Hz. Two
fixes:

- Run reconcile once per connection (gated by a flag), not once per
  `sync-done`. Then rely on change events + a debounced safety-net
  reconcile for ongoing changes.
- And/or use `maxAge: false` on the listing call so it doesn't
  trigger sync at all.

We do both: `hasTriggeredInitialReconcile` gates the initial run; the
change handler schedules a debounced reconcile on real change events.

### 4. waitForFunction race when reading data post-poll

Not strictly RS, but RS made it visible. Pattern:

```ts
await page.waitForFunction(() => !!(await db.articles.get(slug)));
const article = await page.evaluate(() => db.articles.get(slug)); // ← undefined
```

`waitForFunction` returns when the predicate is true on some poll. By
the time the next `page.evaluate` runs, the article can already have
been deleted (e.g. by the race in (1)). Polling-then-reading is two
separate observations of the DB.

Fix: combine wait + read in a single `page.evaluate` that polls
internally and returns the article. One observation, no gap.

## Implications baked into `storage.ts`

- Initial reconcile is deferred to the first `sync-done` after
  `connected`, not on `connected` itself.
- Subsequent `sync-done`/`sync-req-done` events are diagnostic-only.
  Real-time updates ride change events; a 5s-debounced reconcile
  acts as a safety net.
- Change-handler "fetch" path prefers `event.newValue` over
  `client.getFile()` to avoid pre-commit staleness.
- Change-handler and reconcile "delete" paths both guard with
  `client.getFile(path, false)` to avoid deleting locally during the
  window between `storeFile` and the remote PUT.
- `runReconcile` early-returns when `remoteStorage.remote.connected`
  is false, so we don't reconcile against a stale/empty listing
  during reconnect.

## Things we're not 100% sure about

- The exact triggers for spurious `newValue: undefined` events during
  sync. We have a workaround that's worked across our tests, but we
  haven't traced it to a specific RS code path.
- Whether `caching.enable("/savr/")` (FLUSH strategy by default) ever
  evicts dirty entries before they upload. We haven't seen it, but
  haven't stressed long sessions either.
- Cross-tab `window`-origin events — we don't use multiple tabs to
  the same scope, so we haven't characterized them.

## Useful debugging hooks

In our app, with `VITE_DEBUG=true`:

- `window.savrDb` — the Dexie instance.
- `window.remoteStorage`, `window.remoteStorageClient` — the RS
  instance and the `/savr/` scope client.
- `window.__savrDiag` — ring buffer of internal diagnostic events
  emitted from `storage.ts` (change, db-put, db-delete, progress,
  handler). Useful from Playwright via `page.evaluate(() =>
  window.__savrDiag.slice(-50))`.

Armadietto logs every HTTP request, so tailing the test server output
during an e2e run gives you the actual PUT/GET sequence the RS client
issued. That's how we caught the reconcile-during-upload race —
we saw `GET /article.json 404` interleaved between `PUT raw.html`
and `PUT article.json`.
