import { describe, expect, it, vi } from 'vitest';

vi.mock('../../jobs/index.js', () => ({
  getCreditRecomputeQueue: vi.fn(),
  getAnalyticsDailyQueue: vi.fn(),
  getSubscriptionChargeQueue: vi.fn(),
  getLeaderboardSnapshotQueue: vi.fn(),
  getXMetricsRefreshQueue: vi.fn(),
  getDiscoveryQueue: vi.fn(),
  getPlatformStatsQueue: vi.fn(),
  getPayoutQueue: vi.fn(),
  getAuthChallengeCleanupQueue: vi.fn(),
  getRetentionQueue: vi.fn(),
}));
vi.mock('../jobs/audit.service.js', () => ({ createAuditLog: vi.fn() }));

import { ConflictError } from '../../common/errors/AppError.js';
import { getAnalyticsDailyQueue } from '../../jobs/index.js';
import { createAuditLog } from '../jobs/audit.service.js';
import {
  enqueueManualJob,
  triggerManualJob,
  validateManualJobParams,
} from './manual-jobs.service.js';

function fakeQueue(options: { inFlight?: string[]; existingState?: string | null } = {}) {
  const add = vi.fn(async (name: string, _data: unknown, opts: { jobId: string }) => ({
    id: opts.jobId,
    name,
  }));
  const remove = vi.fn(async () => undefined);
  return {
    name: 'analytics-daily',
    getJobs: vi.fn(async () =>
      (options.inFlight ?? []).map((name) => ({ name })),
    ),
    getJob: vi.fn(async () =>
      options.existingState
        ? { getState: async () => options.existingState, remove }
        : null,
    ),
    add,
    remove,
  };
}

describe('manual job trigger overlap guard', () => {
  it('enqueues the scheduled job name with a deterministic manual lock id', async () => {
    const queue = fakeQueue();
    const result = await enqueueManualJob(queue as never, 'rollup', { date: '2026-09-24' });

    expect(result).toEqual({
      queue: 'analytics-daily',
      jobName: 'rollup',
      jobId: 'manual:analytics-daily:rollup',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'rollup',
      { date: '2026-09-24' },
      expect.objectContaining({ jobId: 'manual:analytics-daily:rollup' }),
    );
  });

  it('rejects while the same scheduled job is active or waiting', async () => {
    const queue = fakeQueue({ inFlight: ['rollup'] });
    await expect(
      enqueueManualJob(queue as never, 'rollup', {}),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects a concurrent manual trigger using the same lock id', async () => {
    const queue = fakeQueue({ existingState: 'waiting' });
    await expect(
      enqueueManualJob(queue as never, 'rollup', {}),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('triggers the scheduled queue and audit-logs the operator identity', async () => {
    const queue = fakeQueue();
    vi.mocked(getAnalyticsDailyQueue).mockReturnValue(queue as never);
    vi.mocked(createAuditLog).mockResolvedValue(undefined as never);

    const result = await triggerManualJob(
      'analytics-daily',
      'admin-42',
      { date: '2026-09-24' },
    );

    expect(result.jobName).toBe('rollup');
    expect(queue.add).toHaveBeenCalledWith(
      'rollup',
      { date: '2026-09-24' },
      expect.objectContaining({ jobId: 'manual:analytics-daily:rollup' }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'job_execution:analytics-daily',
        actorId: 'admin-42',
        trigger: 'manual',
        outcome: 'success',
      }),
    );
  });

  it('accepts a valid analytics date parameter', () => {
    expect(validateManualJobParams('analytics-daily', { date: '2026-09-24' })).toEqual({
      date: '2026-09-24',
    });
  });

  it('rejects invalid or unsupported manual job parameters', () => {
    expect(() => validateManualJobParams('analytics-daily', { date: '2026-02-30' })).toThrow();
    expect(() => validateManualJobParams('retention', { date: '2026-09-24' })).toThrow();
  });
});
