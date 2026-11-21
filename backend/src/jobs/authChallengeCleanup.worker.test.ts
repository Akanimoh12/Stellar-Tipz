import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the auth challenge cleanup worker (issue #1630). The worker calls the
 * real `pruneExpiredChallenges`; Prisma is replaced by an in-memory table whose
 * `deleteMany` applies the same `expiresAt < now` filter Postgres would, so the
 * tests check which rows survive rather than only which arguments were passed.
 */

interface ChallengeRow {
  id: string;
  expiresAt: Date;
}

type Processor = (job: { name: string; data?: unknown }) => Promise<void>;
type FailedHandler = (job: { id?: string } | undefined, err: Error) => void;

const { table, mocks, workers } = vi.hoisted(() => ({
  table: { rows: [] as ChallengeRow[] },
  mocks: {
    deleteMany: vi.fn(),
    scheduleRepeatable: vi.fn(),
    attachDeadLetterHandler: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
  workers: [] as Array<{ queue: string; processor: Processor; handlers: Map<string, FailedHandler> }>,
}));

vi.mock('../db/prisma.js', () => ({
  prisma: { authChallenge: { deleteMany: mocks.deleteMany } },
}));
vi.mock('../db/redis.js', () => ({ redis: { on: vi.fn() }, bullConnection: {} }));
vi.mock('../common/utils/logger.js', () => ({ logger: mocks.logger }));
vi.mock('./scheduler.js', () => ({ scheduleRepeatable: mocks.scheduleRepeatable }));
vi.mock('./deadLetter.js', () => ({ attachDeadLetterHandler: mocks.attachDeadLetterHandler }));
vi.mock('./authChallengeCleanup.queue.js', () => ({
  AUTH_CHALLENGE_CLEANUP_QUEUE: 'auth-challenge-cleanup',
  getAuthChallengeCleanupQueue: () => ({ name: 'auth-challenge-cleanup' }),
}));
vi.mock('bullmq', () => ({
  Worker: class {
    handlers = new Map<string, FailedHandler>();
    constructor(queue: string, processor: Processor) {
      workers.push({ queue, processor, handlers: this.handlers });
    }
    on(event: string, handler: FailedHandler) {
      this.handlers.set(event, handler);
      return this;
    }
  },
}));

import {
  cleanupExpiredChallenges,
  createAuthChallengeCleanupWorker,
  scheduleAuthChallengeCleanup,
} from './authChallengeCleanup.worker.js';
import { config } from '../config/index.js';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

/** Emulates `prisma.authChallenge.deleteMany({ where: { expiresAt: { lt } } })`. */
function deleteExpired(args: { where: { expiresAt: { lt: Date } } }) {
  const cutoff = args.where.expiresAt.lt.getTime();
  const before = table.rows.length;
  table.rows = table.rows.filter((row) => !(row.expiresAt.getTime() < cutoff));
  return Promise.resolve({ count: before - table.rows.length });
}

const remainingIds = () => table.rows.map((row) => row.id).sort();

describe('cleanupExpiredChallenges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mocks.deleteMany.mockImplementation(deleteExpired);
    table.rows = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes expired challenges and keeps fresh ones', async () => {
    table.rows = [
      { id: 'expired-long-ago', expiresAt: minutes(-60) },
      { id: 'expired-just-now', expiresAt: minutes(-1) },
      { id: 'fresh-soon', expiresAt: minutes(1) },
      { id: 'fresh-later', expiresAt: minutes(5) },
    ];

    const result = await cleanupExpiredChallenges();

    expect(result).toEqual({ pruned: 2 });
    expect(remainingIds()).toEqual(['fresh-later', 'fresh-soon']);
  });

  it('uses the current time as the cutoff', async () => {
    await cleanupExpiredChallenges();

    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: NOW } } });
  });

  it('keeps a challenge that expires exactly now (strictly-less-than cutoff)', async () => {
    table.rows = [{ id: 'boundary', expiresAt: NOW }];

    const result = await cleanupExpiredChallenges();

    expect(result).toEqual({ pruned: 0 });
    expect(remainingIds()).toEqual(['boundary']);
  });

  it('keeps every row and reports zero when nothing has expired', async () => {
    table.rows = [
      { id: 'a', expiresAt: minutes(2) },
      { id: 'b', expiresAt: minutes(3) },
    ];

    const result = await cleanupExpiredChallenges();

    expect(result).toEqual({ pruned: 0 });
    expect(remainingIds()).toEqual(['a', 'b']);
  });

  it('is idempotent: a second run prunes nothing more', async () => {
    table.rows = [
      { id: 'expired', expiresAt: minutes(-10) },
      { id: 'fresh', expiresAt: minutes(10) },
    ];

    expect(await cleanupExpiredChallenges()).toEqual({ pruned: 1 });
    expect(await cleanupExpiredChallenges()).toEqual({ pruned: 0 });
    expect(remainingIds()).toEqual(['fresh']);
  });

  it('propagates database errors so BullMQ can retry the job', async () => {
    mocks.deleteMany.mockRejectedValueOnce(new Error('connection lost'));

    await expect(cleanupExpiredChallenges()).rejects.toThrow('connection lost');
  });
});

describe('createAuthChallengeCleanupWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mocks.deleteMany.mockImplementation(deleteExpired);
    table.rows = [];
    workers.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('listens on the cleanup queue and attaches the dead-letter handler', () => {
    const worker = createAuthChallengeCleanupWorker();

    expect(workers).toHaveLength(1);
    expect(workers[0].queue).toBe('auth-challenge-cleanup');
    expect(mocks.attachDeadLetterHandler).toHaveBeenCalledWith(worker, 'auth-challenge-cleanup');
  });

  it('prunes expired challenges when a job runs and logs the count', async () => {
    table.rows = [
      { id: 'expired', expiresAt: minutes(-5) },
      { id: 'fresh', expiresAt: minutes(5) },
    ];
    createAuthChallengeCleanupWorker();

    await workers[0].processor({ name: 'cleanup' });

    expect(remainingIds()).toEqual(['fresh']);
    expect(mocks.logger.info).toHaveBeenCalledWith({ pruned: 1 }, 'Auth challenge cleanup complete');
  });

  it('does not log a completion line when nothing was pruned', async () => {
    table.rows = [{ id: 'fresh', expiresAt: minutes(5) }];
    createAuthChallengeCleanupWorker();

    await workers[0].processor({ name: 'cleanup' });

    expect(remainingIds()).toEqual(['fresh']);
    expect(mocks.logger.info).not.toHaveBeenCalledWith(expect.anything(), 'Auth challenge cleanup complete');
  });

  it('rejects the job when pruning fails and logs the failure event', async () => {
    mocks.deleteMany.mockRejectedValueOnce(new Error('db down'));
    createAuthChallengeCleanupWorker();

    await expect(workers[0].processor({ name: 'cleanup' })).rejects.toThrow('db down');

    const err = new Error('db down');
    workers[0].handlers.get('failed')?.({ id: 'job-1' }, err);
    expect(mocks.logger.error).toHaveBeenCalledWith({ err, jobId: 'job-1' }, 'Auth challenge cleanup job failed');
  });
});

describe('scheduleAuthChallengeCleanup', () => {
  it('registers a repeatable cleanup job on the configured cron', async () => {
    vi.clearAllMocks();

    await scheduleAuthChallengeCleanup();

    expect(mocks.scheduleRepeatable).toHaveBeenCalledWith({
      queue: { name: 'auth-challenge-cleanup' },
      name: 'cleanup',
      pattern: config.auth.challengeCleanupCron,
    });
  });
});
