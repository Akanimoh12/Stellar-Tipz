import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { CursorFencedError, getCursorLedger, setCursorLedger } from './cursor.js';
import { getEventsFrom, getLatestLedger, getLedgerHash } from './sorobanClient.js';
import { projectEvent } from './projections.js';
import { recordIndexerTick, noteIndexerError, noteProcessedLedger } from './monitor.js';
import { checkAndHandleReorg } from './reorg.js';
import { recordCheckpoint } from './ledger-checkpoint.store.js';
import { LeadershipLostError, type LeadershipGuard } from './leader.js';

/** Cursor topic under which tip-event indexing progress is tracked. */
const CURSOR_TOPIC = 'tip_events';

/** Safety cap on pages fetched in a single tick to bound work per poll. */
const MAX_PAGES_PER_TICK = 50;

export interface IndexerHandle {
  stop: () => Promise<void>;
}

export interface StartIndexerOptions {
  /** When set, only ticks while this instance holds the leader lease (issue #1263). */
  leader?: LeadershipGuard & { isLeader(): boolean };
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
 *
 * With a leadership `guard` (issue #1263) the lease is checked before every
 * commit — the reorg rollback, each projection, and the cursor advance — and
 * the rollback and cursor writes carry the leader's fencing epoch, so a leader
 * that was paused past its lease can never commit on resume. Projections are
 * idempotent, so the new leader re-reading from the persisted cursor neither
 * skips nor duplicates ledgers.
 */
export async function pollOnce(guard?: LeadershipGuard): Promise<void> {
  const fence = await guard?.assertLeadership();
  if (await checkAndHandleReorg(CURSOR_TOPIC, fence)) {
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
      guard?.assertLocalLease();
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
  const commitFence = await guard?.assertLeadership();
  if (commitFence !== fence) {
    // Leadership was lost and re-acquired mid-tick; another leader may have run in between.
    throw new LeadershipLostError('Leadership changed during the tick; cursor not advanced');
  }
  await setCursorLedger(CURSOR_TOPIC, nextCursor, commitFence);
  noteProcessedLedger(nextCursor);
  recordIndexerTick(processed);

  // Record the hash of the ledger we advanced to, for reorg detection (#1257).
  try {
    const hash = await getLedgerHash(nextCursor);
    if (hash) {
      guard?.assertLocalLease();
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
 * keeps running. With a `leader`, ticks are skipped while this instance is on
 * standby.
 */
export function startIndexer(options: StartIndexerOptions = {}): IndexerHandle {
  const { leader } = options;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let activePoll: Promise<void> | undefined;

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => void run(), delayMs);
  };

  const run = async (): Promise<void> => {
    if (stopped) return;
    if (leader && !leader.isLeader()) {
      schedule(config.indexer.pollIntervalMs);
      return;
    }
    const poll = pollOnce(leader);
    activePoll = poll;
    try {
      await poll;
    } catch (err) {
      if (err instanceof LeadershipLostError || err instanceof CursorFencedError) {
        logger.warn({ err }, 'Indexer tick abandoned: this instance is no longer the leader');
      } else {
        logger.error({ err }, 'Indexer poll failed');
      }
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
