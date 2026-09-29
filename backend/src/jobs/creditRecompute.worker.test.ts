import { describe, expect, it, vi, beforeEach } from 'vitest';
import { recomputeAllScores } from './creditRecompute.worker.js';

const { mockFindMany, mockRecalculateScore } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockRecalculateScore: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    user: {
      findMany: mockFindMany,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('../modules/credit/credit.service.js', () => ({
  recalculateCreditScore: mockRecalculateScore,
}));

describe('recomputeAllScores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero counts when no users exist', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await recomputeAllScores();

    expect(result).toEqual({ processed: 0, failed: 0 });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: { id: true },
    });
    expect(mockRecalculateScore).not.toHaveBeenCalled();
  });

  it('processes all non-deleted users', async () => {
    mockFindMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' }]);
    mockRecalculateScore.mockResolvedValue(undefined);

    const result = await recomputeAllScores();

    expect(result).toEqual({ processed: 3, failed: 0 });
    expect(mockRecalculateScore).toHaveBeenCalledTimes(3);
    expect(mockRecalculateScore).toHaveBeenCalledWith('user-1');
    expect(mockRecalculateScore).toHaveBeenCalledWith('user-2');
    expect(mockRecalculateScore).toHaveBeenCalledWith('user-3');
  });

  it('continues processing when individual user recalculations fail', async () => {
    mockFindMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' }]);
    mockRecalculateScore
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(undefined);

    const result = await recomputeAllScores();

    expect(result).toEqual({ processed: 2, failed: 1 });
    expect(mockRecalculateScore).toHaveBeenCalledTimes(3);
  });
});
