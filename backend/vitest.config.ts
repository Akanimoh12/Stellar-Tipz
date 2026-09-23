import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    env: { TEST_JWT_SECRET: process.env.TEST_JWT_SECRET ?? randomBytes(32).toString('hex') },
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['vitest.setup.ts', 'tests/setup.ts'],
  },
});
