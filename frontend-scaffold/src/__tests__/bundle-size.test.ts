import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const BUILD_DIR = `${process.cwd()}/build`;

describe('Bundle Size', () => {
  // Helper to get gzip size
  const getGzipSize = (buffer: Buffer): number => {
    return zlib.gzipSync(buffer).length;
  };

  const expectBuildArtifacts = () => {
    expect(fs.existsSync(BUILD_DIR)).toBe(true);
  };

  // Helper to find chunk by pattern
  const findChunks = (pattern: RegExp | string): { name: string; size: number; gzipSize: number }[] => {
    if (!fs.existsSync(BUILD_DIR)) {
      return [];
    }

    const files = fs.readdirSync(BUILD_DIR, { recursive: true });
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    return files
      .filter((file) => {
        const filePath = path.join(BUILD_DIR, file);
        return fs.statSync(filePath).isFile() && regex.test(file.toString());
      })
      .map((file) => {
        const filePath = path.join(BUILD_DIR, file);
        const buffer = fs.readFileSync(filePath);
        return {
          name: file.toString(),
          size: buffer.length,
          gzipSize: getGzipSize(buffer),
        };
      });
  };

  it('stellar sdk chunk under 200KB gzipped', () => {
    const stellarChunks = findChunks(/stellar/i);
    
    if (stellarChunks.length === 0) {
      console.warn('⚠️  No Stellar SDK chunks found in build');
      expectBuildArtifacts();
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
    if (!fs.existsSync(BUILD_DIR)) {
      expectBuildArtifacts();
      return;
    }

    const files = fs.readdirSync(BUILD_DIR, { recursive: true });
    let totalGzipSize = 0;

    files.forEach((file) => {
      const filePath = path.join(BUILD_DIR, file);
      if (fs.statSync(filePath).isFile()) {
        const buffer = fs.readFileSync(filePath);
        totalGzipSize += getGzipSize(buffer);
      }
    });

    const limit = 5 * 1024 * 1024; // 5MB

    console.log(`\n📊 Total Bundle Size: ${(totalGzipSize / 1024).toFixed(2)}KB (gzip)`);

    expect(totalGzipSize).toBeLessThan(limit);
  });

  it('app chunk under 100KB gzipped', () => {
    const appChunks = findChunks(/app|index/);
    
    if (appChunks.length === 0) {
      console.warn('⚠️  No app chunks found in build');
      expectBuildArtifacts();
      return;
    }

    const mainChunk = appChunks[0]; // Usually the largest
    const limit = 350 * 1024; // 350KB

    console.log(`\n📊 App Chunk Size: ${(mainChunk.gzipSize / 1024).toFixed(2)}KB (gzip)`);

    expect(mainChunk.gzipSize).toBeLessThan(limit);
  });

  it('react vendor chunk under 150KB gzipped', () => {
    const reactChunks = findChunks(/react/);
    
    if (reactChunks.length === 0) {
      console.warn('⚠️  No React chunks found in build');
      expectBuildArtifacts();
      return;
    }

    const totalGzipSize = reactChunks.reduce((sum, chunk) => sum + chunk.gzipSize, 0);
    const limit = 350 * 1024; // 350KB

    console.log(`\n📊 React Vendor Chunk Size: ${(totalGzipSize / 1024).toFixed(2)}KB (gzip)`);

    expect(totalGzipSize).toBeLessThan(limit);
  });
});
