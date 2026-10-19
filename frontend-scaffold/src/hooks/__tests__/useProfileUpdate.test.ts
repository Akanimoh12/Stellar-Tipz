import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProfileUpdate } from '../useProfileUpdate';
import { useProfileStore } from '../../store/profileStore';
import { useContract } from '../useContract';
import type { Profile } from '../../types/contract';
import type { ProfileFormData } from '../../types/profile';
import { logger } from '../../services/logger';

vi.mock('../useContract');
vi.mock('../../services/logger');

const mockUseContract = vi.mocked(useContract);
const mockLogger = vi.mocked(logger);

describe('useProfileUpdate', () => {
  const mockUpdateProfile = vi.fn();
  const mockGetProfile = vi.fn();

  const mockProfile: Profile = {
    owner: 'GD1234567890ABCDEF',
    username: 'alice',
    displayName: 'Alice Original',
    bio: 'Original bio',
    imageUrl: 'https://example.com/alice.png',
    xHandle: '@alice',
    xFollowers: 10,
    xEngagementAvg: 5,
    creditScore: 80,
    totalTipsReceived: '1000',
    totalTipsCount: 2,
    balance: '500',
    registeredAt: 1600000000,
    updatedAt: 1600000000,
  };

  const sampleFormData: ProfileFormData = {
    username: 'alice',
    displayName: 'Alice Updated',
    bio: 'Updated bio',
    imageUrl: 'https://example.com/new.png',
    xHandle: '@alice_new',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateProfile.mockResolvedValue('0xabcdef123456');
    mockGetProfile.mockResolvedValue({
      ...mockProfile,
      displayName: 'Alice Updated',
      bio: 'Updated bio',
      imageUrl: 'https://example.com/new.png',
      xHandle: '@alice_new',
      updatedAt: 1600000000,
    });

    mockUseContract.mockReturnValue({
      updateProfile: mockUpdateProfile,
      getProfile: mockGetProfile,
    } as unknown as ReturnType<typeof useContract>);

    useProfileStore.setState({
      profile: { ...mockProfile },
      optimisticProfile: null,
      loading: false,
      error: null,
      updateStatus: 'idle',
      savedEdits: null,
      knownUpdatedAt: null,
      updateError: null,
      conflictProfile: null,
    });
  });

  it('should throw an error if no profile is loaded', async () => {
    useProfileStore.setState({ profile: null });
    const { result } = renderHook(() => useProfileUpdate());

    await expect(
      result.current.submitUpdate({ displayName: 'New' }, sampleFormData),
    ).rejects.toThrow('No profile loaded');
  });

  it('should prevent submission if an update is already pending or confirming', async () => {
    useProfileStore.setState({ updateStatus: 'pending' });
    const { result: r1 } = renderHook(() => useProfileUpdate());
    await expect(
      r1.current.submitUpdate({ displayName: 'New' }, sampleFormData),
    ).rejects.toThrow('An update is already in progress');

    useProfileStore.setState({ updateStatus: 'confirming' });
    const { result: r2 } = renderHook(() => useProfileUpdate());
    await expect(
      r2.current.submitUpdate({ displayName: 'New' }, sampleFormData),
    ).rejects.toThrow('An update is already in progress');
  });

  it('should successfully submit an update, apply optimistic state, and commit on success', async () => {
    const { result } = renderHook(() => useProfileUpdate());

    let txHash: string = '';
    await act(async () => {
      txHash = await result.current.submitUpdate(
        { displayName: 'Alice Updated', bio: 'Updated bio' },
        sampleFormData,
      );
    });

    expect(txHash).toBe('0xabcdef123456');
    expect(mockUpdateProfile).toHaveBeenCalledWith({
      displayName: 'Alice Updated',
      bio: 'Updated bio',
    });
    expect(mockGetProfile).toHaveBeenCalledWith(mockProfile.owner);

    const storeState = useProfileStore.getState();
    expect(storeState.updateStatus).toBe('confirmed');
    expect(storeState.profile?.displayName).toBe('Alice Updated');
    expect(storeState.profile?.bio).toBe('Updated bio');
  });

  it('should fall back to optimistic profile if re-fetch fails after transaction success', async () => {
    mockGetProfile.mockRejectedValue(new Error('Network error on refetch'));

    const { result } = renderHook(() => useProfileUpdate());

    let txHash: string = '';
    await act(async () => {
      txHash = await result.current.submitUpdate(
        { displayName: 'Alice Updated' },
        sampleFormData,
      );
    });

    expect(txHash).toBe('0xabcdef123456');
    const storeState = useProfileStore.getState();
    expect(storeState.updateStatus).toBe('confirmed');
    expect(storeState.profile?.displayName).toBe('Alice Updated');
  });

  it('should detect concurrent conflict when server updatedAt is newer than snapshot', async () => {
    mockGetProfile.mockResolvedValue({
      ...mockProfile,
      displayName: 'Alice Modified Elsewhere',
      updatedAt: 1600000500, // Newer timestamp
    });

    const { result } = renderHook(() => useProfileUpdate());

    let txHash: string = '';
    await act(async () => {
      txHash = await result.current.submitUpdate(
        { displayName: 'Alice Local Edit' },
        sampleFormData,
      );
    });

    expect(txHash).toBe('0xabcdef123456');
    const storeState = useProfileStore.getState();
    expect(storeState.updateStatus).toBe('conflict');
    expect(storeState.conflictProfile?.displayName).toBe('Alice Modified Elsewhere');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'hooks/useProfileUpdate',
      'Concurrent modification detected',
      expect.objectContaining({
        username: 'alice',
        knownUpdatedAt: 1600000000,
        serverUpdatedAt: 1600000500,
      }),
    );
  });

  it('should rollback update and preserve savedEdits on transaction error', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Contract execution failed'));

    const { result } = renderHook(() => useProfileUpdate());

    await expect(
      result.current.submitUpdate({ displayName: 'Failed Edit' }, sampleFormData),
    ).rejects.toThrow('Contract execution failed');

    const storeState = useProfileStore.getState();
    expect(storeState.updateStatus).toBe('error');
    expect(storeState.updateError).toBe('Contract execution failed');
    expect(storeState.savedEdits).toEqual(sampleFormData);
    expect(storeState.optimisticProfile).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should handle resetError to clear update status back to idle', () => {
    useProfileStore.setState({ updateStatus: 'error', updateError: 'Failed' });
    const { result } = renderHook(() => useProfileUpdate());

    act(() => {
      result.current.resetError();
    });

    const storeState = useProfileStore.getState();
    expect(storeState.updateStatus).toBe('idle');
    expect(storeState.updateError).toBeNull();
  });

  it('should handle resolveConflict to dismiss conflict UI', () => {
    useProfileStore.setState({
      updateStatus: 'conflict',
      conflictProfile: { ...mockProfile, displayName: 'Remote' },
    });
    const { result } = renderHook(() => useProfileUpdate());

    act(() => {
      result.current.resolveConflict();
    });

    const storeState = useProfileStore.getState();
    expect(storeState.updateStatus).toBe('idle');
    expect(storeState.conflictProfile).toBeNull();
  });
});
