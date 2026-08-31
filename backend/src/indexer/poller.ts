import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { getCursorLedger, setCursorLedger } from './cursor.js';
import { getEventsFrom, getLatestLedger, getLedgerHash } from './sorobanClient.js';
import { projectEvent } from './projections.js';
import { recordIndexerTick, noteIndexerError, noteProcessedLedger } from './monitor.js';
import { checkAndHandleReorg } from './reorg.js';
import { recordCheckpoint } from './ledger-checkpoint.store.js';

/** Cursor topic under which tip-event indexing progress is tracked. */
const CURSOR_TOPIC = 'tip_events';

/** Safety cap on pages fetched in a single tick to bound work per poll. */
const MAX_PAGES_PER_TICK = 50;

export interface IndexerHandle {
  stop: () => Promise<void>;
}

/**
 * Decide which ledger to read from next: resume after the stored cursor, else
 * the configured start ledger, else the current chain head.
 */
async function resolveStartLedger(): Promise<number> {
  const cursor = await getCursorLedger(CURSOR_TOPIC);
  if (cursor !== null) return cursor + 1;
  if (config.indexer.startLedger) return config.indexer.startLedger;
  // No cursor, no configured start: begin at the *finalized* head so the first
  // tick doesn't try to process un-finalized ledgers (issue #1257).
  const head = await getLatestLedger();
  return Math.max(1, head - Math.max(0, config.indexer.finalityDepth));
}

/**
 * Run a single poll:
 *   0. Detect & recover from a chain reorg (issue #1257) — if one is handled,
 *      skip the rest of this tick; the next one reprocesses from the fork.
 *   1. Read events from the cursor ledger forward, projecting each idempotently
 *      but only up to the finality ceiling (`head - INDEXER_FINALITY_DEPTH`)
 *      so an event that a later reorg drops was never projected.
 *   2. Advance the cursor to the finalized ledger we covered and record its
 *      ledger hash as a reorg-detection checkpoint.
 * On failure, throws without advancing the cursor to keep replay safe.
 */
export async function pollOnce(): Promise<void> {
  if (await checkAndHandleReorg(CURSOR_TOPIC)) {
    return;
  }

  const startLedger = await resolveStartLedger();
  const head = await getLatestLedger();
  const finalityDepth = Math.max(0, config.indexer.finalityDepth);
  const finalityCeiling = head - finalityDepth;

  if (finalityCeiling < startLedger) {
    // Nothing has finalized past the cursor yet — wait for the buffer to fill.
    return;
  }

  let pagingToken: string | undefined;
  let processed = 0;
  let skippedUnfinalized = 0;
  let anyFailed = false;
  let maxFinalizedLedgerSeen = startLedger - 1;

  for (let page = 0; page < MAX_PAGES_PER_TICK; page++) {
    const { events } = await getEventsFrom(startLedger, pagingToken);

    for (const event of events) {
      if (event.ledger > finalityCeiling) {
        // Past the confirmation buffer — leave it for a later tick. Do NOT
        // advance pagingToken past it, so it is re-read once finalized.
        skippedUnfinalized++;
        continue;
      }
      try {
        await projectEvent(event);
        pagingToken = event.pagingToken;
        processed++;
        maxFinalizedLedgerSeen = Math.max(maxFinalizedLedgerSeen, event.ledger);
        noteProcessedLedger(event.ledger);
      } catch (err) {
        logger.error({ err, txHash: event.txHash, topic: event.topic }, 'Failed to project event');
        anyFailed = true;
        noteIndexerError();
      }
    }

    // Stop once the page contained only unfinalized events (or none).
    if (events.length === 0 || (skippedUnfinalized > 0 && processed === 0 && events.every((e) => e.ledger > finalityCeiling))) {
      break;
    }
    if (events.length === 0) break;
  }

  if (anyFailed) {
    throw new Error('One or more events failed to project; cursor not advanced');
  }

  // Advance only to the finality ceiling — never past what has finalized.
  const nextCursor = Math.max(maxFinalizedLedgerSeen, finalityCeiling);
  await setCursorLedger(CURSOR_TOPIC, nextCursor);
  noteProcessedLedger(nextCursor);
  recordIndexerTick(processed);

  // Record the hash of the ledger we advanced to, for reorg detection (#1257).
  try {
    const hash = await getLedgerHash(nextCursor);
    if (hash) {
      await recordCheckpoint(CURSOR_TOPIC, nextCursor, hash);
    }
  } catch (err) {
    // A missing checkpoint only weakens reorg detection for one ledger — never
    // fail the tick over it.
    logger.warn({ err, ledger: nextCursor }, 'Could not record ledger-hash checkpoint');
  }

  if (processed > 0 || skippedUnfinalized > 0) {
    logger.info(
      { processed, skippedUnfinalized, fromLedger: startLedger, toLedger: nextCursor, head },
      'Indexer projected finalized events',
    );
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
  let activePoll: Promise<void> | undefined;

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => void run(), delayMs);
  };

  const run = async (): Promise<void> => {
    if (stopped) return;
    const poll = pollOnce();
    activePoll = poll;
    try {
      await poll;
    } catch (err) {
      logger.error({ err }, 'Indexer poll failed');
    } finally {
      if (activePoll === poll) activePoll = undefined;
      schedule(config.indexer.pollIntervalMs);
    }
  };

  schedule(0);
  logger.info(
    { intervalMs: config.indexer.pollIntervalMs, finalityDepth: config.indexer.finalityDepth },
    'Indexer poll loop started',
  );

  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      logger.info('Indexer poll loop stopped');
      await activePoll;
    },
  };
}
