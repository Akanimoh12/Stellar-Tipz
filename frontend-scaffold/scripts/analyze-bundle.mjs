#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, '../build');

const BUNDLE_SIZE_LIMITS = {
  'stellar-sdk': 200 * 1024, // 200KB
  total: 500 * 1024, // 500KB
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function getGzipSize(buffer) {
  return zlib.gzipSync(buffer).length;
}

function analyzeBundle() {
  if (!fs.existsSync(BUILD_DIR)) {
    console.error(`❌ Build directory not found: ${BUILD_DIR}`);
    console.error('Please run "npm run build" first');
    process.exit(1);
  }

  const files = fs.readdirSync(BUILD_DIR, { recursive: true });
  const fileInfos = [];
  let totalSize = 0;
  let totalGzipSize = 0;

  // Analyze all files
  files.forEach((file) => {
    const filePath = path.join(BUILD_DIR, file);
    if (fs.statSync(filePath).isFile()) {
      const buffer = fs.readFileSync(filePath);
      const size = buffer.length;
      const gzipSize = getGzipSize(buffer);
      totalSize += size;
      totalGzipSize += gzipSize;

      fileInfos.push({
        name: file,
        size,
        gzipSize,
      });
    }
  });

  const runtimeFileInfos = fileInfos.filter((file) => !file.name.endsWith('.map'));

  // Sort by size
  fileInfos.sort((a, b) => b.size - a.size);
  runtimeFileInfos.sort((a, b) => b.size - a.size);

  // Report
  console.log('\n📊 Bundle Analysis Report\n');
  console.log('Top 15 Largest Files:');
  console.log('─'.repeat(80));
  console.log(
    'File'.padEnd(40) +
      'Size'.padEnd(20) +
      'Gzip'.padEnd(20)
  );
  console.log('─'.repeat(80));

  fileInfos.slice(0, 15).forEach(({ name, size, gzipSize }) => {
    const displayName = name.toString().length > 39 
      ? '...' + name.toString().slice(-36)
      : name.toString();
    console.log(
      displayName.padEnd(40) +
        formatBytes(size).padEnd(20) +
        formatBytes(gzipSize).padEnd(20)
    );
  });

  console.log('─'.repeat(80));
  console.log(
    'TOTAL'.padEnd(40) +
      formatBytes(totalSize).padEnd(20) +
      formatBytes(totalGzipSize).padEnd(20)
  );
  console.log();

  // Check Stellar SDK bundle
  const stellarFiles = runtimeFileInfos.filter(
    (f) => f.name.includes('stellar') || f.name.includes('soroban')
  );

  if (stellarFiles.length > 0) {
    console.log('\n🌟 Stellar SDK Bundle Analysis:');
    console.log('─'.repeat(80));
    let stellarTotalSize = 0;
    let stellarTotalGzip = 0;

    stellarFiles.forEach(({ name, size, gzipSize }) => {
      stellarTotalSize += size;
      stellarTotalGzip += gzipSize;
      const displayName = name.toString().length > 39 
        ? '...' + name.toString().slice(-36)
        : name.toString();
      console.log(
        displayName.padEnd(40) +
          formatBytes(size).padEnd(20) +
          formatBytes(gzipSize).padEnd(20)
      );
    });

    console.log('─'.repeat(80));
    console.log(
      'Stellar SDK Total'.padEnd(40) +
        formatBytes(stellarTotalSize).padEnd(20) +
        formatBytes(stellarTotalGzip).padEnd(20)
    );
    console.log();

    // Check against limits
    const limit = BUNDLE_SIZE_LIMITS['stellar-sdk'];
    const percentage = Math.round((stellarTotalGzip / limit) * 100);
    
    if (stellarTotalGzip > limit) {
      console.log(
        `⚠️  Stellar SDK gzip size (${formatBytes(stellarTotalGzip)}) exceeds limit (${formatBytes(limit)}) - ${percentage}%`
      );
      process.exit(1);
    } else {
      console.log(
        `✅ Stellar SDK gzip size (${formatBytes(stellarTotalGzip)}) is within limit (${formatBytes(limit)}) - ${percentage}%`
      );
    }
  }

  console.log();
}

analyzeBundle();
