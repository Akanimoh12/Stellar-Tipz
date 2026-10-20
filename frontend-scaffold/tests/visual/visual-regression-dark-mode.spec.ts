import { test, expect, openForScreenshot, DYNAMIC_SELECTOR } from "./fixtures";

test.describe("Visual regression – Component Dark Mode", () => {
  test("Input component renders correctly in light theme", async ({ page }) => {
    await openForScreenshot(page, "/", { theme: "light", viewport: "desktop" });
    await expect(page).toHaveScreenshot("component-input-light.png", {
      fullPage: true,
      mask: [page.locator(DYNAMIC_SELECTOR)],
    });
  });

  test("Input component renders correctly in dark theme", async ({ page }) => {
    await openForScreenshot(page, "/", { theme: "dark", viewport: "desktop" });
    await expect(page).toHaveScreenshot("component-input-dark.png", {
      fullPage: true,
      mask: [page.locator(DYNAMIC_SELECTOR)],
    });
  });

  test("Button component renders correctly in both themes", async ({ page }) => {
    await openForScreenshot(page, "/", { theme: "light", viewport: "desktop" });
    await expect(page).toHaveScreenshot("component-button-light.png", {
      fullPage: true,
      mask: [page.locator(DYNAMIC_SELECTOR)],
    });
    await openForScreenshot(page, "/", { theme: "dark", viewport: "desktop" });
    await expect(page).toHaveScreenshot("component-button-dark.png", {
      fullPage: true,
      mask: [page.locator(DYNAMIC_SELECTOR)],
    });
  });

  test("Card component renders correctly in both themes", async ({ page }) => {
    await openForScreenshot(page, "/", { theme: "light", viewport: "desktop" });
    await expect(page).toHaveScreenshot("component-card-light.png", {
      fullPage: true,
      mask: [page.locator(DYNAMIC_SELECTOR)],
    });
    await openForScreenshot(page, "/", { theme: "dark", viewport: "desktop" });
    await expect(page).toHaveScreenshot("component-card-dark.png", {
      fullPage: true,
      mask: [page.locator(DYNAMIC_SELECTOR)],
    });
  });
});
