import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProfile } from '../useProfile';
import { useWalletStore } from '../../store/walletStore';
import { useProfileStore } from '../../store/profileStore';
import { useContract } from '../useContract';
import type { Profile } from '../../types/contract';

// Mock the useContract hook
vi.mock('../useContract');
const mockUseContract = vi.mocked(useContract);

describe('useProfile', () => {
  const mockGetProfile = vi.fn();
  const mockProfile: Profile = {
    owner: 'GD1234567890ABCDEF',
    username: 'testuser',
    displayName: 'Test User',
    bio: 'Test bio',
    imageUrl: 'https://example.com/image.jpg',
    xHandle: '@testuser',
    xFollowers: 100,
    xPosts: 50,
    xReplies: 25,
    creditScore: 75,
    totalTipsReceived: '1000000',
    totalTipsCount: 10,
    balance: '500000',
    registeredAt: 1640995200,
    updatedAt: 1640995200,
  };

  beforeEach(() => {
    // Reset stores before each test
    useWalletStore.setState({
      publicKey: null,
      connected: false,
      connecting: false,
      error: null,
      network: 'TESTNET',
    });

    useProfileStore.setState({
      profile: null,
      loading: false,
      error: null,
    });

    mockGetProfile.mockClear();
    mockUseContract.mockReturnValue({
      getProfile: mockGetProfile,
    } as any);
  });

  it('should return initial profile state', () => {
    const { result } = renderHook(() => useProfile());

    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isRegistered).toBe(false);
  });

  it('should fetch profile when wallet connects', async () => {
    // Set wallet as connected
    useWalletStore.setState({
      publicKey: 'GD1234567890ABCDEF',
      connected: true,
      connecting: false,
      error: null,
      network: 'TESTNET',
    });

    mockGetProfile.mockResolvedValue(mockProfile);

    const { result } = renderHook(() => useProfile());

    await waitFor(() => {
      expect(result.current.profile).toEqual(mockProfile);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.isRegistered).toBe(true);
    });

    expect(mockGetProfile).toHaveBeenCalledWith('GD1234567890ABCDEF');
  });

  it('should clear profile when wallet disconnects', async () => {
    // Start with connected state and profile
    useWalletStore.setState({
      publicKey: 'GD1234567890ABCDEF',
      connected: true,
      connecting: false,
      error: null,
      network: 'TESTNET',
    });

    useProfileStore.setState({
      profile: mockProfile,
      loading: false,
      error: null,
    });

    mockGetProfile.mockResolvedValue(mockProfile);

    const { result } = renderHook(() => useProfile());

    await waitFor(() => {
      expect(result.current.profile).toEqual(mockProfile);
    });

    // Disconnect wallet
    act(() => {
      useWalletStore.getState().disconnect();
    });

    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isRegistered).toBe(false);
  });

  it('should handle not registered error', async () => {
    // Set wallet as connected
    useWalletStore.setState({
      publicKey: 'GD1234567890ABCDEF',
      connected: true,
      connecting: false,
      error: null,
      network: 'TESTNET',
    });

    const notRegisteredError = new Error('Profile not found');
    mockGetProfile.mockRejectedValue(notRegisteredError);

    const { result } = renderHook(() => useProfile());

    await waitFor(() => {
      expect(result.current.profile).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.isRegistered).toBe(false);
    });
  });

  it('should handle other errors', async () => {
    // Set wallet as connected
    useWalletStore.setState({
      publicKey: 'GD1234567890ABCDEF',
      connected: true,
      connecting: false,
      error: null,
      network: 'TESTNET',
    });

    const networkError = new Error('Network error');
    mockGetProfile.mockRejectedValue(networkError);

    const { result } = renderHook(() => useProfile());

    await waitFor(() => {
      expect(result.current.profile).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Network error');
      expect(result.current.isRegistered).toBe(false);
    });
  });

  it('should refetch profile manually', async () => {
    // Set wallet as connected
    useWalletStore.setState({
      publicKey: 'GD1234567890ABCDEF',
      connected: true,
      connecting: false,
      error: null,
      network: 'TESTNET',
    });

    mockGetProfile.mockResolvedValue(mockProfile);

    const { result } = renderHook(() => useProfile());

    await waitFor(() => {
      expect(result.current.profile).toEqual(mockProfile);
    });

    // Clear the mock to test refetch
    mockGetProfile.mockClear();
    mockGetProfile.mockResolvedValue(mockProfile);

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(mockGetProfile).toHaveBeenCalledTimes(1);
      expect(mockGetProfile).toHaveBeenCalledWith('GD1234567890ABCDEF');
    });
  });

  it('should not fetch profile when wallet is not connected', () => {
    const { result } = renderHook(() => useProfile());

    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isRegistered).toBe(false);

    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('should handle loading state during fetch', async () => {
    // Set wallet as connected
    useWalletStore.setState({
      publicKey: 'GD1234567890ABCDEF',
      connected: true,
      connecting: false,
      error: null,
      network: 'TESTNET',
    });

    let resolveProfile: (value: Profile) => void;
    const profilePromise = new Promise<Profile>((resolve) => {
      resolveProfile = resolve;
    });

    mockGetProfile.mockReturnValue(profilePromise);

    const { result } = renderHook(() => useProfile());

    // Should be loading initially
    expect(result.current.loading).toBe(true);

    // Resolve the promise
    act(() => {
      resolveProfile!(mockProfile);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.profile).toEqual(mockProfile);
    });
  });
});
