import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { preview } from "vite";

const server = await preview({
  configFile: "tests/images/vite.config.ts",
  preview: { port: 4175, strictPort: true },
});
const browser = await chromium.launch();
try {
  for (const width of [320, 768, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      deviceScaleFactor: 1,
    });
    const requests = [];
    page.on("request", (request) => {
      if (request.resourceType() === "image") requests.push(request.url());
    });
    await page.goto("http://localhost:4175");
    await page.getByAltText("Hero fixture").evaluate((img) => img.decode());
    const selectedWidth = width === 320 ? 320 : 640;
    assert.equal(
      await page
        .getByAltText("Hero fixture")
        .evaluate((img) => new URL(img.currentSrc).pathname),
      `/hero-${selectedWidth}.webp`,
    );
    assert.equal(
      requests.filter((url) => url.includes("/hero-")).length,
      1,
      "preload must not download an extra hero",
    );
    assert.ok(
      !requests.some((url) => url.endsWith("/below.webp")),
      "below-fold image fetched too soon",
    );
    await page.screenshot({ path: `dist-images/viewport-${width}.png` });
    await page.getByAltText("Below fold fixture").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const img = document.querySelector('img[alt="Below fold fixture"]');
      return (
        img.src.endsWith("/below.webp") && img.complete && img.naturalWidth > 0
      );
    });
    await page.close();
  }
  console.log(
    "Responsive selection, single hero download and deferred below-fold loading pass at 320, 768 and 1440px.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
