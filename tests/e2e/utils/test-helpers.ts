import { Page, Locator, expect } from "@playwright/test";

/**
 * Helper class for common testing operations
 */
export class TestHelpers {
  constructor(private page: Page) {}

  /**
   * Wait for the page to be fully loaded and stable
   */
  async waitForPageReady() {
    await this.page.waitForLoadState("networkidle");
    await this.page.waitForLoadState("domcontentloaded");
  }

  /**
   * Find and click the add article button (FAB)
   */
  async clickAddArticleButton() {
    const addFab = this.page
      .locator('.MuiFab-root, button[aria-label*="add"], button:has(.MuiSvgIcon-root)')
      .first();
    await expect(addFab).toBeVisible();
    await addFab.click();
    return addFab;
  }

  /**
   * Wait for and verify a dialog is visible
   */
  async waitForDialog() {
    const dialog = this.page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });
    return dialog.first();
  }

  /**
   * Find a button by text content
   */
  findButtonByText(text: string): Locator {
    return this.page.locator(`button:has-text("${text}")`);
  }

  /**
   * Find an input field by placeholder or name
   */
  findInputByPlaceholder(placeholder: string): Locator {
    return this.page.locator(`input[placeholder*="${placeholder}"], input[name*="${placeholder}"]`);
  }

  /**
   * Check if an element exists and is visible
   */
  async isElementVisible(selector: string): Promise<boolean> {
    const element = this.page.locator(selector);
    return (await element.count()) > 0 && (await element.first().isVisible());
  }

  /**
   * Wait for an element to appear and be visible
   */
  async waitForElement(selector: string, timeout = 5000): Promise<Locator> {
    const element = this.page.locator(selector);
    await expect(element.first()).toBeVisible({ timeout });
    return element.first();
  }

  /**
   * Take a screenshot for debugging
   */
  async takeScreenshot(name: string) {
    await this.page.screenshot({ path: `test-results/${name}.png` });
  }

  /**
   * Fill a form field and verify the value
   */
  async fillAndVerify(selector: string, value: string) {
    const field = this.page.locator(selector);
    await field.fill(value);
    await expect(field).toHaveValue(value);
  }

  /**
   * Click an element and wait for a specific result
   */
  async clickAndWaitFor(selector: string, waitForSelector: string, timeout = 5000) {
    await this.page.locator(selector).click();
    await this.waitForElement(waitForSelector, timeout);
  }
}

/**
 * Common selectors used across tests
 */
export const Selectors = {
  // Main page elements
  ADD_BUTTON: '.MuiFab-root, button[aria-label*="add"]',
  ARTICLE_LIST: '.MuiList-root, [role="list"]',
  ARTICLE_ITEM: '.MuiListItem-root, [role="listitem"]',

  // Dialog elements
  DIALOG: '.MuiDialog-root, [role="dialog"]',
  DIALOG_TITLE: '.MuiDialogTitle-root, [role="dialog"] h2, [role="dialog"] h3',
  DIALOG_CONTENT: '.MuiDialogContent-root, [role="dialog"] .MuiBox-root',

  // Form elements
  URL_INPUT: 'input[type="url"], input[placeholder*="url"], input[name*="url"]',
  SUBMIT_BUTTON: 'button[type="submit"], button:has-text("Add"), button:has-text("Save")',
  CANCEL_BUTTON: 'button:has-text("Cancel"), button:has-text("Close")',

  // Navigation elements
  NAVIGATION: 'nav, [role="navigation"], .MuiAppBar-root',
  HEADER: "header, .MuiAppBar-root",

  // Menu elements
  MENU: '.MuiMenu-root, [role="menu"]',
  MENU_ITEM: '.MuiMenuItem-root, [role="menuitem"]',

  // Common UI elements
  LOADING_SPINNER: '.MuiCircularProgress-root, .MuiSkeleton-root, [aria-busy="true"]',
  ERROR_MESSAGE: '.MuiAlert-root, .MuiFormHelperText-root, [role="alert"]',
  SUCCESS_MESSAGE: '.MuiAlert-root, .MuiSnackbar-root, [role="status"]',
};

/**
 * Common test data
 */
export const TestData = {
  VALID_URLS: [
    "https://example.com/article",
    "https://www.google.com",
    "https://github.com/username/repo",
    "http://localhost:3000/test",
  ],
  INVALID_URLS: [
    "not-a-url",
    "ftp://invalid-protocol.com",
    'javascript:alert("xss")',
    'data:text/html,<script>alert("xss")</script>',
  ],
  SAMPLE_ARTICLES: [
    "https://www.apalrd.net/posts/2023/network_ipv6/",
    "https://getpocket.com/explore/item/is-matter-conscious",
    "https://medium.com/androiddevelopers/jetnews-for-every-screen-4d8e7927752",
  ],
};
