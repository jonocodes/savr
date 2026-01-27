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
1. **Vite dev server** on port 3002
2. **Armadietto RemoteStorage server** on port 8006
3. **Content server** (http-server) on port 8080 for test articles

### Known Issues

#### Browser Crashes in Headless Environments

The React app may crash headless browsers when IndexedDB/RemoteStorage initialization runs. This manifests as:
- `Target crashed` errors
- Empty page title (receiving `""` instead of `"Savr..."`)
- `page.evaluate()` timeouts

**Workaround**: The smoke tests use `waitUntil: "commit"` instead of `waitUntil: "domcontentloaded"` to verify the initial HTML response without waiting for React hydration.

#### Port Conflicts

If tests fail with `EADDRINUSE` errors, clean up stale processes:

```bash
# Kill processes on test ports
lsof -i :8080 -i :8006 -i :3002 | grep -v "^COMMAND" | awk '{print $2}' | sort -u | xargs -r kill -9

# Clean up temp files
rm -rf /tmp/restore8006
rm -f tests/e2e/.test-env.json
```

### Test Categories

| Test File | Description | CI Reliability |
|-----------|-------------|----------------|
| `smoke.spec.ts` | Basic page load verification | High |
| `main-page.spec.ts` | Main page UI tests | Low (requires React hydration) |
| `add-article-dialog.spec.ts` | Dialog interaction tests | Low (requires React hydration) |
| `ingest-local-article.spec.ts` | Article ingestion flow | Low (requires React hydration) |
| `widget-visibility.spec.ts` | RemoteStorage widget tests | Low (requires React hydration) |
| `multi-browser-sync.spec.ts` | Multi-browser sync tests | Skipped |

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
