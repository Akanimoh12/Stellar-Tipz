#!/usr/bin/env node
/**
 * Validate all internal links in documentation.
 *
 * This script scans all markdown files in the docs/ directory and validates that:
 * 1. All markdown links point to existing files
 * 2. All relative file references are valid
 * 3. All header anchors (#section) match existing sections
 *
 * Fails fast on first error. Useful as a pre-commit or CI check.
 *
 * Usage: npx tsx scripts/validate-docs-links.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.join(__dirname, '../docs');

interface LinkError {
  file: string;
  line: number;
  link: string;
  reason: string;
}

const errors: LinkError[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────

function getAllMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function extractLinks(content: string, file: string): { link: string; line: number }[] {
  const links: { link: string; line: number }[] = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Match [text](link) patterns
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = markdownLinkRegex.exec(line)) !== null) {
      const link = match[2];
      // Skip external links and anchors-only
      if (!link.startsWith('http') && !link.startsWith('#')) {
        links.push({ link, line: index + 1 });
      }
    }

    // Match html anchor tags
    const htmlLinkRegex = /href=["']([^"']+)["']/g;
    while ((match = htmlLinkRegex.exec(line)) !== null) {
      const link = match[1];
      if (!link.startsWith('http') && !link.startsWith('#')) {
        links.push({ link, line: index + 1 });
      }
    }
  });

  return links;
}

function fileExists(link: string, relativeToFile: string): boolean {
  // Extract file path (ignore anchor)
  const [filePath] = link.split('#');

  if (!filePath) {
    return true; // Anchor-only link
  }

  const resolvedPath = path.resolve(path.dirname(relativeToFile), filePath);
  return fs.existsSync(resolvedPath);
}

function validateAnchor(
  link: string,
  relativeToFile: string,
): boolean {
  const [filePath, anchor] = link.split('#');

  if (!anchor) {
    return true; // No anchor
  }

  // Resolve the file path
  const targetPath = filePath
    ? path.resolve(path.dirname(relativeToFile), filePath)
    : relativeToFile;

  if (!fs.existsSync(targetPath)) {
    return true; // File doesn't exist, already caught by fileExists()
  }

  const content = fs.readFileSync(targetPath, 'utf-8');
  const headingRegex = /^#+\s+(.+)$/gm;
  let match;

  const anchorFromHeading = (heading: string) => {
    return heading
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  while ((match = headingRegex.exec(content)) !== null) {
    if (anchorFromHeading(match[1]) === anchor.toLowerCase()) {
      return true;
    }
  }

  return false;
}

function validateLink(link: string, file: string, lineNum: number): void {
  // Check if file exists
  if (!fileExists(link, file)) {
    const [filePath] = link.split('#');
    errors.push({
      file,
      line: lineNum,
      link,
      reason: `File not found: ${filePath}`,
    });
    return;
  }

  // Check if anchor exists (if anchor is present)
  if (link.includes('#')) {
    if (!validateAnchor(link, file)) {
      const [, anchor] = link.split('#');
      errors.push({
        file,
        line: lineNum,
        link,
        reason: `Anchor not found: #${anchor}`,
      });
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log('Scanning documentation for broken links...');

const mdFiles = getAllMarkdownFiles(docsDir);
console.log(`Found ${mdFiles.length} markdown files\n`);

for (const file of mdFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const links = extractLinks(content, file);

  for (const { link, line } of links) {
    validateLink(link, file, line);
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

if (errors.length === 0) {
  console.log('✓ All links valid!');
  process.exit(0);
}

console.error(`\n✗ Found ${errors.length} broken link(s):\n`);

errors.forEach((error) => {
  const relPath = path.relative(docsDir, error.file);
  console.error(`  ${relPath}:${error.line}`);
  console.error(`    Link: ${error.link}`);
  console.error(`    Error: ${error.reason}\n`);
});

process.exit(1);
