import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { inspectMigrationSql } from './migration-safety.mjs';

const largeTableRowThreshold = 100_000;
const largeTableBytesThreshold = 100 * 1024 * 1024;

function changedMigrationFiles() {
  const base = process.env.GITHUB_BASE_SHA || 'HEAD~1';
  const head = process.env.GITHUB_SHA || 'HEAD';
  const output = execFileSync('git', ['diff', '--name-only', `${base}...${head}`, '--', 'backend/prisma/migrations'], { encoding: 'utf8' });
  return output.split(/\r?\n/).filter((file) => file.endsWith('.sql'));
}

function tableNames(sql) {
  return [...sql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?([A-Za-z0-9_]+)["`]?/gi)].map((match) => match[1]);
}

function estimateLockRisk(files) {
  if (!process.env.DATABASE_URL) return [];
  const databaseUrl = new URL(process.env.DATABASE_URL);
  databaseUrl.search = '';
  const tables = new Set();
  for (const file of files) {
    const sql = readFileSync(file, 'utf8');
    for (const table of tableNames(sql)) tables.add(table);
  }

  const findings = [];
  for (const table of tables) {
    try {
      const query = `SELECT COALESCE(reltuples, 0)::bigint, pg_total_relation_size(oid)::bigint FROM pg_class WHERE relname = '${table.replaceAll("'", "''")}'`;
      const result = execFileSync('psql', [databaseUrl.toString(), '-At', '-c', query], { encoding: 'utf8' }).trim();
      if (!result) continue;
      const [rows, bytes] = result.split('|').map(Number);
      if (rows >= largeTableRowThreshold || bytes >= largeTableBytesThreshold) {
        const estimatedSeconds = Math.max(1, Math.ceil(rows / 1_000_000));
        findings.push({ table, rows, bytes, estimatedSeconds });
      }
    } catch {
      console.warn(`Could not inspect PostgreSQL statistics for ${table}; lock estimate skipped.`);
    }
  }
  return findings;
}

const files = changedMigrationFiles();
const destructive = files.flatMap((file) => inspectMigrationSql(readFileSync(file, 'utf8'), file));
const lockRisks = estimateLockRisk(files);
const rollbackGaps = destructive.filter(({ fileName }) => {
  const downFile = fileName.replace(/migration\.sql$/, 'down.sql');
  const irreversibleFile = fileName.replace(/migration\.sql$/, 'irreversible');
  return !existsSync(downFile) && !existsSync(irreversibleFile);
});

for (const finding of destructive) {
  console.error(`Destructive migration: ${finding.fileName} (${finding.kind})`);
}
for (const risk of lockRisks) {
  console.warn(`Large-table lock risk: ${risk.table} (~${risk.rows} rows, estimated lock time ${risk.estimatedSeconds}s)`);
}
for (const finding of rollbackGaps) {
  console.error(`Destructive migration has no rollback metadata: ${finding.fileName} (add down.sql or an irreversible marker).`);
}

if ((destructive.length > 0 && process.env.MIGRATION_ACKNOWLEDGED !== 'true') || rollbackGaps.length > 0) {
  console.error('Destructive migrations require the migration-approved label or a /migration-ack comment on the PR.');
  process.exit(1);
}

if (destructive.length > 0) console.log('Destructive migration acknowledgement found.');
if (files.length === 0) console.log('No migration files changed.');