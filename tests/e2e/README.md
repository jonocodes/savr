# End-to-End (E2E) Tests

This directory contains end-to-end tests for the Savr application using Playwright.

## What are E2E Tests?

End-to-end tests simulate real user interactions with your application by running tests in actual browsers. They test the complete user journey from start to finish, ensuring that all components work together correctly.

## Test Structure

- **`main-page.spec.ts`** - Tests for the main page functionality and UI elements
- **`add-article.spec.ts`** - Tests specifically for the add article functionality
- **`utils/test-helpers.ts`** - Common testing utilities and selectors

## Running the Tests

### Prerequisites

1. Install dependencies:

   ```bash
   npm install
   ```

2. Install Playwright browsers:
   ```bash
   npx playwright install
   ```

### Running Tests

1. **Run all e2e tests:**

   ```bash
   npm run test:e2e
   ```

2. **Run tests in a specific browser:**

   ```bash
   npx playwright test --project=chromium
   npx playwright test --project=firefox
   npx playwright test --project=webkit
   ```

3. **Run tests in headed mode (see the browser):**

   ```bash
   npx playwright test --headed
   ```

4. **Run tests in debug mode:**

   ```bash
   npx playwright test --debug
   ```

5. **Run a specific test file:**

   ```bash
   npx playwright test main-page.spec.ts
   ```

6. **Run tests with specific test name:**
   ```bash
   npx playwright test -g "should display the main page"
   ```

### Test Commands

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:report": "playwright show-report"
  }
}
```

## Test Configuration

The tests are configured in `playwright.config.ts` at the project root. Key settings:

- **Base URL**: `http://localhost:5173` (Vite dev server)
- **Web Server**: Automatically starts `npm run dev` before tests
- **Browsers**: Tests run in Chromium, Firefox, and WebKit
- **Screenshots**: Taken on test failure
- **Videos**: Recorded on test failure
- **Traces**: Collected on test retry

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from "@playwright/test";

test.describe("Feature Name", () => {
  test.beforeEach(async ({ page }) => {
    // Setup code that runs before each test
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should do something specific", async ({ page }) => {
    // Test implementation
    await expect(page.locator("h1")).toContainText("Expected Text");
  });
});
```

### Using Test Helpers

```typescript
import { TestHelpers, Selectors } from "./utils/test-helpers";

test("should add an article", async ({ page }) => {
  const helpers = new TestHelpers(page);

  // Use helper methods
  await helpers.clickAddArticleButton();
  await helpers.waitForDialog();

  // Use common selectors
  const urlInput = page.locator(Selectors.URL_INPUT);
  await urlInput.fill("https://example.com");
});
```

### Best Practices

1. **Use descriptive test names** that explain what the test verifies
2. **Wait for elements** to be visible before interacting with them
3. **Use data attributes** or semantic selectors when possible
4. **Test user workflows** rather than implementation details
5. **Keep tests independent** - each test should be able to run alone
6. **Use page objects** for complex page interactions

### Common Patterns

#### Waiting for Elements

```typescript
// Wait for element to be visible
await expect(page.locator(".my-element")).toBeVisible();

// Wait for element with timeout
await expect(page.locator(".my-element")).toBeVisible({ timeout: 10000 });

// Wait for element to disappear
await expect(page.locator(".my-element")).not.toBeVisible();
```

#### Filling Forms

```typescript
// Fill input field
await page.locator('input[name="url"]').fill("https://example.com");

// Select dropdown option
await page.locator('select[name="category"]').selectOption("technology");

// Check checkbox
await page.locator('input[type="checkbox"]').check();
```

#### Clicking Elements

```typescript
// Click button
await page.locator('button:has-text("Submit")').click();

// Click with coordinates
await page.locator(".my-element").click({ position: { x: 10, y: 10 } });

// Force click (when element is covered)
await page.locator(".my-element").click({ force: true });
```

## Debugging Tests

### Screenshots and Videos

Tests automatically capture:

- **Screenshots** on failure
- **Videos** on failure
- **Traces** on retry

### Debug Mode

Run tests in debug mode to step through them:

```bash
npx playwright test --debug
```

### UI Mode

Use Playwright's UI mode for interactive debugging:

```bash
npx playwright test --ui
```

### Console Logs

Add logging to your tests:

```typescript
test("should do something", async ({ page }) => {
  console.log("Starting test...");
  await page.goto("/");
  console.log("Page loaded");

  // Your test code here
});
```

## Continuous Integration

### GitHub Actions

Example workflow for running e2e tests:

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

### Environment Variables

Set environment variables for CI:

```bash
# Set CI environment
export CI=true

# Run tests
npm run test:e2e
```

## Troubleshooting

### Common Issues

1. **Tests fail on CI but pass locally**
   - Check for timing issues
   - Increase timeouts for slower environments
   - Use `--headed` mode locally to debug

2. **Element not found**
   - Verify the selector is correct
   - Check if the element is in a different frame/context
   - Ensure the element is visible and not covered

3. **Tests are flaky**
   - Add proper waits for elements
   - Use `waitForLoadState` for page loads
   - Avoid hard-coded delays

### Getting Help

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Testing Guide](https://playwright.dev/docs/intro)
- [Playwright API Reference](https://playwright.dev/docs/api/class-playwright)
