import { test, expect, Page } from "@playwright/test";
import { getContentServerUrl } from "./utils/remotestorage-helper";

const REPORT_REPO = "jonocodes/savr-failure-reports";

test.describe("Failure report dialog", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  function reportDialog(page: Page) {
    return page.locator('[role="dialog"]').filter({ hasText: "Report this failed article?" });
  }

  async function submitFailingUrl(page: Page) {
    const addButton = page
      .locator(
        'button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)'
      )
      .first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const addDialog = page.locator(".MuiDialog-root, [role=\"dialog\"]").first();
    await expect(addDialog).toBeVisible({ timeout: 5000 });
    const failingUrl = `${getContentServerUrl()}/missing-failure-report-article.html`;
    await addDialog.locator(".MuiTextField-root input").first().fill(failingUrl);
    await addDialog.locator('button:has-text("Save")').first().click();
    return failingUrl;
  }

  test("offers a report after an article fails, and can be dismissed", async ({ page }) => {
    await submitFailingUrl(page);

    const dialog = reportDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText("Savr couldn't load this page.");
    await expect(dialog).toContainText("Filing needs a GitHub account.");

    await dialog.locator('button:has-text("Not now")').click();
    await expect(dialog).not.toBeVisible();
  });

  test("files a prefilled public GitHub issue", async ({ page }) => {
    const failingUrl = await submitFailingUrl(page);

    const dialog = reportDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15000 });

    await dialog.locator(".MuiAccordionSummary-root").click();
    const link = dialog.getByRole("link", { name: "File on GitHub" });
    await expect(link).toBeVisible();

    const href = await link.getAttribute("href");
    expect(href).toBeTruthy();
    const issueUrl = new URL(href!);
    expect(issueUrl.origin + issueUrl.pathname).toBe(
      `https://github.com/${REPORT_REPO}/issues/new`
    );
    expect(issueUrl.searchParams.get("title")).toBe(
      `[report] ${new URL(failingUrl).hostname} — Failed to load article`
    );

    const body = issueUrl.searchParams.get("body") ?? "";
    expect(body).toContain(`**URL:** ${failingUrl}`);
    expect(body).toContain("```json");
    expect(body).toContain("Failed to load article");

    await page.context().route("https://github.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>ok</body></html>",
      })
    );
    const [popup] = await Promise.all([page.waitForEvent("popup"), link.click()]);
    await popup.waitForURL(
      (url) => url.origin === "https://github.com" && url.pathname === `/${REPORT_REPO}/issues/new`,
      { timeout: 10000 }
    );
    expect(popup.url()).toContain(`https://github.com/${REPORT_REPO}/issues/new`);
    await popup.close();
  });

  test("uses the edited payload when filing", async ({ page }) => {
    await submitFailingUrl(page);

    const dialog = reportDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await dialog.locator(".MuiAccordionSummary-root").click();

    const edited = {
      url: "https://example.com/edited-article",
      error: { category: "ingest", message: "Edited message" },
      app: { version: "0.0.0", buildTimestamp: "2026-01-01T00:00:00.000Z", mode: "browser" },
      browser: { userAgent: "test-agent" },
      reportedAt: "2026-01-01T00:00:00.000Z",
    };
    await dialog.getByRole("textbox").fill(JSON.stringify(edited, null, 2));

    const link = dialog.getByRole("link", { name: "File on GitHub" });
    await expect(link).toBeEnabled();
    const href = await link.getAttribute("href");
    const issueUrl = new URL(href!);
    expect(issueUrl.searchParams.get("title")).toBe("[report] example.com — Edited message");
    expect(issueUrl.searchParams.get("body")).toContain("https://example.com/edited-article");
    expect(issueUrl.searchParams.get("body")).toContain("Edited message");
  });

  test.describe("on a phone-sized screen", () => {
    test.use({ viewport: { width: 390, height: 740 } });

    test("keeps the report actions reachable", async ({ page }) => {
      await submitFailingUrl(page);

      const dialog = reportDialog(page);
      await expect(dialog).toBeVisible({ timeout: 15000 });
      await dialog.locator(".MuiAccordionSummary-root").click();

      const link = dialog.getByRole("link", { name: "File on GitHub" });
      await expect(link).toBeVisible();
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeEnabled();

      const dismiss = dialog.locator('button:has-text("Not now")');
      await dismiss.scrollIntoViewIfNeeded();
      await dismiss.click();
      await expect(dialog).not.toBeVisible();
    });
  });
});
