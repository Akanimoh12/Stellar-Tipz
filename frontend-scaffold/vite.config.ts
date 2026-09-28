import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";
import { createHash } from "crypto";
import fs from "fs";

const SRI_ALGORITHM = "sha384";
const EXTERNAL_STYLESHEET_REGEX =
  /<link\b(?=[^>]*rel=["'][^"']*stylesheet[^"']*["'])[^>]*href=["']https?:\/\/[^"']+["'][^>]*>/gi;
const EXTERNAL_SCRIPT_REGEX = /<script\b[^>]*src=["']https?:\/\/[^"']+["'][^>]*><\/script>/gi;

function getExternalUrl(tag: string) {
  const match = tag.match(/(?:href|src)=["'](https?:\/\/[^"']+)["']/i);
  return match?.[1] ?? null;
}

function isStylesheetTag(tag: string) {
  return /<link\b/i.test(tag) && /rel=["'][^"']*stylesheet[^"']*["']/i.test(tag);
}

function isExternalScriptTag(tag: string) {
  return /<script\b/i.test(tag);
}

function setOrAppendAttribute(tag: string, name: string, value: string) {
  const attributePattern = new RegExp(`\\s${name}=([\"']).*?\\1`, "i");
  if (attributePattern.test(tag)) {
    return tag.replace(attributePattern, ` ${name}="${value}"`);
  }

  return tag.replace(/(\s*\/?>)$/, ` ${name}="${value}"$1`);
}

function computeSri(url: string) {
  return fetch(url, {
    headers: {
      "user-agent": "Codex",
    },
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const hash = createHash(SRI_ALGORITHM).update(bytes).digest("base64");
    return `${SRI_ALGORITHM}-${hash}`;
  });
}

async function rewriteExternalAssets(html: string, validateOnly = false) {
  const matches = [...html.matchAll(EXTERNAL_STYLESHEET_REGEX), ...html.matchAll(EXTERNAL_SCRIPT_REGEX)];
  let rewrittenHtml = html;

  for (const match of matches) {
    const originalTag = match[0];
    const externalUrl = getExternalUrl(originalTag);

    if (!externalUrl) {
      continue;
    }

    const integrity = await computeSri(externalUrl);
    const existingIntegrity = originalTag.match(/integrity=(["'])(.*?)\1/i)?.[2];
    const existingCrossOrigin = originalTag.match(/crossorigin=(["'])(.*?)\1/i)?.[2];

    if (validateOnly) {
      if (!existingIntegrity) {
        throw new Error(`Missing SRI for ${externalUrl}`);
      }

      if (existingIntegrity !== integrity) {
        throw new Error(
          `Outdated SRI for ${externalUrl}. Expected ${integrity}, found ${existingIntegrity}`,
        );
      }

      if (existingCrossOrigin !== "anonymous") {
        throw new Error(`Missing crossorigin="anonymous" for ${externalUrl}`);
      }

      continue;
    }

    let updatedTag = setOrAppendAttribute(originalTag, "integrity", integrity);
    updatedTag = setOrAppendAttribute(updatedTag, "crossorigin", "anonymous");

    if (isStylesheetTag(updatedTag) || isExternalScriptTag(updatedTag)) {
      updatedTag = setOrAppendAttribute(
        updatedTag,
        "onerror",
        "window.__tipzRetryExternalAsset(this)",
      );
    }

    rewrittenHtml = rewrittenHtml.replace(originalTag, updatedTag);
  }

  return rewrittenHtml;
}

// Plugin to generate, validate, and inject SRI hashes for external assets.
function sriPlugin() {
  return {
    name: "vite-plugin-sri",
    apply: "build" as const,
    async buildStart() {
      const htmlPath = path.resolve(__dirname, "index.html");
      const sourceHtml = fs.readFileSync(htmlPath, "utf8");

      await rewriteExternalAssets(sourceHtml, true);
    },
    async transformIndexHtml(html: string) {
      return rewriteExternalAssets(html);
    },
    async writeBundle(options: any) {
      const outDir = options.dir || "build";
      const assets = fs.readdirSync(outDir, { recursive: true });

      assets.forEach((file: string) => {
        const filePath = path.join(outDir, file as string);
        if (fs.statSync(filePath).isFile()) {
          const content = fs.readFileSync(filePath);
          const hash = createHash(SRI_ALGORITHM).update(content).digest("base64");
          const integrity = `${SRI_ALGORITHM}-${hash}`;
          console.log(`SRI for ${file}: ${integrity}`);
        }
      });
    },
  };
}

// Plugin to analyze and report bundle size
function bundleAnalyzerPlugin() {
  return {
    name: "vite-plugin-bundle-analyzer",
    apply: "build" as const,
    async writeBundle(options: any) {
      const outDir = options.dir || "build";
      const files = fs.readdirSync(outDir, { recursive: true });
      const sizeMap: { [key: string]: number } = {};

      files.forEach((file: string) => {
        const filePath = path.join(outDir, file as string);
        if (fs.statSync(filePath).isFile()) {
          const stats = fs.statSync(filePath);
          sizeMap[file as string] = stats.size;
        }
      });

      // Log bundle sizes
      console.log("\n📦 Bundle Size Report:");
      const sortedFiles = Object.entries(sizeMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      sortedFiles.forEach(([file, size]) => {
        const sizeKb = (size / 1024).toFixed(2);
        const gzipSize = Math.round(size * 0.3); // Rough estimate
        const gzipKb = (gzipSize / 1024).toFixed(2);
        console.log(
          `  ${file}: ${sizeKb}KB (gzip: ~${gzipKb}KB)`
        );
      });

      // Check Stellar SDK bundle size
      const stellarChunks = Object.entries(sizeMap).filter(([file]) =>
        file.includes("stellar") || file.includes("soroban")
      );
      if (stellarChunks.length > 0) {
        console.log("\n🌟 Stellar SDK Chunks:");
        stellarChunks.forEach(([file, size]) => {
          const sizeKb = (size / 1024).toFixed(2);
          const gzipSize = Math.round(size * 0.3);
          const gzipKb = (gzipSize / 1024).toFixed(2);
          console.log(`  ${file}: ${sizeKb}KB (gzip: ~${gzipKb}KB)`);
        });
      }

      // Total app size
      const totalSize = Object.values(sizeMap).reduce((a, b) => a + b, 0);
      const totalKb = (totalSize / 1024).toFixed(2);
      console.log(`\n📊 Total Bundle: ${totalKb}KB\n`);
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
      // sriPlugin: adds integrity= + crossorigin=anonymous to external scripts/styles,
      // satisfying the hash-based script-src requirement (no unsafe-inline needed).
      sriPlugin(),
      bundleAnalyzerPlugin(),
    ],
    define: {
      // Inject build information for health check (#547)
      'import.meta.env.VITE_BUILD_TIMESTAMP': JSON.stringify(new Date().toISOString()),
      'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(
        process.env.GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown'
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "framer-motion": path.resolve(__dirname, "node_modules/framer-motion/dist/cjs/index.js"),
      },
    },
    server: {
      port: 3000,
      open: true,
    },
    build: {
      outDir: "build",
      sourcemap: true,
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: false,
          drop_debugger: true,
          pure_funcs: ["console.debug"],
        },
        mangle: true,
        output: {
          comments: false,
        },
      },
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
          manualChunks: (id) => {
            if (id.includes("node_modules/@stellar")) {
              return "stellar-sdk";
            }
            if (id.includes("node_modules/react")) {
              return "react-vendor";
            }
            if (id.includes("node_modules")) {
              return "vendor";
            }
          },
        },
      },
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
