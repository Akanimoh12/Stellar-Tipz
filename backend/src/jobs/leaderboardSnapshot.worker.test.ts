import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../modules/leaderboard/leaderboard.service.js', () => ({
  createLeaderboardSnapshot: vi.fn(),
}));

vi.mock('../db/redis.js', () => ({
  redis: {},
}));

vi.mock('../common/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { runLeaderboardSnapshot } from './leaderboardSnapshot.worker.js';
import { createLeaderboardSnapshot } from '../modules/leaderboard/leaderboard.service.js';

describe('runLeaderboardSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rebuilds the snapshot for every period', async () => {
    vi.mocked(createLeaderboardSnapshot).mockImplementation(async (period) => ({
      period,
      entriesCreated: 3,
    }));

    const result = await runLeaderboardSnapshot();

    expect(result).toEqual({ processed: 3, failed: 0 });
    expect(createLeaderboardSnapshot).toHaveBeenCalledTimes(3);
    expect(createLeaderboardSnapshot).toHaveBeenCalledWith('WEEKLY');
    expect(createLeaderboardSnapshot).toHaveBeenCalledWith('MONTHLY');
    expect(createLeaderboardSnapshot).toHaveBeenCalledWith('ALL_TIME');
  });

  it('is idempotent — running twice in a row produces the same result', async () => {
    vi.mocked(createLeaderboardSnapshot).mockImplementation(async (period) => ({
      period,
      entriesCreated: 5,
    }));

    const first = await runLeaderboardSnapshot();
    const second = await runLeaderboardSnapshot();

    expect(first).toEqual(second);
    expect(createLeaderboardSnapshot).toHaveBeenCalledTimes(6);
  });

  it('counts a period as failed without throwing, and still snapshots the rest', async () => {
    vi.mocked(createLeaderboardSnapshot).mockImplementation(async (period) => {
      if (period === 'MONTHLY') throw new Error('db error');
      return { period, entriesCreated: 1 };
    });

    const result = await runLeaderboardSnapshot();

    expect(result).toEqual({ processed: 2, failed: 1 });
    expect(createLeaderboardSnapshot).toHaveBeenCalledTimes(3);
  });

  it('returns processed: 0, failed: 3 when every period fails', async () => {
    vi.mocked(createLeaderboardSnapshot).mockRejectedValue(new Error('db unavailable'));

    const result = await runLeaderboardSnapshot();

    expect(result).toEqual({ processed: 0, failed: 3 });
  });
});
