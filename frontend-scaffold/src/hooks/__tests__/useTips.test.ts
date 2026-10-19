import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTips } from '../useTips';
import { useContract } from '../useContract';
import type { Tip } from '@/types/contract';
import { env } from '@/helpers/env';

vi.mock('../useContract');
vi.mock('@/helpers/env');

const mockUseContract = vi.mocked(useContract);
const mockEnv = vi.mocked(env);

const mockTips: Tip[] = [
  {
    id: 1,
    tipper: 'GDOZV3D6O4BT7OVVHWV3E2BFG4LZPVYHZQ2ZQVZQ2ZQVZQ2ZQVZQ2ZQ',
    creator: 'GC3JWRMQHG7QZRZDL7ZLWX7YLGQ7YLGQ7YLGQ7YLGQ7YLGQ7YLGQ7Y',
    amount: '1000000',
    message: 'Great content!',
    isEncrypted: false,
    timestamp: Math.floor(Date.now() / 1000),
  },
  {
    id: 2,
    tipper: 'GDZST3XVCDTUJ76ZAV2HA72KYGL567MLQY4LHTDHLLNPHDQUAWQFN5D',
    creator: 'GC3JWRMQHG7QZRZDL7ZLWX7YLGQ7YLGQ7YLGQ7YLGQ7YLGQ7YLGQ7Y',
    amount: '2000000',
    message: 'Love it!',
    isEncrypted: false,
    timestamp: Math.floor(Date.now() / 1000) - 3600,
  },
];

describe('useTips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.useMockData = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return initial loading state', () => {
    const mockGetRecentTips = vi.fn().mockResolvedValue([]);
    const mockGetCreatorTipCount = vi.fn().mockResolvedValue(0);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: mockGetCreatorTipCount,
      getTipsByTipper: vi.fn(),
      getTipperTipCount: vi.fn(),
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTips('creator_address', 'creator'));

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should fetch creator tips on mount', async () => {
    const mockGetRecentTips = vi.fn().mockResolvedValue(mockTips);
    const mockGetCreatorTipCount = vi.fn().mockResolvedValue(2);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: mockGetCreatorTipCount,
      getTipsByTipper: vi.fn(),
      getTipperTipCount: vi.fn(),
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTips('creator_address', 'creator'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tips).toEqual(mockTips);
    expect(result.current.totalCount).toBe(2);
    expect(mockGetRecentTips).toHaveBeenCalledWith('creator_address', 10, 0);
  });

  it('should fetch tipper tips on mount', async () => {
    const tipperTips = mockTips.map((t) => ({ ...t, tipper: 'tipper_address' }));
    const mockGetTipsByTipper = vi.fn().mockResolvedValue(tipperTips);
    const mockGetTipperTipCount = vi.fn().mockResolvedValue(2);

    mockUseContract.mockReturnValue({
      getRecentTips: vi.fn(),
      getCreatorTipCount: vi.fn(),
      getTipsByTipper: mockGetTipsByTipper,
      getTipperTipCount: mockGetTipperTipCount,
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTips('tipper_address', 'tipper'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tips).toEqual(tipperTips);
    expect(result.current.totalCount).toBe(2);
  });

  it('should handle fetch errors gracefully', async () => {
    const error = new Error('Fetch failed');
    const mockGetRecentTips = vi.fn().mockRejectedValue(error);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: vi.fn(),
      getTipsByTipper: vi.fn(),
      getTipperTipCount: vi.fn(),
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTips('creator_address', 'creator'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Fetch failed');
    expect(result.current.tips).toEqual([]);
  });

  it('should indicate hasMore when tips.length < totalCount', async () => {
    const mockGetRecentTips = vi.fn().mockResolvedValue(mockTips);
    const mockGetCreatorTipCount = vi.fn().mockResolvedValue(100);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: mockGetCreatorTipCount,
      getTipsByTipper: vi.fn(),
      getTipperTipCount: vi.fn(),
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTips('creator_address', 'creator'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(true);
  });

  it('should indicate no more tips when loaded all', async () => {
    const mockGetRecentTips = vi.fn().mockResolvedValue(mockTips);
    const mockGetCreatorTipCount = vi.fn().mockResolvedValue(2);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: mockGetCreatorTipCount,
      getTipsByTipper: vi.fn(),
      getTipperTipCount: vi.fn(),
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTips('creator_address', 'creator'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(false);
  });

  it('should load more tips when loadMore is called', async () => {
    const firstPage = mockTips.slice(0, 1);
    const secondPage = mockTips.slice(1);

    const mockGetRecentTips = vi.fn();
    mockGetRecentTips.mockResolvedValueOnce(firstPage);
    mockGetRecentTips.mockResolvedValueOnce(secondPage);

    const mockGetCreatorTipCount = vi.fn().mockResolvedValue(2);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: mockGetCreatorTipCount,
      getTipsByTipper: vi.fn(),
      getTipperTipCount: vi.fn(),
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTips('creator_address', 'creator', 1));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tips).toEqual(firstPage);

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.tips).toEqual(mockTips);
    });
  });

  it('should not allow concurrent fetches', async () => {
    const mockGetRecentTips = vi.fn().mockResolvedValue(mockTips);
    const mockGetCreatorTipCount = vi.fn().mockResolvedValue(100);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: mockGetCreatorTipCount,
      getTipsByTipper: vi.fn(),
      getTipperTipCount: vi.fn(),
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTips('creator_address', 'creator'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockGetRecentTips.mockClear();

    await act(async () => {
      result.current.loadMore();
      result.current.loadMore();
    });

    expect(mockGetRecentTips).toHaveBeenCalledTimes(1);
  });

  it('should refetch from beginning', async () => {
    const mockGetRecentTips = vi.fn();
    mockGetRecentTips.mockResolvedValueOnce(mockTips.slice(0, 1));
    mockGetRecentTips.mockResolvedValueOnce(mockTips);

    const mockGetCreatorTipCount = vi.fn().mockResolvedValue(2);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: mockGetCreatorTipCount,
      getTipsByTipper: vi.fn(),
      getTipperTipCount: vi.fn(),
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTips('creator_address', 'creator', 1));

    await waitFor(() => {
      expect(result.current.tips).toEqual(mockTips.slice(0, 1));
    });

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.tips).toEqual(mockTips);
      expect(mockGetRecentTips).toHaveBeenLastCalledWith('creator_address', 1, 0);
    });
  });

  it('should reset tips when address changes', async () => {
    const mockGetRecentTips = vi.fn().mockResolvedValue(mockTips);
    const mockGetCreatorTipCount = vi.fn().mockResolvedValue(2);

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: mockGetCreatorTipCount,
      getTipsByTipper: vi.fn(),
      getTipperTipCount: vi.fn(),
    } as unknown as ReturnType<typeof useContract>);

    const { result, rerender } = renderHook(({ address }) => useTips(address, 'creator'), {
      initialProps: { address: 'creator_address_1' },
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tips).toEqual(mockTips);
    mockGetRecentTips.mockClear();

    rerender({ address: 'creator_address_2' });

    await waitFor(() => {
      expect(mockGetRecentTips).toHaveBeenCalledWith('creator_address_2', 10, 0);
    });
  });

  it('should use mock data when enabled', async () => {
    mockEnv.useMockData = true;

    const mockGetRecentTips = vi.fn();
    const mockGetCreatorTipCount = vi.fn();

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: mockGetCreatorTipCount,
      getTipsByTipper: vi.fn(),
      getTipperTipCount: vi.fn(),
    } as unknown as ReturnType<typeof useContract>);

    const { result } = renderHook(() => useTips('creator_address', 'creator'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetRecentTips).not.toHaveBeenCalled();
    expect(result.current.tips.length).toBeGreaterThanOrEqual(0);
  });

  it('should not fetch without address', () => {
    const mockGetRecentTips = vi.fn();
    const mockGetCreatorTipCount = vi.fn();

    mockUseContract.mockReturnValue({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: mockGetCreatorTipCount,
      getTipsByTipper: vi.fn(),
      getTipperTipCount: vi.fn(),
    } as unknown as ReturnType<typeof useContract>);

    renderHook(() => useTips('', 'creator'));

    expect(mockGetRecentTips).not.toHaveBeenCalled();
  });
});
