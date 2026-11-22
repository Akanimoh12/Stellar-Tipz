import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the payout worker (issue #1633). The worker runs the real
 * `processDuePayouts` / `attemptPayout` logic from payouts.service; only the
 * database, the on-chain submission, notifications and metrics are mocked. This
 * covers the three outcomes of a sweep: a successful payout, a retry with
 * exponential backoff, and a permanent failure that pauses the schedule.
 */

type Processor = (job: { name: string; data?: unknown }) => Promise<void>;
type FailedHandler = (job: { id?: string } | undefined, err: Error) => void;

const { PAYOUTS, mocks, workers } = vi.hoisted(() => ({
  /** Payout settings injected into `config.payouts` for these tests. */
  PAYOUTS: {
    scheduleCron: '*/30 * * * *',
    maxAttempts: 3,
    backoffBaseSeconds: 60,
    minAmountStroops: 10_000_000n,
  },
  mocks: {
    findMany: vi.fn(),
    update: vi.fn(),
    tipAggregate: vi.fn(),
    withdrawalAggregate: vi.fn(),
    submit: vi.fn(),
    createNotification: vi.fn(),
    observeWithdrawal: vi.fn(),
    scheduleRepeatable: vi.fn(),
    attachDeadLetterHandler: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
  workers: [] as Array<{ queue: string; processor: Processor; handlers: Map<string, FailedHandler> }>,
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    payoutSchedule: { findMany: mocks.findMany, update: mocks.update },
    tip: { aggregate: mocks.tipAggregate },
    withdrawal: { aggregate: mocks.withdrawalAggregate },
  },
}));
vi.mock('../db/redis.js', () => ({ redis: { on: vi.fn() }, bullConnection: {} }));
vi.mock('../config/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/index.js')>();
  return { ...actual, config: { ...actual.config, payouts: PAYOUTS } };
});
vi.mock('../common/utils/logger.js', () => ({ logger: mocks.logger }));
vi.mock('../modules/withdrawals/payoutSubmission.js', () => ({ submitScheduledWithdrawal: mocks.submit }));
vi.mock('../modules/notifications/notifications.service.js', () => ({
  createNotification: mocks.createNotification,
}));
vi.mock('../common/observability/businessMetrics.js', () => ({ observeWithdrawal: mocks.observeWithdrawal }));
vi.mock('./scheduler.js', () => ({ scheduleRepeatable: mocks.scheduleRepeatable }));
vi.mock('./deadLetter.js', () => ({ attachDeadLetterHandler: mocks.attachDeadLetterHandler }));
vi.mock('./payout.queue.js', () => ({
  PAYOUT_QUEUE: 'payout',
  getPayoutQueue: () => ({ name: 'payout' }),
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

import { createPayoutWorker, runPayoutSweep, schedulePayouts } from './payout.worker.js';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;

function schedule(overrides: Partial<{ id: string; userId: string; consecutiveFailures: number; cadence: string }> = {}) {
  const userId = overrides.userId ?? 'user-1';
  return {
    id: overrides.id ?? 'sched-1',
    userId,
    thresholdStroops: 50_000_000n,
    cadence: overrides.cadence ?? 'DAILY',
    consecutiveFailures: overrides.consecutiveFailures ?? 0,
    user: { id: userId, stellarAddress: `G${userId.toUpperCase()}` },
  };
}

/** Sets the creator's withdrawable balance (confirmed tips minus withdrawals). */
function withBalance(received: bigint, withdrawn = 0n) {
  mocks.tipAggregate.mockResolvedValue({ _sum: { amountStroops: received } });
  mocks.withdrawalAggregate.mockResolvedValue({ _sum: { amount: withdrawn } });
}

const updateFor = (id: string) => mocks.update.mock.calls.find(([args]) => args.where.id === id)?.[0];

describe('payout worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    workers.length = 0;
    mocks.update.mockResolvedValue({});
    mocks.createNotification.mockResolvedValue({});
    withBalance(100_000_000n);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('successful payout', () => {
    it('withdraws the full balance, resets failures and advances by the cadence', async () => {
      mocks.findMany.mockResolvedValue([schedule({ consecutiveFailures: 2 })]);
      mocks.submit.mockResolvedValue({ txHash: 'tx-1', netAmountStroops: '97000000' });

      const result = await runPayoutSweep();

      expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
      expect(mocks.submit).toHaveBeenCalledWith('GUSER-1', 100_000_000n);
      expect(updateFor('sched-1')).toEqual({
        where: { id: 'sched-1' },
        data: {
          nextRunAt: new Date(NOW.getTime() + DAY),
          lastRunAt: NOW,
          lastStatus: 'SUCCESS',
          consecutiveFailures: 0,
        },
      });
      expect(mocks.observeWithdrawal).toHaveBeenCalledWith('scheduled_payout', 'success', '97000000');
      expect(mocks.createNotification).not.toHaveBeenCalled();
    });

    it('pays out only the balance not already withdrawn', async () => {
      withBalance(100_000_000n, 30_000_000n);
      mocks.findMany.mockResolvedValue([schedule()]);
      mocks.submit.mockResolvedValue({ txHash: 'tx-2', netAmountStroops: '68000000' });

      await runPayoutSweep();

      expect(mocks.submit).toHaveBeenCalledWith('GUSER-1', 70_000_000n);
    });

    it('skips without counting a failure when the balance is below the threshold', async () => {
      withBalance(10_000_000n);
      mocks.findMany.mockResolvedValue([schedule({ consecutiveFailures: 1 })]);

      const result = await runPayoutSweep();

      expect(result).toEqual({ processed: 1, succeeded: 0, failed: 0, skipped: 1 });
      expect(mocks.submit).not.toHaveBeenCalled();
      expect(updateFor('sched-1').data).toEqual({
        nextRunAt: new Date(NOW.getTime() + DAY),
        lastRunAt: NOW,
        lastStatus: 'SKIPPED',
      });
      expect(mocks.observeWithdrawal).toHaveBeenCalledWith('scheduled_payout', 'skipped');
    });

    it('returns zero counts when no schedule is due', async () => {
      mocks.findMany.mockResolvedValue([]);

      expect(await runPayoutSweep()).toEqual({ processed: 0, succeeded: 0, failed: 0, skipped: 0 });
      expect(mocks.submit).not.toHaveBeenCalled();
    });
  });

  describe('retry path', () => {
    it('records the first failure and retries after the base backoff', async () => {
      mocks.findMany.mockResolvedValue([schedule()]);
      mocks.submit.mockRejectedValue(new Error('rpc timeout'));

      const result = await runPayoutSweep();

      expect(result).toEqual({ processed: 1, succeeded: 0, failed: 1, skipped: 0 });
      expect(updateFor('sched-1').data).toEqual({
        nextRunAt: new Date(NOW.getTime() + 60 * SECOND),
        lastRunAt: NOW,
        lastStatus: 'FAILED',
        consecutiveFailures: 1,
        paused: false,
      });
      expect(mocks.observeWithdrawal).toHaveBeenCalledWith('scheduled_payout', 'system_error');
      expect(mocks.createNotification).not.toHaveBeenCalled();
    });

    it('doubles the backoff on each further failure while attempts remain', async () => {
      mocks.findMany.mockResolvedValue([schedule({ consecutiveFailures: 1 })]);
      mocks.submit.mockRejectedValue(new Error('rpc timeout'));

      await runPayoutSweep();

      expect(updateFor('sched-1').data).toMatchObject({
        nextRunAt: new Date(NOW.getTime() + 120 * SECOND),
        consecutiveFailures: 2,
        paused: false,
      });
    });

    it('succeeds on a later sweep and clears the failure count', async () => {
      mocks.findMany.mockResolvedValueOnce([schedule()]).mockResolvedValueOnce([schedule({ consecutiveFailures: 1 })]);
      mocks.submit
        .mockRejectedValueOnce(new Error('rpc timeout'))
        .mockResolvedValueOnce({ txHash: 'tx-retry', netAmountStroops: '97000000' });

      expect(await runPayoutSweep()).toMatchObject({ failed: 1, succeeded: 0 });
      expect(await runPayoutSweep()).toMatchObject({ failed: 0, succeeded: 1 });

      const [, second] = mocks.update.mock.calls.map(([args]) => args.data);
      expect(second).toMatchObject({ lastStatus: 'SUCCESS', consecutiveFailures: 0 });
    });
  });

  describe('permanent failure path', () => {
    it('pauses the schedule and notifies the creator once attempts are exhausted', async () => {
      mocks.findMany.mockResolvedValue([schedule({ consecutiveFailures: PAYOUTS.maxAttempts - 1 })]);
      mocks.submit.mockRejectedValue(new Error('keeper key missing'));

      const result = await runPayoutSweep();

      expect(result).toEqual({ processed: 1, succeeded: 0, failed: 1, skipped: 0 });
      expect(updateFor('sched-1').data).toEqual({
        nextRunAt: new Date(NOW.getTime() + 30 * DAY),
        lastRunAt: NOW,
        lastStatus: 'FAILED',
        consecutiveFailures: PAYOUTS.maxAttempts,
        paused: true,
      });
      expect(mocks.createNotification).toHaveBeenCalledWith('user-1', 'payout_failed', {
        reason: 'keeper key missing',
        consecutiveFailures: PAYOUTS.maxAttempts,
      });
    });

    it('still completes the sweep when the failure notification cannot be sent', async () => {
      mocks.findMany.mockResolvedValue([schedule({ consecutiveFailures: PAYOUTS.maxAttempts - 1 })]);
      mocks.submit.mockRejectedValue(new Error('keeper key missing'));
      mocks.createNotification.mockRejectedValue(new Error('notifications down'));

      const result = await runPayoutSweep();

      expect(result).toMatchObject({ failed: 1 });
      expect(updateFor('sched-1').data).toMatchObject({ paused: true });
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        'Failed to notify payout failure',
      );
    });

    it('counts a crashed attempt as failed and keeps processing other creators', async () => {
      mocks.findMany.mockResolvedValue([
        schedule({ id: 'sched-crash', userId: 'user-a' }),
        schedule({ id: 'sched-ok', userId: 'user-b' }),
      ]);
      mocks.tipAggregate
        .mockRejectedValueOnce(new Error('db read failed'))
        .mockResolvedValue({ _sum: { amountStroops: 100_000_000n } });
      mocks.submit.mockResolvedValue({ txHash: 'tx-b', netAmountStroops: '97000000' });

      const result = await runPayoutSweep();

      expect(result).toEqual({ processed: 2, succeeded: 1, failed: 1, skipped: 0 });
      expect(mocks.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: 'sched-crash' }),
        'Payout attempt crashed',
      );
      expect(mocks.submit).toHaveBeenCalledWith('GUSER-B', 100_000_000n);
    });

    it('handles a mixed sweep of success, retry and permanent failure', async () => {
      mocks.findMany.mockResolvedValue([
        schedule({ id: 'ok', userId: 'u-ok' }),
        schedule({ id: 'retry', userId: 'u-retry' }),
        schedule({ id: 'dead', userId: 'u-dead', consecutiveFailures: PAYOUTS.maxAttempts - 1 }),
      ]);
      mocks.submit.mockImplementation(async (address: string) => {
        if (address === 'GU-OK') return { txHash: 'tx-ok', netAmountStroops: '97000000' };
        throw new Error(`submit failed for ${address}`);
      });

      const result = await runPayoutSweep();

      expect(result).toEqual({ processed: 3, succeeded: 1, failed: 2, skipped: 0 });
      expect(updateFor('ok').data).toMatchObject({ lastStatus: 'SUCCESS' });
      expect(updateFor('retry').data).toMatchObject({ lastStatus: 'FAILED', paused: false, consecutiveFailures: 1 });
      expect(updateFor('dead').data).toMatchObject({ lastStatus: 'FAILED', paused: true });
      expect(mocks.createNotification).toHaveBeenCalledTimes(1);
      expect(mocks.createNotification).toHaveBeenCalledWith('u-dead', 'payout_failed', expect.any(Object));
    });
  });

  describe('BullMQ wiring', () => {
    it('listens on the payout queue and attaches the dead-letter handler', () => {
      const worker = createPayoutWorker();

      expect(workers).toHaveLength(1);
      expect(workers[0].queue).toBe('payout');
      expect(mocks.attachDeadLetterHandler).toHaveBeenCalledWith(worker, 'payout');
    });

    it('runs a sweep for each job and logs the result', async () => {
      mocks.findMany.mockResolvedValue([schedule()]);
      mocks.submit.mockResolvedValue({ txHash: 'tx-1', netAmountStroops: '97000000' });
      createPayoutWorker();

      await workers[0].processor({ name: 'sweep' });

      expect(mocks.logger.info).toHaveBeenCalledWith(
        { processed: 1, succeeded: 1, failed: 0, skipped: 0 },
        'Payout sweep complete',
      );
    });

    it('rejects the job when the due-payout query fails, and logs failed jobs', async () => {
      mocks.findMany.mockRejectedValue(new Error('db down'));
      createPayoutWorker();

      await expect(workers[0].processor({ name: 'sweep' })).rejects.toThrow('db down');

      const err = new Error('db down');
      workers[0].handlers.get('failed')?.({ id: 'job-7' }, err);
      expect(mocks.logger.error).toHaveBeenCalledWith({ err, jobId: 'job-7' }, 'Payout sweep job failed');
    });

    it('schedules the repeatable sweep on the configured cron', async () => {
      await schedulePayouts();

      expect(mocks.scheduleRepeatable).toHaveBeenCalledWith({
        queue: { name: 'payout' },
        name: 'sweep',
        pattern: PAYOUTS.scheduleCron,
      });
    });
  });
});
