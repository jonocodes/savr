import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect, type Page, type Route } from "@playwright/test";

// A proxy that only exists inside page.route(): each test decides how it
// answers. `.invalid` never resolves, so nothing leaks to a real network.
const PROXY_ORIGIN = "https://proxy.savr-test.invalid";
const TARGET = "https://example.com/some-article";

async function openWithProxy(page: Page, proxy: string) {
  await page.addInitScript((value) => {
    localStorage.setItem("savr-cors-proxy", value);
  }, proxy);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

async function useRoutedProxy(page: Page, handler: (route: Route) => Promise<void>) {
  await page.route(`${PROXY_ORIGIN}/**`, handler);
  await openWithProxy(page, `${PROXY_ORIGIN}/?url=`);
}

async function saveUrl(page: Page) {
  await page.locator('button[aria-label*="add" i]').first().click();
  const addDialog = page.getByRole("dialog", { name: "Add Article" });
  await expect(addDialog).toBeVisible();
  await addDialog.getByLabel("URL").fill(TARGET);
  await addDialog.getByRole("button", { name: "Save" }).click();
}

test.describe("CORS proxy health banner", () => {
  // Stands in for Cloudflare's edge once a free worker is capped (error 1027):
  // its own page, without our worker's CORS headers. This needs a real server:
  // route.fulfill() adds Access-Control-Allow-Origin by itself, so the browser
  // would never see a CORS failure.
  let cappedEdge: Server;
  let cappedEdgeUrl: string;

  test.beforeAll(async () => {
    cappedEdge = createServer((_req, res) => {
      res.writeHead(429, { "Content-Type": "text/plain" });
      res.end("error code: 1027");
    });
    await new Promise<void>((resolve) => cappedEdge.listen(0, "127.0.0.1", resolve));
    cappedEdgeUrl = `http://127.0.0.1:${(cappedEdge.address() as AddressInfo).port}`;
  });

  test.afterAll(async () => {
    await new Promise((resolve) => cappedEdge.close(resolve));
  });

  test("a visible 429 reads as rate-limiting", async ({ page }) => {
    await useRoutedProxy(page, (route) =>
      route.fulfill({
        status: 429,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: "Too Many Requests",
      })
    );
    await saveUrl(page);

    const banner = page.getByTestId("proxy-health-banner");
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner.getByTestId("proxy-health-message")).toHaveText(
      "Your CORS proxy is rate-limiting requests (HTTP 429)."
    );
  });

  test("an answer without CORS headers reads as responding but not working", async ({ page }) => {
    await openWithProxy(page, `${cappedEdgeUrl}/?url=`);
    await saveUrl(page);

    const banner = page.getByTestId("proxy-health-banner");
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner.getByTestId("proxy-health-message")).toHaveText(
      "Your CORS proxy is responding but not working. It may have hit a usage limit or be misconfigured."
    );
    // A custom proxy is configured, so no "set up your own" pitch.
    await expect(banner.getByRole("link", { name: "Set up your own proxy" })).toHaveCount(0);

    // The same observation shows next to the setting in Preferences (after
    // closing the failed-capture report that the save also opened).
    await page.getByTestId("failure-report-dismiss").click();
    await banner.getByRole("link", { name: "Proxy settings" }).click();
    await expect(page.getByTestId("proxy-health-status")).toContainText(
      "Your CORS proxy is responding but not working."
    );
  });

  test("no answer at all reads as not responding", async ({ page }) => {
    await useRoutedProxy(page, (route) => route.abort("connectionrefused"));
    await saveUrl(page);

    const banner = page.getByTestId("proxy-health-banner");
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner.getByTestId("proxy-health-message")).toHaveText(
      "Your CORS proxy isn't responding. Check the URL in Preferences."
    );
  });

  test("a failing target behind a working proxy shows no banner", async ({ page }) => {
    let probes = 0;
    await useRoutedProxy(page, (route) => {
      const target = new URL(route.request().url()).searchParams.get("url");
      if (target) return route.abort("connectionrefused");
      // The probe (empty target): our worker's CORS 400 means "running".
      probes += 1;
      return route.fulfill({
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: "Missing 'url' parameter",
      });
    });
    await saveUrl(page);

    await expect(page.getByText(/Error saving article/)).toBeVisible({ timeout: 15000 });
    expect(probes).toBeGreaterThan(0);
    await expect(page.getByTestId("proxy-health-banner")).toHaveCount(0);
  });
});
