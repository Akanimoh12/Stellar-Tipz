import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Deterministic raster test data; no gateway or third-party uptime dependency in CI.
const directory = new URL("./public/", import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const width of [320, 640, 1280]) {
    for (const format of ["webp", "jpg"]) {
      const data = await page.evaluate(
        ({ width, format }) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = width / 2;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(0, 0, width, width / 2);
          ctx.fillStyle = "#111827";
          ctx.fillRect(width / 4, width / 8, width / 2, width / 4);
          return canvas
            .toDataURL(format === "jpg" ? "image/jpeg" : "image/webp", 0.8)
            .split(",")[1];
        },
        { width, format },
      );
      await writeFile(
        new URL(`hero-${width}.${format}`, directory),
        Buffer.from(data, "base64"),
      );
      if (width === 320 && format === "webp")
        await writeFile(
          new URL("below.webp", directory),
          Buffer.from(data, "base64"),
        );
    }
  }
} finally {
  await browser.close();
}
