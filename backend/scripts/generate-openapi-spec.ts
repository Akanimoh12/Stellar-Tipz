#!/usr/bin/env node
/**
 * Generate OpenAPI spec file from the live API.
 *
 * This script starts the backend temporarily to generate the full OpenAPI spec,
 * saves it to a file, then shuts down. Used by the build and by CI to verify
 * the spec is complete and up-to-date.
 *
 * Usage: npx tsx scripts/generate-openapi-spec.ts [output-path]
 * Default output: backend/openapi-generated.json
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = process.argv[2] || path.join(__dirname, '../openapi-generated.json');
const maxWaitTime = 30000; // 30 seconds to start server
const specUrl = 'http://localhost:3001/api/v1/docs/openapi.json';

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerReady(): Promise<boolean> {
  try {
    const res = await fetch(specUrl);
    return res.ok;
  } catch {
    return false;
  }
}

async function getSpec(): Promise<Record<string, unknown>> {
  const res = await fetch(specUrl);
  if (!res.ok) throw new Error(`Failed to fetch spec: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function main() {
  console.log('Starting backend server to generate OpenAPI spec...');

  // Start dev server
  const server = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
  });

  let ready = false;
  let attempts = 0;
  const maxAttempts = 300; // 30 seconds with 100ms intervals

  // Wait for server to be ready
  while (!ready && attempts < maxAttempts) {
    try {
      ready = await isServerReady();
      if (ready) break;
    } catch {
      // Not ready yet
    }
    await wait(100);
    attempts++;
  }

  if (!ready) {
    console.error('✗ Server did not start within timeout');
    server.kill();
    process.exit(1);
  }

  console.log('✓ Server started, fetching OpenAPI spec...');

  try {
    const spec = await getSpec();
    const output = JSON.stringify(spec, null, 2);
    fs.writeFileSync(outputPath, output, 'utf-8');
    console.log(`✓ OpenAPI spec written to: ${outputPath}`);

    // Validate spec has routes
    const pathCount = Object.keys(spec.paths || {}).length;
    console.log(`  Spec contains ${pathCount} documented routes`);

    if (pathCount < 10) {
      console.warn('  ⚠ Warning: spec has very few routes, may be incomplete');
    }
  } catch (error) {
    console.error('✗ Failed to fetch spec:', error);
    process.exit(1);
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
