#!/usr/bin/env node
/**
 * Coverage ratchet.
 *
 * Reads a Vitest `coverage-summary.json`, checks it against the per-module
 * policy in `coverage-policy.mjs`, and fails when either:
 *   1. a module drops below its enforced floor, or
 *   2. total coverage drops below the committed baseline (the ratchet proper).
 *
 * Also emits a Markdown report of uncovered lines inside critical paths so the
 * gap is visible on the PR instead of hidden behind a single percentage.
 *
 * Usage:
 *   node scripts/check-coverage.mjs <backend|frontend> [--summary <path>] [--baseline <path>]
 *
 * Exit codes: 0 pass, 1 threshold or ratchet failure, 2 bad input.
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { policies, criticalPaths, declarationFilePatterns } from './coverage-policy.mjs';

// Resolve defaults against the repo root so the script behaves the same whether
// it is run from the repo root, from `backend/`, or from `frontend-scaffold/`.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const component = args[0];

if (!policies[component]) {
  console.error(`Usage: node scripts/check-coverage.mjs <${Object.keys(policies).join('|')}> [--summary <path>]`);
  console.error('  --summary <path>   path to coverage-summary.json (default: <component>/coverage/coverage-summary.json)');
  console.error('  --baseline <path>  path to the ratchet baseline json (default: coverage-baseline.json)');
  process.exit(2);
}

function flagValue(name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
}

const policy = policies[component];
const tolerance = policy.tolerance ?? 0.5;
const summaryPath = resolve(repoRoot, flagValue('--summary') ?? `${policy.dir}/coverage/coverage-summary.json`);
const baselinePath = resolve(repoRoot, flagValue('--baseline') ?? 'coverage-baseline.json');
const reportPath = resolve(repoRoot, flagValue('--report') ?? `coverage-${component}-report.md`);

if (!existsSync(summaryPath)) {
  console.error(`::error::Coverage summary not found at ${summaryPath}`);
  console.error('Run `npm run test:coverage` in the component first.');
  process.exit(2);
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

/**
 * Normalise a coverage-summary key to a path relative to the component root.
 * Vitest emits absolute paths (posix or win32) that include the component
 * directory, e.g. `C:\...\Stellar-Tipz\backend\src\app.ts`.
 */
function toRelative(key) {
  const posix = key.replaceAll('\\', '/');
  const dir = policy.dir;
  const marker = `/${dir}/`;
  const index = posix.indexOf(marker);
  if (index !== -1) return posix.slice(index + marker.length);
  const root = `${dir}/`;
  return posix.startsWith(root) ? posix.slice(root.length) : posix.replace(/^.*?Stellar-Tipz\//, '');
}

/** Group a module's files and compute the aggregate line percentage. */
function moduleCoverage(policyModule) {
  let covered = 0;
  let total = 0;
  const files = [];

  for (const [key, value] of Object.entries(summary)) {
    if (key === 'total') continue;
    const rel = toRelative(key);
    if (!rel.startsWith('src/')) continue;

    const parts = rel.split('/');
    let name;
    if (component === 'backend') {
      if (parts[1] === 'modules') name = parts[2];
      else if (parts.length > 2) name = parts[1];
      else name = parts[1];
    } else {
      name = parts[1];
    }
    if (name !== policyModule) continue;

    covered += value.lines.covered;
    total += value.lines.total;
    files.push({ path: rel, ...value.lines });
  }

  return {
    pct: total === 0 ? 100 : (covered / total) * 100,
    covered,
    total,
    files,
  };
}

const isExcluded = (relPath) =>
  policy.excluded.some((entry) => {
    if (entry.pattern.endsWith('/**')) return relPath.startsWith(entry.pattern.slice(0, -3));
    return relPath === entry.pattern;
  });

const results = [];
const failures = [];

for (const mod of policy.modules) {
  const measured = moduleCoverage(mod.name);
  const entry = {
    name: mod.name,
    tier: mod.tier,
    floor: mod.floor,
    baseline: mod.baseline,
    measured: Number(measured.pct.toFixed(2)),
    knownGap: Boolean(mod.knownGap),
  };

  if (mod.tier === 'excluded') {
    entry.skipped = true;
    results.push(entry);
    continue;
  }

  if (measured.pct < mod.floor - 0.005) {
    entry.status = 'FAIL';
    failures.push(
      `${mod.name}: ${entry.measured}% is below its ${mod.tier} floor of ${mod.floor}% ` +
        `(baseline ${mod.baseline}%)`,
    );
  } else if (measured.pct < mod.baseline - tolerance) {
    // Passes the floor but regressed beyond the noise band against the baseline.
    entry.status = 'REGRESSED';
    failures.push(
      `${mod.name}: coverage fell from ${mod.baseline}% to ${entry.measured}% ` +
        `(more than the ${tolerance}pt tolerance; ratchet floor is ${mod.floor}%)`,
    );
  } else {
    entry.status = 'PASS';
  }
  results.push(entry);
}

const totalMeasured = Number(summary.total.lines.pct.toFixed(2));

// Whole-component ratchet against the committed baseline.
let baselineData = null;
if (existsSync(baselinePath)) {
  baselineData = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const prior = baselineData[component]?.totalLines;
  if (typeof prior === 'number' && totalMeasured < prior - tolerance) {
    failures.push(
      `total ${component} coverage fell from ${prior}% to ${totalMeasured}% ` +
        `(more than the ${tolerance}pt tolerance; global floor ${policy.globalFloor}%)`,
    );
  }
}

if (totalMeasured < policy.globalFloor - 0.005) {
  failures.push(`total ${component} coverage ${totalMeasured}% is below the global floor ${policy.globalFloor}%`);
}

// ---- Critical-path uncovered lines -----------------------------------------

const criticalGlobs = criticalPaths[component] ?? [];

function matchesCritical(relPath) {
  return criticalGlobs.some((glob) => {
    if (glob.endsWith('/**')) return relPath.startsWith(glob.slice(0, -3));
    return relPath === glob;
  });
}

const detailPath = join(dirname(summaryPath), 'coverage-final.json');
const criticalDetail = [];

if (existsSync(detailPath)) {
  const detail = JSON.parse(readFileSync(detailPath, 'utf8'));
  for (const [key, fileData] of Object.entries(detail)) {
    const rel = toRelative(key);
    if (isExcluded(rel) || !matchesCritical(rel)) continue;
    if (declarationFilePatterns.some((re) => re.test(rel))) continue;

    const statementMap = fileData.statementMap ?? {};
    const uncovered = [];
    for (const [id, count] of Object.entries(fileData.s ?? {})) {
      if (count > 0) continue;
      const loc = statementMap[id]?.start?.line;
      if (loc) uncovered.push(loc);
    }
    if (uncovered.length === 0) continue;
    criticalDetail.push({
      path: rel,
      uncoveredLines: [...new Set(uncovered)].sort((a, b) => a - b),
    });
  }
}

criticalDetail.sort((a, b) => b.uncoveredLines.length - a.uncoveredLines.length);

// ---- Report ----------------------------------------------------------------

const tierOrder = { critical: 0, financial: 1, standard: 2, excluded: 3 };
const sorted = [...results].sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || a.name.localeCompare(b.name));

const lines = [];
lines.push(`## ${component} coverage ratchet`);
lines.push('');
lines.push(`Total line coverage: **${totalMeasured}%** (global floor ${policy.globalFloor}%)`);
lines.push('');
lines.push('| Module | Tier | Floor | Baseline | Measured | Status |');
lines.push('| --- | --- | --- | --- | --- | --- |');
for (const r of sorted) {
  const status = r.skipped ? 'excluded' : r.status + (r.knownGap ? ' (known gap)' : '');
  lines.push(
    `| \`${r.name}\` | ${r.tier} | ${r.skipped ? '—' : r.floor + '%'} | ${r.baseline}% | ` +
      `${r.measured}% | ${status} |`,
  );
}

lines.push('');
if (criticalDetail.length > 0) {
  const MAX_FILES = 15;
  const totalUncoveredFiles = criticalDetail.length;
  const totalUncoveredStatements = criticalDetail.reduce((sum, f) => sum + f.uncoveredLines.length, 0);
  lines.push('### Uncovered lines in critical paths');
  lines.push('');
  lines.push(
    `${totalUncoveredStatements} uncovered statements across ${totalUncoveredFiles} critical-path files. ` +
      'Reported, not gated — the ratchet above is the gate.',
  );
  lines.push('');
  for (const file of criticalDetail.slice(0, MAX_FILES)) {
    const shown = file.uncoveredLines.slice(0, 25).join(', ');
    const more = file.uncoveredLines.length > 25 ? ` … (+${file.uncoveredLines.length - 25} more)` : '';
    lines.push(`- \`${file.path}\` — ${file.uncoveredLines.length} uncovered: ${shown}${more}`);
  }
  if (totalUncoveredFiles > MAX_FILES) {
    lines.push(`- …and ${totalUncoveredFiles - MAX_FILES} more files.`);
  }
} else {
  lines.push('### Uncovered lines in critical paths');
  lines.push('');
  lines.push('No uncovered lines detected in critical paths.');
}

const baselineTotal = baselineData?.[component]?.totalLines;
const infraSuspect =
  component === 'backend' &&
  typeof baselineTotal === 'number' &&
  totalMeasured < baselineTotal - tolerance &&
  !process.env.DATABASE_URL;

if (infraSuspect) {
  lines.push('');
  lines.push(
    '> **Heads up:** the backend baseline is measured in CI with Postgres and Redis. ' +
      'This run looks far below it and `DATABASE_URL` is not set, so the database-backed tests ' +
      'probably did not run. Start the services (`docker compose up -d`) before measuring; ' +
      'otherwise the number is not comparable.',
  );
}

lines.push('');
lines.push('Floors and baselines are measured in CI (backend with Postgres/Redis). Raise them by');
lines.push('adding tests; never lower one to make a build pass.');

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join('\n') + '\n', 'utf8');

if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    // Append: the step summary file is shared across all steps in the job.
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n', 'utf8');
  } catch (error) {
    console.warn(`Could not write step summary: ${error.message}`);
  }
}

console.log(lines.join('\n'));

if (failures.length > 0) {
  console.error('');
  for (const failure of failures) console.error(`::error::${failure}`);
  if (baselineData === null) {
    console.error(`::warning::No baseline file at ${baselinePath}; total-coverage ratchet was skipped.`);
  }
  process.exit(1);
}

console.log(`\n::notice::${component} coverage ratchet passed. Report: ${reportPath}`);
