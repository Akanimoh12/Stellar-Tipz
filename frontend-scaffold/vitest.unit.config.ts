import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'framer-motion': path.resolve(
        __dirname,
        'node_modules/framer-motion/dist/cjs/index.js',
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentMatchGlobs: [
      // Service worker tests run in a Node environment (no DOM).
      ['src/sw.test.ts', 'node'],
    ],
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
    server: {
      deps: {
        inline: ['@stellar/stellar-sdk', '@stellar/stellar-base'],
      },
    },
  },
});