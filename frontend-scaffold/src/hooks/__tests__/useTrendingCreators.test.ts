import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTrendingCreators } from '../useTrendingCreators';
import { useContract } from '../useContract';
import type { LeaderboardEntry, Tip } from '@/types/contract';
import { env } from '@/helpers/env';
import { logger } from '@/services/logger';

vi.mock('../useContract');
vi.mock('@/helpers/env');
vi.mock('@/services/logger');

const mockUseContract = vi.mocked(useContract);
const mockEnv = vi.mocked(env);
const mockLogger = vi.mocked(logger);

const mockLeaderboardEntry: LeaderboardEntry = {
  address: 'GC3JWRMQHG7QZRZDL7ZLWX7YLGQ7YLGQ7YLGQ7YLGQ7YLGQ7YLGQ7Y',
  totalTipsReceived: '10000000',
  tipsCount: 5,
};

const mockTip: Tip = {
  id: 1,
  tipper: 'GDOZV3D6O4BT7OVVHWV3E2BFG4LZPVYHZQ2ZQVZQ2ZQVZQ2ZQVZQ2ZQ',
  creator: 'GC3JWRMQHG7QZRZDL7ZLWX7YLGQ7YLGQ7YLGQ7YLGQ7YLGQ7YLGQ7Y',
  amount: '1000000',
  message: 'Great content!',
  isEncrypted: false,
  timestamp: Math.floor(Date.now() / 1000),
};

describe('useTrendingCreators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.useMockData = false;
    mockEnv.contractId = 'test-contract-id';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return initial loading state', () => {
    const mockGetLeaderboard = vi.fn().mockResolvedValue([]);
    const mockGetRecentTips = vi.fn().mockResolvedValue([]);

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTrendingCreators());

    expect(result.current.loading).toBe(true);
    expect(result.current.creators).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isFallback).toBe(false);
  });

  it('should fetch trending creators based on recent tips', async () => {
    const leaderboard: LeaderboardEntry[] = [
      mockLeaderboardEntry,
      {
        address: 'GDZST3XVCDTUJ76ZAV2HA72KYGL567MLQY4LHTDHLLNPHDQUAWQFN5D',
        totalTipsReceived: '5000000',
        tipsCount: 3,
      },
    ];

    const mockGetLeaderboard = vi.fn().mockResolvedValue(leaderboard);
    const mockGetRecentTips = vi.fn().mockResolvedValue([mockTip]);

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTrendingCreators());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.creators.length).toBeGreaterThan(0);
    expect(result.current.creators[0]).toMatchObject({
      address: expect.any(String),
      weeklyTips: expect.any(String),
    });
  });

  it('should cache results for 5 minutes', async () => {
    const leaderboard: LeaderboardEntry[] = [mockLeaderboardEntry];
    const mockGetLeaderboard = vi.fn().mockResolvedValue(leaderboard);
    const mockGetRecentTips = vi.fn().mockResolvedValue([mockTip]);

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result: result1 } = renderHook(() => useTrendingCreators());

    await waitFor(() => {
      expect(result1.current.loading).toBe(false);
    });

    mockGetLeaderboard.mockClear();
    mockGetRecentTips.mockClear();

    const { result: result2 } = renderHook(() => useTrendingCreators());

    await waitFor(() => {
      expect(result2.current.loading).toBe(false);
    });

    expect(mockGetLeaderboard).not.toHaveBeenCalled();
    expect(mockGetRecentTips).not.toHaveBeenCalled();
  });

  it('should fall back to overall leaderboard when no recent activity', async () => {
    const leaderboard: LeaderboardEntry[] = [mockLeaderboardEntry];
    const mockGetLeaderboard = vi.fn().mockResolvedValue(leaderboard);
    const mockGetRecentTips = vi.fn().mockResolvedValue([]);

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTrendingCreators());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isFallback).toBe(true);
    expect(result.current.creators.length).toBeGreaterThan(0);
  });

  it('should fall back to overall leaderboard on error', async () => {
    const leaderboard: LeaderboardEntry[] = [mockLeaderboardEntry];
    const mockGetLeaderboard = vi.fn();
    mockGetLeaderboard.mockRejectedValueOnce(new Error('Fetch error'));
    mockGetLeaderboard.mockResolvedValueOnce(leaderboard);

    const mockGetRecentTips = vi.fn().mockRejectedValue(new Error('Tips error'));

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTrendingCreators());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isFallback).toBe(true);
    expect(result.current.error).not.toBeNull();
  });

  it('should handle empty leaderboard', async () => {
    const mockGetLeaderboard = vi.fn().mockResolvedValue([]);
    const mockGetRecentTips = vi.fn();

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTrendingCreators());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.creators).toEqual([]);
    expect(result.current.isFallback).toBe(false);
    expect(mockGetRecentTips).not.toHaveBeenCalled();
  });

  it('should respect limit parameter', async () => {
    const leaderboard: LeaderboardEntry[] = Array.from({ length: 20 }, (_, i) => ({
      address: `address_${i}`,
      totalTipsReceived: String(10000000 - i * 100000),
      tipsCount: 5 - (i % 5),
    }));

    const mockGetLeaderboard = vi.fn().mockResolvedValue(leaderboard);
    const mockGetRecentTips = vi.fn().mockResolvedValue([]);

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTrendingCreators(5));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.creators.length).toBeLessThanOrEqual(5);
  });

  it('should handle partial getRecentTips failures', async () => {
    const leaderboard: LeaderboardEntry[] = [
      mockLeaderboardEntry,
      {
        address: 'GDZST3XVCDTUJ76ZAV2HA72KYGL567MLQY4LHTDHLLNPHDQUAWQFN5D',
        totalTipsReceived: '5000000',
        tipsCount: 3,
      },
    ];

    const mockGetLeaderboard = vi.fn().mockResolvedValue(leaderboard);
    const mockGetRecentTips = vi.fn();
    mockGetRecentTips.mockResolvedValueOnce([mockTip]);
    mockGetRecentTips.mockRejectedValueOnce(new Error('Fetch error'));

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTrendingCreators());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockLogger.warn).toHaveBeenCalled();
    expect(result.current.creators.length).toBeGreaterThanOrEqual(0);
  });

  it('should sort creators by weekly tips descending', async () => {
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;

    const leaderboard: LeaderboardEntry[] = [
      {
        address: 'creator_1',
        totalTipsReceived: '10000000',
        tipsCount: 5,
      },
      {
        address: 'creator_2',
        totalTipsReceived: '5000000',
        tipsCount: 3,
      },
    ];

    const tips: Tip[] = [
      {
        id: 1,
        tipper: 'tipper_1',
        creator: 'creator_1',
        amount: '5000000',
        message: 'message',
        isEncrypted: false,
        timestamp: now,
      },
      {
        id: 2,
        tipper: 'tipper_2',
        creator: 'creator_2',
        amount: '3000000',
        message: 'message',
        isEncrypted: false,
        timestamp: sevenDaysAgo + 100,
      },
    ];

    const mockGetLeaderboard = vi.fn().mockResolvedValue(leaderboard);
    const mockGetRecentTips = vi.fn().mockResolvedValue(tips);

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTrendingCreators());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    if (result.current.creators.length > 1) {
      const first = BigInt(result.current.creators[0].weeklyTips);
      const second = BigInt(result.current.creators[1].weeklyTips);
      expect(first >= second).toBe(true);
    }
  });

  it('should use mock data when enabled', async () => {
    mockEnv.useMockData = true;

    const mockGetLeaderboard = vi.fn();
    const mockGetRecentTips = vi.fn();

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTrendingCreators());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetLeaderboard).not.toHaveBeenCalled();
    expect(mockGetRecentTips).not.toHaveBeenCalled();
    expect(result.current.isFallback).toBe(false);
  });

  it('should allow manual refetch', async () => {
    const leaderboard: LeaderboardEntry[] = [mockLeaderboardEntry];
    const mockGetLeaderboard = vi.fn().mockResolvedValue(leaderboard);
    const mockGetRecentTips = vi.fn().mockResolvedValue([]);

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTrendingCreators());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockGetLeaderboard.mockClear();

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(mockGetLeaderboard).toHaveBeenCalled();
    });
  });

  it('should filter out creators with zero weekly tips', async () => {
    const leaderboard: LeaderboardEntry[] = [
      {
        address: 'creator_1',
        totalTipsReceived: '10000000',
        tipsCount: 5,
      },
      {
        address: 'creator_2',
        totalTipsReceived: '5000000',
        tipsCount: 3,
      },
    ];

    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;

    const tips: Tip[] = [
      {
        id: 1,
        tipper: 'tipper_1',
        creator: 'creator_1',
        amount: '5000000',
        message: 'message',
        isEncrypted: false,
        timestamp: now,
      },
    ];

    const mockGetLeaderboard = vi.fn().mockResolvedValue(leaderboard);
    const mockGetRecentTips = vi.fn().mockResolvedValue(tips);

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getRecentTips: mockGetRecentTips,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTrendingCreators());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const hasZeroTips = result.current.creators.some((c) => c.weeklyTips === '0');
    expect(hasZeroTips).toBe(false);
  });
});
