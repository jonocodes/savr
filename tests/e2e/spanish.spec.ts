import { test, expect, type Page } from "@playwright/test";

const languageSelect = (page: Page) =>
  page.locator("select").filter({ has: page.locator('option[value="es"]') });

test.describe("Spanish locale", () => {
  test("renders English when no language has been chosen", async ({ page }) => {
    await page.goto("/prefs", { waitUntil: "networkidle" });

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Interface language")).toBeVisible();
    await expect(page.getByText("Preferences", { exact: true }).first()).toBeVisible();
  });

  test("loads straight into Spanish when the language cookie is set", async ({ page }) => {
    await page.goto("/prefs", { waitUntil: "networkidle" });
    await page.context().addCookies([
      { name: "savr-language", value: "es", url: page.url() },
    ]);
    await page.reload({ waitUntil: "networkidle" });

    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByText("Idioma de la interfaz")).toBeVisible();
    await expect(page.getByText("Preferencias", { exact: true }).first()).toBeVisible();
    await expect(languageSelect(page).inputValue()).resolves.toBe("es");
  });

  test("switching language in preferences re-renders the UI and persists", async ({
    page,
  }) => {
    await page.goto("/prefs", { waitUntil: "networkidle" });
    await expect(page.getByText("Interface language")).toBeVisible();

    await languageSelect(page).selectOption("es");

    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByText("Idioma de la interfaz")).toBeVisible();
    await expect(page.getByText("Preferencias", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Interface language")).toHaveCount(0);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByText("Idioma de la interfaz")).toBeVisible();
  });
});
