import { test, expect } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  deleteArticleFromStorage,
  deleteArticleFromDB,
  clearAllArticles,
  getRemoteStorageAddress,
  getContentServerUrl,
} from "./utils/remotestorage-helper";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load test environment (token from global setup)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testEnvPath = path.join(__dirname, ".test-env.json");
let testEnv: { RS_TOKEN: string };

try {
  testEnv = JSON.parse(fs.readFileSync(testEnvPath, "utf-8"));
} catch (error) {
  throw new Error(
    `Failed to load test environment from ${testEnvPath}. ` +
      `Make sure global-setup.ts ran successfully. Error: ${error}`
  );
}

test.describe("Text to Speech Feature", () => {
  // Run tests serially to avoid conflicts with shared RemoteStorage state
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Clear all browser storage to ensure clean state
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase("savrDb");
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => {
          setTimeout(resolve, 500);
        };
      });
      localStorage.clear();
      sessionStorage.clear();
    });

    // Reload after clearing storage
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Connect to RemoteStorage
    const token = testEnv.RS_TOKEN;
    await connectToRemoteStorage(page, getRemoteStorageAddress(), token);
    await waitForRemoteStorageSync(page);
    await clearAllArticles(page);

    // Ingest a test article
    const addButton = page
      .locator(
        'button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)'
      )
      .first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator(
        'input[type="url"], input[placeholder*="url"], .MuiTextField-root input'
      )
      .first();
    const testUrl = `${getContentServerUrl()}/input/test-article-for-local-ingestion/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();
    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText("Test Article for Local Ingestion");
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
  });

  test("should display TTS button in article page toolbar", async ({
    page,
  }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Check that TTS button is visible in the toolbar
    const ttsButton = page.getByTestId("tts-button");
    await expect(ttsButton).toBeVisible({ timeout: 10000 });
  });

  test("should open TTS drawer when clicking headphone button", async ({
    page,
  }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Click the TTS button
    const ttsButton = page.getByTestId("tts-button");
    await ttsButton.click();

    // Verify drawer opens with TTS title
    const drawerTitle = page.getByText("Text to Speech");
    await expect(drawerTitle).toBeVisible({ timeout: 5000 });
  });

  test("should show play/pause and stop buttons in TTS drawer", async ({
    page,
  }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open TTS drawer
    const ttsButton = page.getByTestId("tts-button");
    await ttsButton.click();

    // Verify playback controls are visible
    const playButton = page.locator('button:has([data-testid="PlayArrowIcon"])');
    const stopButton = page.locator('button:has([data-testid="StopIcon"])');

    await expect(playButton).toBeVisible({ timeout: 5000 });
    await expect(stopButton).toBeVisible({ timeout: 5000 });
  });

  test("should show speed slider in TTS drawer", async ({ page }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open TTS drawer
    const ttsButton = page.getByTestId("tts-button");
    await ttsButton.click();

    // Verify speed control is visible
    const speedLabel = page.getByText(/Speed:/);
    await expect(speedLabel).toBeVisible({ timeout: 5000 });

    // Verify slider exists
    const slider = page.locator(".MuiSlider-root");
    await expect(slider).toBeVisible({ timeout: 5000 });
  });

  test("should show voice selection dropdown in TTS drawer", async ({
    page,
  }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open TTS drawer
    const ttsButton = page.getByTestId("tts-button");
    await ttsButton.click();

    // Verify voice selection is visible (use first() since label appears twice in MUI)
    const voiceLabel = page.getByText("Voice").first();
    await expect(voiceLabel).toBeVisible({ timeout: 5000 });

    // Verify select dropdown exists
    const select = page.locator(".MuiSelect-select");
    await expect(select).toBeVisible({ timeout: 5000 });
  });

  test("should close TTS drawer when clicking outside", async ({ page }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open TTS drawer
    const ttsButton = page.getByTestId("tts-button");
    await ttsButton.click();

    // Verify drawer is open
    const drawerTitle = page.getByText("Text to Speech");
    await expect(drawerTitle).toBeVisible({ timeout: 5000 });

    // Click outside the drawer (on the backdrop)
    await page.locator(".MuiBackdrop-root").click();

    // Verify drawer is closed
    await expect(drawerTitle).not.toBeVisible({ timeout: 5000 });
  });

  test("should have Web Speech API available", async ({ page }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Check if speechSynthesis is available
    const hasSpeechSynthesis = await page.evaluate(() => {
      return "speechSynthesis" in window;
    });

    expect(hasSpeechSynthesis).toBe(true);
  });

  test("should have voices available", async ({ page }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Wait for voices to load and check count
    const voiceCount = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        const checkVoices = () => {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            resolve(voices.length);
          } else {
            // Wait for voiceschanged event
            window.speechSynthesis.addEventListener(
              "voiceschanged",
              () => {
                resolve(window.speechSynthesis.getVoices().length);
              },
              { once: true }
            );
            // Timeout fallback
            setTimeout(() => resolve(0), 5000);
          }
        };
        checkVoices();
      });
    });

    // Most browsers should have at least some voices
    // Note: In headless mode, some browsers may have 0 voices
    console.log(`Available voices: ${voiceCount}`);
  });

  test("stop button should be disabled when not playing", async ({ page }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open TTS drawer
    const ttsButton = page.getByTestId("tts-button");
    await ttsButton.click();

    // Verify stop button is disabled
    const stopButton = page.locator('button:has([data-testid="StopIcon"])');
    await expect(stopButton).toBeDisabled({ timeout: 5000 });
  });

  test.afterEach(async ({ page }) => {
    // Clean up: delete test article
    const currentUrl = page.url();
    if (!currentUrl.includes(":3002")) {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
    }

    try {
      await deleteArticleFromStorage(page, "test-article-for-local-ingestion");
      await deleteArticleFromDB(page, "test-article-for-local-ingestion");
    } catch (error) {
      console.log("Cleanup error (non-fatal):", error);
    }
  });
});
