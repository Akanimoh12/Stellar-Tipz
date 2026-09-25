import { logger } from '../common/utils/logger.js';
import { closeAll, registerClosable } from '../common/utils/lifecycle.js';
import { prisma } from '../db/prisma.js';
import { runBackfill, type BackfillOptions } from './backfill.js';

/** Parse `--key value` / `--flag` args from the CLI into a BackfillOptions. */
function parseArgs(argv: string[]): BackfillOptions {
  const opts: BackfillOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--from' || arg === '-f') {
      opts.from = Number(argv[++i]);
    } else if (arg === '--to' || arg === '-t') {
      opts.to = Number(argv[++i]);
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--force') {
      opts.force = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
    }
  }
  return opts;
}

function printUsage(): void {
  console.log(`
Usage: npm run indexer:backfill -- [options]

Reindex a range of Stellar ledgers idempotently through the projection pipeline
without disrupting the live indexer (uses a dedicated backfill cursor).

Options:
  --from, -f <ledger>   Inclusive first ledger to index (default: stored backfill cursor + 1)
  --to, -t <ledger>     Inclusive last ledger to index     (default: current chain head)
  --dry-run             Report what would change without writing anything
  --force               Ignore the stored backfill cursor and start fresh from --from
  --help, -h            Show this help
`);
  process.exit(0);
}

/**
 * Backfill CLI bootstrap. Runs as a standalone process so it never touches the
 * live indexer's cursor or lifecycle. Aligns with the acceptance criteria in
 * issue #1259: explicit range, non-disruptive, resumable, progress reporting
 * and a dry-run mode.
 */
async function main(): Promise<void> {
  registerClosable({ name: 'Prisma', close: () => prisma.$disconnect() });

  const opts = parseArgs(process.argv.slice(2));
  const started = Date.now();

  const { report, summary } = await runBackfill(opts);

  const badCount = report.eventsFailed;

  console.log('\n===== Backfill Summary =====');
  console.log(`  range:         ${report.fromLedger}..${report.toLedger}`);
  console.log(`  mode:          ${report.dryRun ? 'dry-run (nothing written)' : 'normal'}`);
  console.log(`  events seen:   ${report.eventsProjected}`);
  console.log(`  skipped:       ${report.eventsSkipped}`);
  console.log(`  failed:        ${report.eventsFailed}`);
  console.log(`  new cursor:    ${report.newCursorLedger}`);
  console.log(`  duration:      ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (Object.keys(summary.byTopic).length > 0) {
    console.log('\n  by topic:');
    for (const [topic, count] of Object.entries(summary.byTopic).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${topic}: ${count}`);
    }
  }
  if (summary.failed.length > 0) {
    console.log('\n  failures:');
    for (const f of summary.failed.slice(0, 20)) {
      console.log(`    ${f.topic} @ ${f.txHash}: ${f.error}`);
    }
  }
  console.log('===========================');

  if (!opts.dryRun && report.eventsFailed > 0) {
    logger.warn(
      { failed: report.eventsFailed, projectionFailures: badCount },
      'Backfill finished with projection failures (cursor still advanced; rerun to retry)',
    );
  }

  await closeAll();
}

// Only run when this file is executed directly (not when imported).
const isDirectRun =
  typeof process.argv[1] === 'string' && process.argv[1].endsWith('backfill.main.ts');

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Fatal backfill error');
    process.exit(1);
  });
}

export { parseArgs };