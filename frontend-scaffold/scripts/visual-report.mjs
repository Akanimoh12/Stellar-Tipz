#!/usr/bin/env node
/**
 * Turns Playwright's JSON report for the visual suite into Markdown for the
 * GitHub step summary and the PR comment (issue #1343), so diffs are visible
 * in the PR rather than buried in CI logs.
 *
 *   node scripts/visual-report.mjs test-results/visual/results.json
 */
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import process from 'node:process';

const MARKER = '<!-- visual-regression-report -->';
const ANSI_ESCAPES = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const reportPath = process.argv[2] ?? 'test-results/visual/results.json';

function collectSpecs(suite, acc = []) {
  for (const spec of suite.specs ?? []) acc.push(spec);
  for (const child of suite.suites ?? []) collectSpecs(child, acc);
  return acc;
}

function classify(result) {
  const message = result.error?.message ?? result.errors?.map((e) => e.message).join('\n') ?? '';
  const stripped = message.replace(ANSI_ESCAPES, '');
  if (/snapshot doesn't exist|is missing in snapshots/i.test(stripped)) return { kind: 'missing baseline', detail: 'no baseline committed yet' };
  const ratio = stripped.match(/ratio ([0-9.]+) of all image pixels/i);
  const pixels = stripped.match(/([0-9]+) pixels/i);
  if (ratio || pixels) {
    return { kind: 'pixel diff', detail: `${pixels ? pixels[1] : '?'} px, ratio ${ratio ? ratio[1] : '?'}` };
  }
  const sizes = stripped.match(/Expected an image (\d+)px by (\d+)px, received (\d+)px by (\d+)px/i);
  if (sizes) return { kind: 'size mismatch', detail: `expected ${sizes[1]}x${sizes[2]}, got ${sizes[3]}x${sizes[4]}` };
  if (/Inter must be loaded/.test(stripped)) return { kind: 'fonts not loaded', detail: 'web fonts unavailable in this run' };
  const firstLine = stripped.split('\n').find((line) => line.trim().length > 0) ?? 'unknown error';
  return { kind: 'error', detail: firstLine.slice(0, 160) };
}

function attachmentsOf(result) {
  return (result.attachments ?? [])
    .filter((a) => /^(expected|actual|diff)$/i.test(a.name ?? '') || /-(expected|actual|diff)\.png$/.test(a.path ?? ''))
    .map((a) => `${a.name}: ${basename(a.path ?? '')}`)
    .join(', ');
}

function render() {
  if (!existsSync(reportPath)) {
    return `${MARKER}\n## Visual regression\n\nNo results file at \`${reportPath}\`: the suite did not run (build or install failure). Check the job log.\n`;
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const specs = report.suites.flatMap((s) => collectSpecs(s));
  const rows = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const spec of specs) {
    for (const t of spec.tests ?? []) {
      const last = t.results?.[t.results.length - 1];
      if (!last) continue;
      if (last.status === 'passed') {
        passed += 1;
        continue;
      }
      if (last.status === 'skipped') {
        skipped += 1;
        continue;
      }
      failed += 1;
      const { kind, detail } = classify(last);
      rows.push(`| \`${spec.title}\` | ${kind} | ${detail} | ${attachmentsOf(last) || '-'} |`);
    }
  }
  const lines = [MARKER, '## Visual regression', '', `**${passed} passed**, **${failed} failed**, ${skipped} skipped.`, ''];
  if (failed === 0) {
    lines.push('All screenshots match their baselines.', '');
  } else {
    lines.push(
      '| Snapshot | Reason | Detail | Files in `visual-diffs` artifact |',
      '|---|---|---|---|',
      ...rows,
      '',
      'Download the `visual-diffs` artifact for expected / actual / diff images, or open the `playwright-visual-report` artifact for the side-by-side viewer.',
      '',
      'If the change is intentional, a maintainer adds the `visual-baselines:update` label after reviewing the diffs; the Visual Baselines workflow regenerates the PNGs inside the pinned container and pushes them to this branch (fork PRs receive a `visual-baselines` artifact to commit instead). See docs/CONTRIBUTING.md, "Visual regression baselines".',
      '',
    );
  }
  return lines.join('\n');
}

process.stdout.write(render());
