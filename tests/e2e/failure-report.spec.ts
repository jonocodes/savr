import { test, expect, type Page, type Locator } from "@playwright/test";
import { getContentServerUrl } from "./utils/remotestorage-helper";

// Must match VITE_FAILURE_REPORT_REPO in playwright.config.ts.
const REPORT_REPO = "jonocodes/savr-failure-reports";

async function triggerFailedCapture(page: Page): Promise<Locator> {
  await page.locator('button[aria-label*="add" i]').first().click();

  const addDialog = page.getByRole("dialog", { name: "Add Article" });
  await expect(addDialog).toBeVisible();
  await addDialog.getByLabel("URL").fill(`${getContentServerUrl()}/missing-article-for-report.html`);
  await addDialog.getByRole("button", { name: "Save" }).click();

  const reportDialog = page.getByTestId("failure-report-dialog");
  await expect(reportDialog).toBeVisible({ timeout: 15000 });
  return reportDialog;
}

test.describe("Failure report dialog", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("offers a report after a failed URL capture and can be dismissed", async ({ page }) => {
    const reportDialog = await triggerFailedCapture(page);

    await expect(reportDialog.getByText("Report this failed article?")).toBeVisible();
    await expect(page.getByText(/Error saving article/)).toBeVisible();

    await reportDialog.getByTestId("failure-report-dismiss").click();
    await expect(reportDialog).not.toBeVisible();
  });

  test("files a prefilled GitHub issue, carrying payload edits", async ({ page, context }) => {
    await context.route("https://github.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>stub</body></html>" }),
    );

    const reportDialog = await triggerFailedCapture(page);
    await reportDialog.getByText("What gets shared").click();

    const payloadInput = reportDialog.getByTestId("failure-report-payload");
    await expect(payloadInput).toBeVisible();
    await expect(payloadInput).toHaveValue(/"url": "http/);

    const edited = JSON.parse(await payloadInput.inputValue());
    edited.error.message = "Edited by the reporter";
    await payloadInput.fill(JSON.stringify(edited, null, 2));

    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      reportDialog.getByTestId("failure-report-file").click(),
    ]);

    await expect.poll(() => popup.url()).toContain(`github.com/${REPORT_REPO}/issues/new`);
    const issue = new URL(popup.url());
    const params = issue.searchParams;
    expect(params.get("title")).toContain("Edited by the reporter");
    expect(params.get("body")).toContain("Savr failed to load this article.");
    expect(params.get("body")).toContain(edited.url);
    expect(params.get("labels")).toBe("failed-url");
  });

  test("normalizes a schemeless URL so the report can be filed", async ({ page }) => {
    await page.locator('button[aria-label*="add" i]').first().click();
    const addDialog = page.getByRole("dialog", { name: "Add Article" });
    await expect(addDialog).toBeVisible();
    // Drop the scheme, as a person typing a URL by hand would.
    const schemeless = `${getContentServerUrl().replace(/^https?:\/\//, "")}/missing-article.html`;
    await addDialog.getByLabel("URL").fill(schemeless);
    await addDialog.getByRole("button", { name: "Save" }).click();

    const reportDialog = page.getByTestId("failure-report-dialog");
    await expect(reportDialog).toBeVisible({ timeout: 15000 });
    await reportDialog.getByText("What gets shared").click();
    await expect(reportDialog.getByTestId("failure-report-file")).toBeEnabled();
    await expect(reportDialog.getByTestId("failure-report-payload")).toHaveValue(
      new RegExp(`"url": "https://${schemeless.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
    );
  });

  test("keeps both actions reachable on a phone-sized screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const reportDialog = await triggerFailedCapture(page);
    await reportDialog.getByText("What gets shared").click();

    await expect(reportDialog.getByTestId("failure-report-file")).toBeInViewport();
    await expect(reportDialog.getByTestId("failure-report-dismiss")).toBeInViewport();
  });
});
