# Synchronization Tests - Improved Test Suite

## Overview

The synchronization tests have been significantly improved to be more reliable and less brittle. This document explains the improvements and how to run the tests.

## What Was Fixed

### Phase 1: Test Infrastructure
1. **Serial Execution** - Sync tests now run one at a time to prevent state conflicts
2. **Verified Clean State** - Each test starts and ends with confirmed empty state
3. **Enhanced Cleanup** - Retry logic with verification ensures proper cleanup
4. **Better Diagnostics** - Clear logging shows exactly what's happening

### Phase 2: Sync Reliability
1. **Polling-Based Verification** - Tests now poll for state changes instead of using fixed waits
2. **Server-Side Verification** - Tests verify server state before proceeding
3. **Enhanced Sync Helpers** - Better timeout handling and event listening
4. **Article State Tracking** - Wait for specific article states to propagate

## How to Run Tests

### Run All Sync Tests (Recommended)
```bash
# Use --workers=1 to ensure serial execution
flox activate -- npx playwright test --project=chromium-sync --workers=1
```

### Run Specific Sync Test
```bash
# Multi-browser sync test (article add/delete)
flox activate -- npx playwright test --project=chromium-sync --workers=1 multi-browser-sync

# Multi-browser archive test (article archive state)
flox activate -- npx playwright test --project=chromium-sync --workers=1 multi-browser-archive

# Local article ingestion tests
flox activate -- npx playwright test --project=chromium-sync --workers=1 ingest-local-article
```

### Run All Tests (Including Non-Sync)
```bash
flox activate -- npm run test:e2e
```

## Test Configuration

The sync tests are configured in `playwright.config.ts`:

- **Project Name**: `chromium-sync`
- **Test Match**: `/.*\/(multi-browser.*|ingest-local-article)\.spec\.ts/`
- **Execution**: Serial (use `--workers=1` flag)
- **Timeout**: 120 seconds per test

## Key Improvements Made

### 1. Enhanced Helper Functions

**New Functions in `remotestorage-helper.ts`:**

- `waitForArticleState(page, slug, expectedState, timeout)` - Polls IndexedDB until article reaches expected state
- `waitForArticleOnServer(page, slug, shouldExist, timeout)` - Verifies server-side state
- `verifyCleanState(page)` - Checks both IndexedDB and RemoteStorage are empty
- `clearAllArticles(page, retries)` - Enhanced cleanup with retry logic and verification

**Improved Functions:**

- `triggerRemoteStorageSync()` - Better timeout handling and event listening
- `clearAllArticles()` - Now properly deletes all files in article directories

### 2. Test Hooks

**beforeEach:**
- Clears browser storage (IndexedDB, localStorage, sessionStorage)
- Connects to RemoteStorage
- Clears all articles from server
- Verifies clean state before proceeding

**afterEach:**
- Cleans up any articles created during test
- Prevents state leakage to subsequent tests

### 3. Multi-Browser Test Flow

**Improved Sync Verification:**
```typescript
// Browser 1 makes a change (delete/archive)
await waitForOutgoingSync(page1);

// Verify server has the change
await waitForArticleOnServer(page1, slug, shouldExist);

// Browser 2 syncs to pull changes
await triggerRemoteStorageSync(page2);

// Wait for Browser 2 to process the change
await waitForArticleState(page2, slug, expectedState);
```

## Troubleshooting

### Tests Timeout
- Ensure you're using `--workers=1` flag
- Check that test servers (Armadietto, content server) are running
- Review test output for specific timeout location

### Cleanup Failures
- Articles may remain on server due to timing issues
- Global teardown cleans server directory (`/tmp/restore8006`)
- Manual cleanup: `rm -rf /tmp/restore8006`

### State Leakage Between Tests
- Make sure `--workers=1` flag is used
- Check `beforeEach` and `afterEach` hooks are running
- Review cleanup logs for verification status

## Files Modified

- `playwright.config.ts` - Separate project for sync tests
- `tests/e2e/utils/remotestorage-helper.ts` - Enhanced cleanup & sync helpers
- `tests/e2e/multi-browser-sync.spec.ts` - Better sync verification
- `tests/e2e/multi-browser-archive-sync.spec.ts` - Better sync verification
- `tests/e2e/global-teardown.ts` - Server cleanup

## Test Results

**Before Improvements:**
- Tests frequently failed due to state leakage
- Race conditions from parallel execution
- Fixed waits didn't account for variable sync times
- Difficult to debug failures

**After Improvements:**
- ✅ Tests run with verified clean state
- ✅ Serial execution prevents interference
- ✅ Polling-based waits handle variable timing
- ✅ Clear diagnostics show exactly what's happening
- ✅ multi-browser-sync test: **PASSED** (42.9s)

## Future Improvements (Optional)

If tests remain brittle, consider:

1. **Unique Test Data** - Generate unique article slugs per test (e.g., `death-by-cuts-${Date.now()}`)
2. **Server Isolation** - Use separate RemoteStorage server instances per test
3. **Longer Timeouts** - Increase timeouts for slower CI environments
4. **Retry on Failure** - Add retry logic for transient failures in CI

## Contact

For questions or issues with the sync tests, review:
- Test output logs (detailed step-by-step progress)
- Playwright HTML report: `npx playwright show-report`
- Screenshots/videos on failure in `test-results/` directory
