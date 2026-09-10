# Claude Code Agent Guide

This document helps AI agents (like Claude Code) work with this codebase.

## Project Overview

Savr is a React/TypeScript web app for saving articles for later reading. It uses:
- Vite for development/build
- Playwright for e2e testing
- RemoteStorage for cloud sync
- IndexedDB (via Dexie) for local storage

## Running E2E Tests

### Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Run smoke tests (recommended for CI)
npx playwright test tests/e2e/smoke.spec.ts

# Run all tests
npx playwright test
```

### Test Infrastructure

The e2e tests use a global setup (`tests/e2e/global-setup.ts`) that starts:
1. **Vite dev server**
2. **Armadietto RemoteStorage server** for each test user
3. **Content server** (http-server) for test articles

**Ports are dynamic and per-worktree.** `scripts/run-e2e.js` derives a stable,
non-overlapping set of ports for the app, remote-storage, and content servers
from the worktree/checkout path (FNV-1a hash of the project root) and passes
them via `PLAYWRIGHT_WEB_SERVER_PORT`, `STORAGE_PORT`, and `CONTENT_SERVER_PORT`.
This lets several git worktrees run the e2e suite concurrently without
colliding or killing each other's servers.

- When launched through `npm run test:e2e` (i.e. `scripts/run-e2e.js`), the
  ports are picked per worktree automatically.
- When `npx playwright test` is run directly, the historical fixed ports are
  used as a fallback: app on 3002, storage on 8006, content on 8080.

`tests/e2e/utils/remotestorage-helper.ts` exposes `getAppOrigin()`,
`getWorkerStorageAddress()`, and `getContentServerUrl()` so specs read the
actual ports from the environment instead of hardcoding them.

### Testing with git worktrees

- Run tests via `npm run test:e2e` (or the docker variant) from **each**
  worktree; the runner picks an isolated port set automatically.
- Don't run `npx playwright test` directly in two worktrees at once — without
  `scripts/run-e2e.js` they fall back to the shared fixed ports and collide.
- Each worktree needs its own dependency install (`npm install`).

### Testing with flox

The `savr` flox environment is a FloxHub-managed remote environment
(`jonocodes/savr`). Because `.flox` is keyed to a directory, git worktrees
(copied into new directories) don't inherit the environment automatically.
Two options to share one environment across worktrees:

1. **Activate the managed env remotely** (recommended, fully shared):
   in each worktree's `.envrc`:
   ```bash
   flox activate -r jonocodes/savr
   ```
   Env changes (`flox edit`) propagate to every worktree.
2. **Point direnv at the primary worktree's env**: `flox activate -d <primary-path>`

### Known Issues

#### Browser Crashes in Headless Environments

The React app may crash headless browsers when IndexedDB/RemoteStorage initialization runs. This manifests as:
- `Target crashed` errors
- Empty page title (receiving `""` instead of `"Savr..."`)
- `page.evaluate()` timeouts

**Workaround**: The smoke tests use `waitUntil: "commit"` instead of `waitUntil: "domcontentloaded"` to verify the initial HTML response without waiting for React hydration.

#### Port Conflicts

If tests fail with `EADDRINUSE` errors, clean up stale processes. Check which
ports the run used from the `scripts/run-e2e.js` output line
`Ports (app/storage/content): …`, then:

```bash
# Kill processes on the relevant ports
lsof -i :9080 -i :7606 -i :3002 | grep -v "^COMMAND" | awk '{print $2}' | sort -u | xargs -r kill -9

# Clean up temp files (storage path is keyed off the storage port)
rm -rf /tmp/restore*
rm -f tests/e2e/.test-env.json
```

(`restore*` covers both the fixed fallback `restore8006` and any per-worktree
`restore<storage-port>` directories.)

### Test Categories

| Test File | Description | Notes |
|-----------|-------------|-------|
| `smoke.spec.ts` | Basic page load verification (static HTML shell only) | Most CI-reliable; does not verify React boots |
| `main-page.spec.ts` | Main page UI tests | Requires React hydration |
| `add-article-dialog.spec.ts` | Add-article dialog interactions | Requires React hydration |
| `ingest-local-article.spec.ts` | Article ingestion via UI, incl. PDF/markdown/image from `test_data/input/` | Serial |
| `article-server-persistence.spec.ts` | Persist to RemoteStorage server and restore after local wipe | Serial |
| `edit-article-info.spec.ts` | Edit-article drawer: metadata fields, persistence | Serial |
| `bookmarklet-sync.spec.ts` | Bookmarklet `?bookmarklet=` ingestion flow via postMessage | Serial |
| `multi-browser-sync.spec.ts` | Add/delete propagation across two browser contexts (manual sync trigger) | Active |
| `multi-browser-archive-sync.spec.ts` | Deletion, metadata-edit, and archive-state sync across contexts | Active |
| `natural-sync.spec.ts` | Background-interval sync with no manual trigger | Active |
| `incremental-sync.spec.ts` | Local articles preserved across reload | Serial |
| `sync-no-loop.spec.ts` | Regression: reconcile must not re-fire after sync settles | Contains intentional 20s wait |
| `sync-clears-local-on-connect.spec.ts` | Clear-local-on-connect semantics | Skipped (behavior not implemented) |
| `bulk-delete.spec.ts` | Delete All wipes Dexie and RemoteStorage cache | Active |
| `widget-visibility.spec.ts` | RemoteStorage widget shown/hidden per page and sync setting | Active |
| `text-to-speech.spec.ts` | TTS toolbar, drawer controls, speed/voice | Voice availability depends on headless env |

### Playwright Configuration

Key settings in `playwright.config.ts`:
- Headless browser args for stability: `--disable-gpu`, `--disable-dev-shm-usage`, `--no-sandbox`
- `VITE_CORS_PROXY` set to empty string for direct localhost fetches
- Global setup/teardown manages test servers

## Common Development Tasks

### Fix Linting Issues

```bash
npm run lint
npm run lint:fix  # Auto-fix where possible
```

### Build for Production

```bash
npm run build
```

### Run Dev Server

```bash
npm run dev
```

## Code Structure

- `src/` - React application source
  - `components/` - React components
  - `utils/` - Utility functions (storage, db, etc.)
  - `config/` - Environment configuration
- `tests/e2e/` - Playwright e2e tests
  - `utils/` - Test helper functions
  - `global-setup.ts` - Test server setup
  - `global-teardown.ts` - Test server cleanup
- `lib/` - Shared library code
- `test-server/` - Armadietto server for testing

## Debugging Tips

1. **Check browser console output**: Add `page.on('console', msg => console.log('[BROWSER]', msg.text()))` to tests
2. **Capture page content**: Use `await page.content()` to see what HTML was actually loaded
3. **Use trace mode**: Run with `--trace on` for detailed debugging info
4. **Check test environment**: Ensure `.test-env.json` was created by global-setup
