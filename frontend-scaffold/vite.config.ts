import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import viteImagemin from "vite-plugin-imagemin";
import path from "path";
import { createHash } from "crypto";
import fs from "fs";

// Plugin to generate and log SRI hashes for built assets
function sriPlugin() {
  return {
    name: "vite-plugin-sri",
    apply: "build" as const,
    async writeBundle(options: any) {
      const outDir = options.dir || "build";
      const assets = fs.readdirSync(outDir, { recursive: true });

      assets.forEach((file: string) => {
        const filePath = path.join(outDir, file as string);
        if (fs.statSync(filePath).isFile()) {
          const content = fs.readFileSync(filePath);
          const hash = createHash("sha384").update(content).digest("base64");
          const integrity = `sha384-${hash}`;
          console.log(`SRI for ${file}: ${integrity}`);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    nodePolyfills({
      include: ["buffer"],
      globals: { Buffer: true },
    }),
    sriPlugin(),
    viteImagemin({
      optipng: { optimizationLevel: 7 },
      mozjpeg: { quality: 80 },
      webp: { quality: 80 },
      svgo: {
        plugins: [
          { name: "removeViewBox", active: false },
          { name: "removeEmptyAttrs", active: true },
          { name: "removeComments", active: true },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: "build",
    sourcemap: true,
  },
  css: {
    preprocessorOptions: {
      scss: {},
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    server: {
      deps: {
        inline: [/@csstools/],
      },
    },
  },
});