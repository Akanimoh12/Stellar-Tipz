/**
 * Automated backup restore-verification (issue #1256).
 *
 *   npm run backup:verify
 *
 * Restores a Postgres dump into a disposable scratch database and validates the
 * result (schema version, row counts vs. an optional baseline, spot-check
 * queries), measures the restore duration, writes an RTO report, and — on any
 * failure — exits non-zero and POSTs an alert webhook.
 *
 * Env:
 *   SCRATCH_DATABASE_URL    (required) disposable target — NEVER production
 *   BACKUP_DUMP_PATH        local `.dump` (pg_dump -Fc) file to verify
 *   BACKUP_DUMP_S3_URI      s3://... latest dump (requires `aws` CLI on PATH)
 *   BACKUP_BASELINE_PATH    JSON `{ "<Table>": <count> }` from the last run
 *   BACKUP_ALERT_WEBHOOK_URL  Slack/PagerDuty incoming webhook for failures
 *   GITHUB_STEP_SUMMARY     (CI) file to append the RTO report to
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CORE_TABLES,
  checkRowCounts,
  checkSchemaVersion,
  runSpotChecks,
  formatRtoReport,
  combine,
  type CheckResult,
} from '../src/ops/backup-verify.lib.js';

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[backup-verify] ${name} is required`);
    process.exit(2);
  }
  return v;
}

function psql(url: string, sql: string): string {
  return execFileSync('psql', [url, '-Atqc', sql], { encoding: 'utf8' }).trim();
}

function psqlNumber(url: string, sql: string): number | null {
  const out = psql(url, sql);
  if (out === '' || out.toLowerCase() === 'null') return null;
  const n = Number(out);
  return Number.isFinite(n) ? n : null;
}

async function alert(message: string): Promise<void> {
  const url = process.env.BACKUP_ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `:rotating_light: *Backup verification FAILED*\n${message}` }),
    });
  } catch (err) {
    console.error('[backup-verify] failed to post alert webhook:', err);
  }
}

function resolveDumpPath(): string {
  if (process.env.BACKUP_DUMP_PATH) {
    if (!existsSync(process.env.BACKUP_DUMP_PATH)) {
      console.error(`[backup-verify] BACKUP_DUMP_PATH does not exist: ${process.env.BACKUP_DUMP_PATH}`);
      process.exit(2);
    }
    return process.env.BACKUP_DUMP_PATH;
  }
  const s3 = process.env.BACKUP_DUMP_S3_URI;
  if (!s3) {
    console.error('[backup-verify] set BACKUP_DUMP_PATH or BACKUP_DUMP_S3_URI');
    process.exit(2);
  }
  const dir = mkdtempSync(join(tmpdir(), 'tipz-backup-'));
  const dest = join(dir, 'latest.dump');
  console.log(`[backup-verify] downloading ${s3} ...`);
  execFileSync('aws', ['s3', 'cp', s3, dest], { stdio: 'inherit' });
  return dest;
}

function readBaseline(): Record<string, number> | undefined {
  const p = process.env.BACKUP_BASELINE_PATH;
  if (!p || !existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, number>;
  } catch {
    console.warn('[backup-verify] could not parse BACKUP_BASELINE_PATH; ignoring baseline');
    return undefined;
  }
}

async function main(): Promise<void> {
  const scratchUrl = requireEnv('SCRATCH_DATABASE_URL');
  if (/(^|@)(prod|production)/i.test(scratchUrl)) {
    console.error('[backup-verify] SCRATCH_DATABASE_URL looks like production — refusing');
    process.exit(2);
  }
  const dumpPath = resolveDumpPath();
  const dumpSizeBytes = statSync(dumpPath).size;
  const dumpLabel = dumpPath.split('/').pop() ?? dumpPath;

  const fetchStart = Date.now();
  // (fetch already happened in resolveDumpPath for the S3 case; treat local as 0)
  const fetchMs = process.env.BACKUP_DUMP_S3_URI ? Date.now() - fetchStart : 0;

  console.log(`[backup-verify] restoring ${dumpLabel} into scratch database ...`);
  const restoreStart = Date.now();
  // --clean --if-exists so a re-used scratch DB is reset; --no-owner/--no-acl
  // so it restores regardless of the prod role names.
  execFileSync(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '--no-acl', '--exit-on-error', '--dbname', scratchUrl, dumpPath],
    { stdio: 'inherit' },
  );
  const restoreMs = Date.now() - restoreStart;

  console.log('[backup-verify] validating ...');
  const validateStart = Date.now();

  const restored: Record<string, number> = {};
  for (const table of CORE_TABLES) {
    restored[table] = psqlNumber(scratchUrl, `SELECT COUNT(*) FROM "${table}"`) ?? 0;
  }

  const latestApplied = psql(
    scratchUrl,
    `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`,
  ) || null;
  const localDirs = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  const eventLogMaxLedger = psqlNumber(scratchUrl, `SELECT MAX(ledger) FROM "EventLog"`);
  const cursorLedger = psqlNumber(
    scratchUrl,
    `SELECT "lastLedger" FROM "IndexerCursor" WHERE topic = 'tip_events'`,
  );
  const orphanRefunds = psqlNumber(
    scratchUrl,
    `SELECT COUNT(*) FROM "Refund" r LEFT JOIN "Tip" t ON t.id = r."tipId" WHERE t.id IS NULL`,
  ) ?? 0;
  const orphanTipSenders = psqlNumber(
    scratchUrl,
    `SELECT COUNT(*) FROM "Tip" t LEFT JOIN "User" u ON u."stellarAddress" = t."fromAddress" WHERE u.id IS NULL`,
  ) ?? 0;
  const largestEventLedgerGap = psqlNumber(
    scratchUrl,
    `WITH l AS (SELECT DISTINCT ledger FROM "EventLog" ORDER BY ledger),
          g AS (SELECT ledger - LAG(ledger) OVER (ORDER BY ledger) AS gap FROM l)
     SELECT COALESCE(MAX(gap), 0) FROM g`,
  ) ?? 0;

  const requireNonEmpty = (restored.EventLog ?? 0) > 0; // a real prod dump

  const result: CheckResult = combine(
    checkSchemaVersion(latestApplied, localDirs),
    checkRowCounts({ restored, baseline: readBaseline(), requireNonEmpty }),
    runSpotChecks({
      eventLogMaxLedger,
      cursorLedger,
      orphanRefunds,
      orphanTipSenders,
      largestEventLedgerGap,
    }),
  );
  const validateMs = Date.now() - validateStart;

  const report = formatRtoReport({ dumpLabel, dumpSizeBytes, fetchMs, restoreMs, validateMs });
  console.log(`\n${report}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${report}\n`);
  }

  for (const w of result.warnings) console.warn(`[backup-verify] WARN  ${w}`);

  if (!result.ok) {
    for (const f of result.failures) console.error(`[backup-verify] FAIL  ${f}`);
    await alert(
      `${dumpLabel}\n` + result.failures.map((f) => `• ${f}`).join('\n'),
    );
    process.exit(1);
  }

  console.log('[backup-verify] OK — backup restored and validated.');
}

main().catch(async (err) => {
  console.error('[backup-verify] unexpected error:', err);
  await alert(`unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
