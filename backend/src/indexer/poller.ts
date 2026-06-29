import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { getCursorLedger, setCursorLedger } from './cursor.js';
import { getEventsFrom, getLatestLedger } from './sorobanClient.js';
import { projectEvent } from './projections.js';

/** Cursor topic under which tip-event indexing progress is tracked. */
const CURSOR_TOPIC = 'tip_events';

/** Safety cap on pages fetched in a single tick to bound work per poll. */
const MAX_PAGES_PER_TICK = 50;

export interface IndexerHandle {
  stop: () => void;
}

/**
 * Decide which ledger to read from next: resume after the stored cursor, else
 * the configured start ledger, else the current chain head.
 */
async function resolveStartLedger(): Promise<number> {
  const cursor = await getCursorLedger(CURSOR_TOPIC);
  if (cursor !== null) return cursor + 1;
  if (config.indexer.startLedger) return config.indexer.startLedger;
  return getLatestLedger();
}

/**
 * Run a single poll: read events from the cursor ledger forward, project each
 * idempotently, then advance the cursor to the ledgers we covered.
 * On failure, throws without advancing cursor to ensure replay safety.
 */
export async function pollOnce(): Promise<void> {
  const startLedger = await resolveStartLedger();

  let pagingToken: string | undefined;
  let latestLedger = startLedger;
  let processed = 0;
  let anyFailed = false;

  for (let page = 0; page < MAX_PAGES_PER_TICK; page++) {
    const { events, latestLedger: head } = await getEventsFrom(startLedger, pagingToken);
    latestLedger = head;

    for (const event of events) {
      try {
        await projectEvent(event);
        pagingToken = event.pagingToken;
        processed++;
      } catch (err) {
        logger.error({ err, txHash: event.txHash, topic: event.topic }, 'Failed to project event');
        anyFailed = true;
      }
    }

    if (events.length === 0) break;
  }

  if (anyFailed) {
    throw new Error('One or more events failed to project; cursor not advanced');
  }

  // Advance the cursor only after all events processed successfully.
  const nextCursor = Math.max(startLedger - 1, latestLedger);
  await setCursorLedger(CURSOR_TOPIC, nextCursor);

  if (processed > 0) {
    logger.info({ processed, fromLedger: startLedger, toLedger: nextCursor }, 'Indexer projected events');
  }
}

/**
 * Start the indexer poll loop. Returns a handle whose `stop()` halts further
 * polling (e.g. on graceful shutdown). Errors in a tick are logged and the loop
 * keeps running.
 */
export function startIndexer(): IndexerHandle {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => void run(), delayMs);
  };

  const run = async (): Promise<void> => {
    if (stopped) return;
    try {
      await pollOnce();
    } catch (err) {
      logger.error({ err }, 'Indexer poll failed');
    } finally {
      schedule(config.indexer.pollIntervalMs);
    }
  };

  schedule(0);
  logger.info({ intervalMs: config.indexer.pollIntervalMs }, 'Indexer poll loop started');

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      logger.info('Indexer poll loop stopped');
    },
  };
}