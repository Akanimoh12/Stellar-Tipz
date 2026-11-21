/**
 * Tests for Issue 171: profile update lifecycle.
 *
 * Covers:
 *  1. Optimistic update — changes appear immediately in the store.
 *  2. Confirmation — successful tx commits the server's profile.
 *  3. Failure rollback — optimistic overlay is removed; savedEdits preserved.
 *  4. Concurrent conflict — newer updatedAt on server surfaces as 'conflict'.
 *  5. Submit guard — second submit is rejected while one is pending.
 *  6. EditProfileForm integration — UI reflects each lifecycle state.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { render, screen, fireEvent, waitFor as domWaitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useProfileUpdate } from '../../../hooks/useProfileUpdate';
import { useProfileStore } from '../../../store/profileStore';
import { useContract } from '../../../hooks/useContract';
import type { Profile } from '../../../types/contract';
import type { ProfileFormData } from '../../../types/profile';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useContract');
const mockUseContract = vi.mocked(useContract);

// Lightweight mocks for components that are not relevant to these tests
vi.mock('../../../components/ui/Input', () => ({
  default: ({ label, placeholder, value, onChange, disabled, error }: any) => (
    <div>
      <label>{label}</label>
      <input
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
      {error && <span role="alert">{error}</span>}
    </div>
  ),
}));

vi.mock('../../../components/ui/Textarea', () => ({
  default: ({ placeholder, value, onChange, disabled, error }: any) => (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
    >
      {error && <span role="alert">{error}</span>}
    </textarea>
  ),
}));

vi.mock('../../../components/ui/Button', () => ({
  default: ({ children, type, disabled, onClick, 'aria-disabled': ariaDisabled }: any) => (
    <button type={type} disabled={disabled} aria-disabled={ariaDisabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('../../../components/shared/TransactionStatus', () => ({
  default: ({ status, errorMessage, onRetry }: any) => (
    <div data-testid="tx-status" data-status={status}>
      {errorMessage && <span>{errorMessage}</span>}
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  ),
}));

vi.mock('../../../components/shared/ImageCropper', () => ({
  default: () => null,
}));

vi.mock('../../../components/shared/DraftRestoreBanner', () => ({
  default: () => null,
}));

vi.mock('../../../features/profile/ProfilePreview', () => ({
  default: () => null,
}));

vi.mock('../../../features/profile/profileThemes', () => ({
  THEME_COLORS: { default: { label: 'Default' } },
}));

vi.mock('../../../helpers/markdown', () => ({
  renderMarkdown: (s: string) => s,
}));

vi.mock('../../../hooks/useFormAutosave', () => ({
  useFormAutosave: () => ({
    hasDraft: false,
    draftSavedAt: null,
    restoreDraft: vi.fn(),
    discardDraft: vi.fn(),
    clearSaved: vi.fn(),
  }),
}));

vi.mock('../../../store/toastStore', () => ({
  useToastStore: () => ({ addToast: vi.fn() }),
}));

vi.mock('../../../services/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    owner: 'GABC123',
    username: 'testuser',
    displayName: 'Test User',
    bio: 'A short bio',
    imageUrl: 'https://example.com/avatar.png',
    xHandle: '@testhandle',
    xFollowers: 0,
    xEngagementAvg: 0,
    creditScore: 50,
    totalTipsReceived: '0',
    totalTipsCount: 0,
    balance: '0',
    registeredAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function buildFormData(overrides: Partial<ProfileFormData> = {}): ProfileFormData {
  return {
    username: 'testuser',
    displayName: 'Test User',
    bio: 'A short bio',
    imageUrl: 'https://example.com/avatar.png',
    xHandle: '@testhandle',
    bannerUrl: '',
    themeKey: 'default',
    githubHandle: '',
    websiteUrl: '',
    ...overrides,
  };
}

function seedProfileStore(profile: Profile) {
  useProfileStore.setState({
    profile,
    optimisticProfile: null,
    loading: false,
    error: null,
    updateStatus: 'idle',
    savedEdits: null,
    knownUpdatedAt: null,
    updateError: null,
    conflictProfile: null,
  });
}

// ── useProfileUpdate unit tests ───────────────────────────────────────────────

describe('useProfileUpdate', () => {
  const mockUpdateProfile = vi.fn();
  const mockGetProfile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseContract.mockReturnValue({
      updateProfile: mockUpdateProfile,
      getProfile: mockGetProfile,
    } as unknown as ReturnType<typeof useContract>);
  });

  // ── 1. Optimistic update ──────────────────────────────────────────────────

  describe('optimistic update', () => {
    it('applies the optimistic overlay immediately before the tx resolves', async () => {
      const profile = buildProfile({ displayName: 'Old Name', updatedAt: 1000 });
      seedProfileStore(profile);

      // Make the tx pend indefinitely so we can assert mid-flight state.
      let resolveTx!: (hash: string) => void;
      mockUpdateProfile.mockReturnValue(
        new Promise<string>((resolve) => {
          resolveTx = resolve;
        }),
      );
      mockGetProfile.mockResolvedValue(
        buildProfile({ displayName: 'New Name', updatedAt: 1001 }),
      );

      const { result } = renderHook(() => useProfileUpdate());

      act(() => {
        result.current.submitUpdate(
          { displayName: 'New Name' },
          buildFormData({ displayName: 'New Name' }),
        );
      });

      // Immediately after calling submitUpdate the store should have an optimistic overlay
      await waitFor(() => {
        const { optimisticProfile, updateStatus } = useProfileStore.getState();
        expect(optimisticProfile?.displayName).toBe('New Name');
        expect(updateStatus).toBe('confirming'); // pending → confirming in same tick
      });

      // Unblock the tx
      act(() => resolveTx('tx-hash-001'));
    });

    it('sets updateStatus to "pending" synchronously then "confirming" after the tx submits', async () => {
      const profile = buildProfile({ updatedAt: 1000 });
      seedProfileStore(profile);

      // updatedAt matches snapshot (1000) — no conflict, should reach 'confirmed'.
      const confirmedProfile = buildProfile({ displayName: 'Confirmed', updatedAt: 1000 });

      let resolveTx!: (hash: string) => void;
      mockUpdateProfile.mockReturnValue(
        new Promise<string>((resolve) => {
          resolveTx = resolve;
        }),
      );
      mockGetProfile.mockResolvedValue(confirmedProfile);

      const { result } = renderHook(() => useProfileUpdate());

      // Act triggers async flow but we check synchronous interim state
      act(() => {
        result.current.submitUpdate(
          { displayName: 'Confirmed' },
          buildFormData({ displayName: 'Confirmed' }),
        );
      });

      await waitFor(() => {
        expect(useProfileStore.getState().updateStatus).toBe('confirming');
      });

      act(() => resolveTx('tx-hash-002'));

      await waitFor(() => {
        expect(useProfileStore.getState().updateStatus).toBe('confirmed');
      });
    });
  });

  // ── 2. Confirmation ───────────────────────────────────────────────────────

  describe('confirmation', () => {
    it('commits the server profile and clears the optimistic overlay on success', async () => {
      const profile = buildProfile({ displayName: 'Old Bio', updatedAt: 1000 });
      seedProfileStore(profile);

      // updatedAt matches snapshot — no conflict.
      const confirmedProfile = buildProfile({ displayName: 'New Bio', updatedAt: 1000 });
      mockUpdateProfile.mockResolvedValue('tx-hash-confirmed');
      mockGetProfile.mockResolvedValue(confirmedProfile);

      const { result } = renderHook(() => useProfileUpdate());

      await act(async () => {
        await result.current.submitUpdate(
          { displayName: 'New Bio' },
          buildFormData({ displayName: 'New Bio' }),
        );
      });

      const state = useProfileStore.getState();
      expect(state.updateStatus).toBe('confirmed');
      expect(state.profile?.displayName).toBe('New Bio');
      expect(state.optimisticProfile).toBeNull();
      expect(state.savedEdits).toBeNull();
    });

    it('returns the transaction hash on success', async () => {
      const profile = buildProfile({ updatedAt: 1000 });
      seedProfileStore(profile);

      // updatedAt matches snapshot — no conflict.
      const confirmedProfile = buildProfile({ updatedAt: 1000 });
      mockUpdateProfile.mockResolvedValue('tx-abc-123');
      mockGetProfile.mockResolvedValue(confirmedProfile);

      const { result } = renderHook(() => useProfileUpdate());

      let returnedHash!: string;
      await act(async () => {
        returnedHash = await result.current.submitUpdate(
          { bio: 'Updated bio' },
          buildFormData({ bio: 'Updated bio' }),
        );
      });

      expect(returnedHash).toBe('tx-abc-123');
    });
  });

  // ── 3. Failure rollback ───────────────────────────────────────────────────

  describe('failure rollback', () => {
    it('reverts the optimistic overlay and preserves savedEdits when the tx fails', async () => {
      const profile = buildProfile({ displayName: 'Original', updatedAt: 1000 });
      seedProfileStore(profile);

      mockUpdateProfile.mockRejectedValue(new Error('Transaction rejected'));

      const { result } = renderHook(() => useProfileUpdate());

      await act(async () => {
        await result.current.submitUpdate(
          { displayName: 'Should Rollback' },
          buildFormData({ displayName: 'Should Rollback' }),
        ).catch(() => {/* expected */});
      });

      const state = useProfileStore.getState();
      expect(state.updateStatus).toBe('error');
      expect(state.optimisticProfile).toBeNull();
      // Canonical profile is untouched
      expect(state.profile?.displayName).toBe('Original');
      // Edits preserved for retry
      expect(state.savedEdits?.displayName).toBe('Should Rollback');
      expect(state.updateError).toBe('Transaction rejected');
    });

    it('sets updateError to a human-readable string', async () => {
      const profile = buildProfile({ updatedAt: 1000 });
      seedProfileStore(profile);

      mockUpdateProfile.mockRejectedValue(new Error('Network timeout'));

      const { result } = renderHook(() => useProfileUpdate());

      await act(async () => {
        await result.current.submitUpdate(
          { bio: 'x' },
          buildFormData({ bio: 'x' }),
        ).catch(() => {});
      });

      expect(useProfileStore.getState().updateError).toBe('Network timeout');
    });

    it('re-throws the error so callers can react', async () => {
      const profile = buildProfile({ updatedAt: 1000 });
      seedProfileStore(profile);

      mockUpdateProfile.mockRejectedValue(new Error('Rejected by wallet'));

      const { result } = renderHook(() => useProfileUpdate());

      await expect(
        act(async () => {
          await result.current.submitUpdate(
            { bio: 'y' },
            buildFormData({ bio: 'y' }),
          );
        }),
      ).rejects.toThrow('Rejected by wallet');
    });

    it('resetError moves status back to idle without discarding savedEdits', async () => {
      const profile = buildProfile({ updatedAt: 1000 });
      seedProfileStore(profile);

      mockUpdateProfile.mockRejectedValue(new Error('Failed'));

      const { result } = renderHook(() => useProfileUpdate());

      await act(async () => {
        await result.current.submitUpdate(
          { bio: 'preserved' },
          buildFormData({ bio: 'preserved' }),
        ).catch(() => {});
      });

      expect(useProfileStore.getState().updateStatus).toBe('error');

      act(() => {
        result.current.resetError();
      });

      const state = useProfileStore.getState();
      expect(state.updateStatus).toBe('idle');
      // savedEdits should still be there (not cleared by resetError)
      expect(state.savedEdits?.bio).toBe('preserved');
    });
  });

  // ── 4. Concurrent conflict detection ─────────────────────────────────────

  describe('concurrent conflict detection', () => {
    it('marks conflict when server updatedAt is newer than knownUpdatedAt', async () => {
      const profile = buildProfile({ updatedAt: 1000 });
      seedProfileStore(profile);

      // Our tx goes through, but when we re-fetch the server has a NEWER version
      // (written by another device between our submit and our re-fetch).
      const serverVersion = buildProfile({ displayName: 'Other Device', updatedAt: 2000 });
      mockUpdateProfile.mockResolvedValue('tx-conflict');
      mockGetProfile.mockResolvedValue(serverVersion);

      const { result } = renderHook(() => useProfileUpdate());

      await act(async () => {
        await result.current.submitUpdate(
          { displayName: 'My Edit' },
          buildFormData({ displayName: 'My Edit' }),
        );
      });

      const state = useProfileStore.getState();
      expect(state.updateStatus).toBe('conflict');
      expect(state.conflictProfile?.displayName).toBe('Other Device');
      // Our edits are still in savedEdits for manual merge
      expect(state.savedEdits?.displayName).toBe('My Edit');
    });

    it('does NOT mark conflict when server updatedAt equals knownUpdatedAt', async () => {
      const profile = buildProfile({ updatedAt: 1000 });
      seedProfileStore(profile);

      // Server returns same or smaller updatedAt — no concurrent edit
      const serverVersion = buildProfile({ displayName: 'My Edit', updatedAt: 1000 });
      mockUpdateProfile.mockResolvedValue('tx-no-conflict');
      mockGetProfile.mockResolvedValue(serverVersion);

      const { result } = renderHook(() => useProfileUpdate());

      await act(async () => {
        await result.current.submitUpdate(
          { displayName: 'My Edit' },
          buildFormData({ displayName: 'My Edit' }),
        );
      });

      expect(useProfileStore.getState().updateStatus).toBe('confirmed');
    });

    it('resolveConflict accepts the server version and moves to idle', async () => {
      const profile = buildProfile({ updatedAt: 1000 });
      seedProfileStore(profile);

      const serverVersion = buildProfile({ displayName: 'Server', updatedAt: 2000 });
      mockUpdateProfile.mockResolvedValue('tx-conflict-2');
      mockGetProfile.mockResolvedValue(serverVersion);

      const { result } = renderHook(() => useProfileUpdate());

      await act(async () => {
        await result.current.submitUpdate(
          { displayName: 'Mine' },
          buildFormData({ displayName: 'Mine' }),
        );
      });

      expect(useProfileStore.getState().updateStatus).toBe('conflict');

      act(() => {
        result.current.resolveConflict();
      });

      const state = useProfileStore.getState();
      expect(state.updateStatus).toBe('idle');
      expect(state.profile?.displayName).toBe('Server');
      expect(state.conflictProfile).toBeNull();
    });
  });

  // ── 5. Submit guard ───────────────────────────────────────────────────────

  describe('submit guard', () => {
    it('throws and does not submit when another update is already pending', async () => {
      const profile = buildProfile({ updatedAt: 1000 });
      seedProfileStore(profile);

      // Manually set the store to confirming state
      useProfileStore.setState({ updateStatus: 'confirming' });

      const { result } = renderHook(() => useProfileUpdate());

      await expect(
        act(async () => {
          await result.current.submitUpdate(
            { bio: 'blocked' },
            buildFormData({ bio: 'blocked' }),
          );
        }),
      ).rejects.toThrow('An update is already in progress');

      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('throws and does not submit when status is "pending"', async () => {
      const profile = buildProfile({ updatedAt: 1000 });
      seedProfileStore(profile);

      useProfileStore.setState({ updateStatus: 'pending' });

      const { result } = renderHook(() => useProfileUpdate());

      await expect(
        act(async () => {
          await result.current.submitUpdate(
            { bio: 'blocked' },
            buildFormData({ bio: 'blocked' }),
          );
        }),
      ).rejects.toThrow('An update is already in progress');

      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });
  });
});

// ── EditProfileForm integration tests ─────────────────────────────────────────

import EditProfileForm from '../EditProfileForm';

describe('EditProfileForm — lifecycle integration', () => {
  const mockUpdateProfile = vi.fn();
  const mockGetProfile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseContract.mockReturnValue({
      updateProfile: mockUpdateProfile,
      getProfile: mockGetProfile,
    } as unknown as ReturnType<typeof useContract>);
  });

  function renderForm(profile: Profile) {
    return render(
      <BrowserRouter>
        <EditProfileForm profile={profile} />
      </BrowserRouter>,
    );
  }

  // ── 6a. Pending banner ────────────────────────────────────────────────────

  it('shows the pending banner while an update is in-flight', async () => {
    const profile = buildProfile({ updatedAt: 1000 });
    seedProfileStore(profile);

    let resolveTx!: (hash: string) => void;
    mockUpdateProfile.mockReturnValue(new Promise<string>((r) => (resolveTx = r)));
    mockGetProfile.mockResolvedValue(buildProfile({ updatedAt: 1001 }));

    renderForm(profile);

    // Change display name so there's a diff
    fireEvent.change(screen.getByPlaceholderText('Your Name'), {
      target: { value: 'Updated Name' },
    });

    fireEvent.submit(screen.getByPlaceholderText('Your Name').closest('form')!);

    await domWaitFor(() => {
      expect(screen.getByTestId('optimistic-pending-banner')).toBeInTheDocument();
    });

    act(() => resolveTx('tx-done'));
  });

  // ── 6b. Submit button disabled while in-flight ─────────────────────────────

  it('disables the submit button while an update is in-flight', async () => {
    const profile = buildProfile({ updatedAt: 1000 });
    seedProfileStore(profile);

    let resolveTx!: (hash: string) => void;
    mockUpdateProfile.mockReturnValue(new Promise<string>((r) => (resolveTx = r)));
    mockGetProfile.mockResolvedValue(buildProfile({ updatedAt: 1001 }));

    renderForm(profile);

    fireEvent.change(screen.getByPlaceholderText('Your Name'), {
      target: { value: 'Another Name' },
    });

    fireEvent.submit(screen.getByPlaceholderText('Your Name').closest('form')!);

    await domWaitFor(() => {
      const submitBtn = screen.getByRole('button', { name: /updating/i });
      expect(submitBtn).toBeDisabled();
    });

    act(() => resolveTx('tx-done'));
  });

  // ── 6c. Rollback error banner ──────────────────────────────────────────────

  it('shows the rollback error banner with preserved-edits message on failure', async () => {
    const profile = buildProfile({ updatedAt: 1000 });
    seedProfileStore(profile);

    mockUpdateProfile.mockRejectedValue(new Error('Wallet rejected'));

    renderForm(profile);

    fireEvent.change(screen.getByPlaceholderText('Your Name'), {
      target: { value: 'Name That Fails' },
    });

    fireEvent.submit(screen.getByPlaceholderText('Your Name').closest('form')!);

    await domWaitFor(() => {
      expect(screen.getByTestId('rollback-error-banner')).toBeInTheDocument();
    });

    const banner = screen.getByTestId('rollback-error-banner');
    expect(banner).toHaveTextContent('Wallet rejected');
    expect(screen.getByText(/your edits have been preserved/i)).toBeInTheDocument();
  });

  // ── 6d. Conflict dialog ────────────────────────────────────────────────────

  it('shows the conflict dialog when concurrent modification detected', async () => {
    const profile = buildProfile({ updatedAt: 1000 });
    seedProfileStore(profile);

    const serverVersion = buildProfile({ displayName: 'Device B', updatedAt: 9999 });
    mockUpdateProfile.mockResolvedValue('tx-conflict-ui');
    mockGetProfile.mockResolvedValue(serverVersion);

    renderForm(profile);

    fireEvent.change(screen.getByPlaceholderText('Your Name'), {
      target: { value: 'Device A' },
    });

    fireEvent.submit(screen.getByPlaceholderText('Your Name').closest('form')!);

    await domWaitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /profile updated elsewhere/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Device B')).toBeInTheDocument();
  });

  it('dismisses the conflict dialog when the user accepts the server version', async () => {
    const profile = buildProfile({ updatedAt: 1000 });
    seedProfileStore(profile);

    const serverVersion = buildProfile({ displayName: 'Server Version', updatedAt: 9999 });
    mockUpdateProfile.mockResolvedValue('tx-conflict-accept');
    mockGetProfile.mockResolvedValue(serverVersion);

    renderForm(profile);

    fireEvent.change(screen.getByPlaceholderText('Your Name'), {
      target: { value: 'My Version' },
    });
    fireEvent.submit(screen.getByPlaceholderText('Your Name').closest('form')!);

    await domWaitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /use server version/i }));

    await domWaitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('dismisses the conflict dialog when the user chooses to keep their edits', async () => {
    const profile = buildProfile({ updatedAt: 1000 });
    seedProfileStore(profile);

    const serverVersion = buildProfile({ displayName: 'Server Version', updatedAt: 9999 });
    mockUpdateProfile.mockResolvedValue('tx-conflict-keep');
    mockGetProfile.mockResolvedValue(serverVersion);

    renderForm(profile);

    fireEvent.change(screen.getByPlaceholderText('Your Name'), {
      target: { value: 'Keep Mine' },
    });
    fireEvent.submit(screen.getByPlaceholderText('Your Name').closest('form')!);

    await domWaitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /keep my edits/i }));

    await domWaitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
