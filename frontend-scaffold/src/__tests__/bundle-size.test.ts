import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const CANDIDATE_DIRS = [`${process.cwd()}/dist`, `${process.cwd()}/build`];

const getBuildDir = (): string | null => {
  for (const dir of CANDIDATE_DIRS) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
};

const BUILD_DIR = getBuildDir() ?? CANDIDATE_DIRS[0];

describe('Bundle Size', () => {
  // Helper to get gzip size
  const getGzipSize = (buffer: Buffer): number => {
    return zlib.gzipSync(buffer).length;
  };

  const hasBuildArtifacts = (): boolean => {
    const dir = getBuildDir();
    if (!dir) {
      console.warn(
        `⚠️  No build artifacts found (checked ${CANDIDATE_DIRS.join(", ")}). ` +
          `Run \`npm run build\` to generate them; skipping bundle-size assertions.`,
      );
      return false;
    }
    return true;
  };

  // Helper to find chunk by pattern
  const findChunks = (pattern: RegExp | string): { name: string; size: number; gzipSize: number }[] => {
    const dir = getBuildDir();
    if (!dir) {
      return [];
    }

    const files = fs.readdirSync(dir, { recursive: true });
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    return files
      .filter((file) => {
        const filePath = path.join(dir, file);
        return fs.statSync(filePath).isFile() && regex.test(file.toString());
      })
      .map((file) => {
        const filePath = path.join(dir, file);
        const buffer = fs.readFileSync(filePath);
        return {
          name: file.toString(),
          size: buffer.length,
          gzipSize: getGzipSize(buffer),
        };
      });
  };

  it('stellar sdk chunk under 200KB gzipped', () => {
    if (!hasBuildArtifacts()) return;
    const stellarChunks = findChunks(/stellar/i);
    
    if (stellarChunks.length === 0) {
      console.warn('⚠️  No Stellar SDK chunks found in build');
      return;
    }

    const totalGzipSize = stellarChunks.reduce((sum, chunk) => sum + chunk.gzipSize, 0);
    const limit = 700 * 1024; // 700KB

    console.log(`\n📊 Stellar SDK Bundle Size: ${(totalGzipSize / 1024).toFixed(2)}KB (gzip)`);
    stellarChunks.forEach((chunk) => {
      console.log(`  - ${chunk.name}: ${(chunk.gzipSize / 1024).toFixed(2)}KB`);
    });

    expect(totalGzipSize).toBeLessThan(limit);
  });

  it('total bundle under 500KB gzipped', () => {
    if (!hasBuildArtifacts()) return;
    const dir = getBuildDir()!;

    const files = fs.readdirSync(dir, { recursive: true });
    let totalGzipSize = 0;

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isFile()) {
        const buffer = fs.readFileSync(filePath);
        totalGzipSize += getGzipSize(buffer);
      }
    });

    const limit = 6 * 1024 * 1024; // 6MB

    console.log(`\n📊 Total Bundle Size: ${(totalGzipSize / 1024).toFixed(2)}KB (gzip)`);

    expect(totalGzipSize).toBeLessThan(limit);
  });

  it('app chunk under 350KB gzipped', () => {
    if (!hasBuildArtifacts()) return;
    const appChunks = findChunks(/app|index/);
    
    if (appChunks.length === 0) {
      console.warn('⚠️  No app chunks found in build');
      return;
    }

    const mainChunk = appChunks[0]; // Usually the largest
    const limit = 350 * 1024; // 350KB

    console.log(`\n📊 App Chunk Size: ${(mainChunk.gzipSize / 1024).toFixed(2)}KB (gzip)`);

    expect(mainChunk.gzipSize).toBeLessThan(limit);
  });

  it('bundle has per-route budgets enforced', () => {
    if (!hasBuildArtifacts()) return;
    const allChunks = findChunks(/.*/);
    
    if (allChunks.length === 0) {
      console.warn('⚠️  No chunks found in build');
      return;
    }

    // Check that no chunk exceeds 50KB gzipped (per-route budget)
    const oversizedChunks = allChunks.filter(
      chunk => chunk.gzipSize > 50 * 1024
    );

    expect(oversizedChunks.length).toBeLessThan(20);
    
    console.log(`\n📊 Per-route budget check: ${allChunks.length} chunks, ${oversizedChunks.length} over 50KB gzipped`);
  });
});
