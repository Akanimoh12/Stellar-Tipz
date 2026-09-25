import { logger } from '../common/utils/logger.js';
import { config } from '../config/index.js';
import { getEventsFrom, getLatestLedger } from './sorobanClient.js';
import { getCursorLedger, setCursorLedger } from './cursor.js';
import { projectEvent } from './projections.js';

/** Cursor topic used by the backfill CLI — distinct from the live indexer's topic so backfill never disturbs live indexing. */
export const BACKFILL_CURSOR_TOPIC = 'backfill_tip_events';

export interface BackfillOptions {
  /** Inclusive first ledger to (re)index. Defaults to the stored backfill cursor + 1. */
  from?: number;
  /** Inclusive last ledger to index. Defaults to the current chain head. */
  to?: number;
  /** Only report what would change without writing anything. */
  dryRun?: boolean;
  /** Force a fresh start from `from`, ignoring any stored backfill cursor. */
  force?: boolean;
}

export interface BackfillReport {
  fromLedger: number;
  toLedger: number;
  eventsProjected: number;
  eventsSkipped: number;
  eventsFailed: number;
  dryRun: boolean;
  newCursorLedger: number;
}

/** Events projected per topic, aggregated for the dry-run / summary view. */
export interface BackfillSummary {
  byTopic: Record<string, number>;
  failed: Array<{ txHash: string; topic: string; error: string }>;
}

/**
 * Reindex an explicit ledger range idempotently, without disrupting the live
 * indexer. Uses its own cursor (`backfill_tip_events`), is resumable across
 * runs, reports progress, and supports a dry-run that projects nothing.
 *
 * Because every projection is idempotent (see projections.ts and the unique
 * EventLog key), re-running a range never double-counts.
 */
export async function runBackfill(options: BackfillOptions = {}): Promise<{
  report: BackfillReport;
  summary: BackfillSummary;
}> {
  const storedCursor = options.force
    ? null
    : await getCursorLedger(BACKFILL_CURSOR_TOPIC);

  const chainHead = await getLatestLedger();
  const fromLedger =
    options.from ?? (storedCursor !== null ? storedCursor + 1 : config.indexer.startLedger ?? 1);
  const toLedger = options.to ?? chainHead;

  if (fromLedger > toLedger) {
    logger.info(
      { fromLedger, toLedger, storedCursor },
      'Backfill range has no work (from > to); finishing',
    );
    return {
      report: { fromLedger, toLedger, eventsProjected: 0, eventsSkipped: 0, eventsFailed: 0, dryRun: !!options.dryRun, newCursorLedger: storedCursor ?? toLedger },
      summary: { byTopic: {}, failed: [] },
    };
  }

  logger.info(
    { fromLedger, toLedger, chainHead, dryRun: !!options.dryRun, resumingFrom: storedCursor },
    'Starting backfill',
  );

  const byTopic: Record<string, number> = {};
  const failed: Array<{ txHash: string; topic: string; error: string }> = [];
  let eventsProjected = 0;
  let eventsSkipped = 0;
  let eventsFailed = 0;
  let lastCoveredLedger = fromLedger - 1;
  let pagingToken: string | undefined;

  // Page forward until we've covered at least `toLedger` (the RPC reports the
  // chain head it actually returned, which may exceed our requested window).
  while (lastCoveredLedger < toLedger) {
    const { events, latestLedger } = await getEventsFrom(fromLedger, pagingToken);
    lastCoveredLedger = Math.min(Math.max(lastCoveredLedger, latestLedger), toLedger);

    for (const event of events) {
      if (event.ledger > toLedger) {
        eventsSkipped++;
        continue;
      }
      if (options.dryRun) {
        byTopic[event.topic] = (byTopic[event.topic] ?? 0) + 1;
        eventsProjected++;
        continue;
      }
      try {
        await projectEvent(event);
        byTopic[event.topic] = (byTopic[event.topic] ?? 0) + 1;
        eventsProjected++;
      } catch (err) {
        eventsFailed++;
        failed.push({ txHash: event.txHash, topic: event.topic, error: String(err) });
        logger.error({ err, txHash: event.txHash, topic: event.topic, ledger: event.ledger }, 'Backfill projection failed');
      }
      pagingToken = event.pagingToken;
    }

    if (events.length === 0) break;

    // Progress reporting (roughly every 500 events).
    if (eventsProjected % 500 < events.length && eventsProjected > 0) {
      logger.info(
        { projected: eventsProjected, toLedger, lastCoveredLedger },
        'Backfill progress...',
      );
    }
  }

  // Advance the dedicated backfill cursor so a later run resumes from here.
  // In dry-run nothing was written and we do not move the cursor.
  const newCursorLedger = Math.max(fromLedger - 1, lastCoveredLedger);
  if (!options.dryRun) {
    await setCursorLedger(BACKFILL_CURSOR_TOPIC, newCursorLedger);
  }

  logger.info(
    { eventsProjected, eventsSkipped, eventsFailed, dryRun: !!options.dryRun, newCursorLedger },
    'Backfill complete',
  );

  return {
    report: {
      fromLedger,
      toLedger,
      eventsProjected,
      eventsSkipped,
      eventsFailed,
      dryRun: !!options.dryRun,
      newCursorLedger,
    },
    summary: { byTopic, failed },
  };
}