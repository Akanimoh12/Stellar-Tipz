import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSearch } from '../useSearch';
import { useContract } from '../useContract';
import { env } from '../../helpers/env';
import type { Profile } from '../../types';

vi.mock('../useContract');
vi.mock('../../helpers/env', () => ({
  env: {
    useMockData: false,
    contractId: 'CA1234567890ABCDEF',
  },
}));
vi.mock('../../lib/liveRegion', () => ({
  announce: vi.fn(),
}));

const mockUseContract = vi.mocked(useContract);

describe('useSearch', () => {
  const mockGetLeaderboard = vi.fn();
  const mockGetProfile = vi.fn();

  const mockProfiles: Profile[] = [
    {
      owner: 'G_ALICE_111',
      username: 'alice_crypto',
      displayName: 'Alice Wonder',
      bio: 'Crypto builder',
      imageUrl: '',
      xHandle: 'alice',
      xFollowers: 100,
      xEngagementAvg: 10,
      creditScore: 80,
      totalTipsReceived: '1000',
      totalTipsCount: 5,
      balance: '100',
      registeredAt: 1600000000,
      updatedAt: 1600000000,
    },
    {
      owner: 'G_BOB_222',
      username: 'bob_builder',
      displayName: 'Bob The Builder',
      bio: 'Stellar developer',
      imageUrl: '',
      xHandle: 'bob',
      xFollowers: 200,
      xEngagementAvg: 20,
      creditScore: 90,
      totalTipsReceived: '2000',
      totalTipsCount: 10,
      balance: '200',
      registeredAt: 1600000000,
      updatedAt: 1600000000,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    sessionStorage.clear();

    mockGetLeaderboard.mockResolvedValue([
      { address: 'G_ALICE_111', score: 80 },
      { address: 'G_BOB_222', score: 90 },
    ]);

    mockGetProfile.mockImplementation(async (address: string) => {
      const found = mockProfiles.find((p) => p.owner === address);
      if (found) return found;
      throw new Error('Not found');
    });

    mockUseContract.mockReturnValue({
      getLeaderboard: mockGetLeaderboard,
      getProfile: mockGetProfile,
    } as unknown as ReturnType<typeof useContract>);
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('should initialize with default empty search state', async () => {
    const { result } = renderHook(() => useSearch());

    // Flush initial fetchProfiles
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasSearched).toBe(false);
    expect(result.current.recentSearches).toEqual([]);
  });

  it('should load recent searches from sessionStorage on mount', async () => {
    const saved = [
      { owner: 'G_ALICE_111', username: 'alice_crypto', displayName: 'Alice Wonder' },
    ];
    sessionStorage.setItem('stellar_tipz_recent_searches', JSON.stringify(saved));

    const { result } = renderHook(() => useSearch());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.recentSearches.length).toBe(1);
    expect(result.current.recentSearches[0].owner).toBe('G_ALICE_111');
  });

  it('should debounce query and perform search matching profiles', async () => {
    const { result } = renderHook(() => useSearch());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Type search query
    act(() => {
      result.current.setQuery('alice');
    });

    // Before debounce elapsed: no search performed yet
    expect(result.current.hasSearched).toBe(false);

    // Advance 300ms debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.hasSearched).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.results.length).toBeGreaterThan(0);
    expect(result.current.results[0].item.username).toBe('alice_crypto');
  });

  it('should clear results when query is cleared or empty', async () => {
    const { result } = renderHook(() => useSearch());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.setQuery('alice');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.results.length).toBeGreaterThan(0);

    // Clear query
    act(() => {
      result.current.setQuery('');
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.hasSearched).toBe(false);
  });

  it('should handle profile fetch error gracefully on mount', async () => {
    mockGetLeaderboard.mockRejectedValue(new Error('Leaderboard unavailable'));

    const { result } = renderHook(() => useSearch());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Searching with no profiles loaded shouldn't throw
    act(() => {
      result.current.setQuery('alice');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.results).toEqual([]);
  });

  it('should add to recent searches, deduplicate, and limit to max 5', async () => {
    const { result } = renderHook(() => useSearch());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.addToRecent(mockProfiles[0]);
    });

    expect(result.current.recentSearches.length).toBe(1);
    expect(result.current.recentSearches[0].owner).toBe('G_ALICE_111');

    // Add duplicate - should not create 2 entries
    act(() => {
      result.current.addToRecent(mockProfiles[0]);
    });
    expect(result.current.recentSearches.length).toBe(1);

    // Add more profiles to test max 5 limit
    for (let i = 1; i <= 6; i++) {
      act(() => {
        result.current.addToRecent({
          ...mockProfiles[0],
          owner: `G_USER_${i}`,
          username: `user_${i}`,
        });
      });
    }

    expect(result.current.recentSearches.length).toBe(5);
    const stored = JSON.parse(sessionStorage.getItem('stellar_tipz_recent_searches') || '[]');
    expect(stored.length).toBe(5);
  });

  it('should clear recent searches and remove from sessionStorage', async () => {
    const { result } = renderHook(() => useSearch());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.addToRecent(mockProfiles[0]);
    });
    expect(result.current.recentSearches.length).toBe(1);

    act(() => {
      result.current.clearRecent();
    });

    expect(result.current.recentSearches).toEqual([]);
    expect(sessionStorage.getItem('stellar_tipz_recent_searches')).toBeNull();
  });

  it('should clear debounce timer on unmount', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const { result, unmount } = renderHook(() => useSearch());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.setQuery('alice');
    });

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
