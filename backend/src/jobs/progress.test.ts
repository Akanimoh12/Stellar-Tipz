import { describe, expect, it, vi } from 'vitest';
import { jobIdempotencyKey, reportJobProgress } from './progress.js';

describe('job progress and identity', () => {
  it('persists progress for an active job', async () => {
    const updateProgress = vi.fn().mockResolvedValue(undefined);
    await reportJobProgress(
      { id: 'job-1', queueName: 'long-work', updateProgress } as never,
      { completed: 2, total: 5, message: 'Processing records' },
    );

    expect(updateProgress).toHaveBeenCalledWith({
      completed: 2,
      total: 5,
      message: 'Processing records',
    });
  });

  it('safely ignores progress when no BullMQ job is available', async () => {
    await expect(reportJobProgress(undefined, { completed: 1 })).resolves.toBeUndefined();
  });

  it('creates stable job ids for retries and duplicate enqueue requests', () => {
    expect(jobIdempotencyKey('payout', 'sweep', 'cycle-42')).toBe(
      'payout-sweep-cycle-42',
    );
    expect(jobIdempotencyKey('payout', 'sweep', 'cycle-42')).toBe(
      jobIdempotencyKey('payout', 'sweep', 'cycle-42'),
    );
  });
});
