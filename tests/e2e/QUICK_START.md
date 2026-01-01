# Quick Start - Running Sync Tests

## TL;DR

```bash
# Run only sync tests (RECOMMENDED)
flox activate -- npx playwright test --project=chromium-sync

# Run all tests (sync tests may fail due to interference from parallel tests)
flox activate -- npx playwright test
```

## Common Commands

```bash
# Run all tests
flox activate -- npx playwright test

# Run only sync tests
flox activate -- npx playwright test --project=chromium-sync

# Run just multi-browser tests
flox activate -- npx playwright test multi-browser

# Run specific test file
flox activate -- npx playwright test multi-browser-sync

# Show last test report
npx playwright show-report
```

## Important Notes

1. **Sync tests automatically run serially** - The playwright config ensures sync tests never run in parallel
2. Tests automatically clean up before and after running
3. Each sync test takes ~40-60 seconds due to article ingestion
4. Check `SYNC_TESTS_README.md` for detailed documentation

## What Changed

- ✅ Tests now have verified clean state
- ✅ Better sync reliability with polling
- ✅ Server-side verification before assertions
- ✅ Clear diagnostics and logging

## If Tests Fail

1. Review test output for specific timeout
2. Check `npx playwright show-report` for screenshots
3. Manually clean server: `rm -rf /tmp/restore8006`
4. Verify test servers are running (Armadietto on :8006, content server on :8080)
