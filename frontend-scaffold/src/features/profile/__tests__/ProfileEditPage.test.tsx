import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockUseProfile = vi.fn();
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => mockUseProfile(),
}));

// Also mock via barrel export path
vi.mock('@/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/hooks')>('@/hooks');
  return {
    ...actual,
    useProfile: () => mockUseProfile(),
  };
});

// Mock useProfileUpdate so ProfileEditPage navigation test does not depend on
// hook internals (useContract path resolution across module aliases).
const mockSubmitUpdate = vi.fn();
const mockResetError = vi.fn();
const mockResolveConflict = vi.fn();
vi.mock('@/hooks/useProfileUpdate', () => ({
  useProfileUpdate: () => ({
    submitUpdate: mockSubmitUpdate,
    resetError: mockResetError,
    resolveConflict: mockResolveConflict,
  }),
}));

const mockAddToast = vi.fn();
vi.mock('@/store/toastStore', () => ({
  useToastStore: () => ({ addToast: mockAddToast }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import ProfileEditPage from '../ProfileEditPage';
import type { Profile } from '@/types/contract';
import { useProfileStore } from '@/store/profileStore';

function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    owner: 'GABC123',
    username: 'testuser',
    displayName: 'Test User',
    bio: 'A short bio',
    imageUrl: 'https://example.com/avatar.png',
    xHandle: 'testhandle',
    xFollowers: 0,
    xEngagementAvg: 0,
    creditScore: 50,
    totalTipsReceived: '0',
    totalTipsCount: 0,
    balance: '0',
    registeredAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function seedStore(profile: Profile) {
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

function setProfileLoaded(profile: Profile) {
  mockUseProfile.mockReturnValue({
    profile,
    loading: false,
    error: null,
    isRegistered: true,
    refetch: vi.fn(),
  });
}

function setProfileLoading() {
  mockUseProfile.mockReturnValue({
    profile: null,
    loading: true,
    error: null,
    isRegistered: false,
    refetch: vi.fn(),
  });
}

function setNoProfile() {
  mockUseProfile.mockReturnValue({
    profile: null,
    loading: false,
    error: null,
    isRegistered: false,
    refetch: vi.fn(),
  });
}

function renderPage() {
  return render(
    <BrowserRouter>
      <ProfileEditPage />
    </BrowserRouter>,
  );
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('ProfileEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: submitUpdate resolves successfully (no navigation side-effect)
    mockSubmitUpdate.mockResolvedValue('tx-hash-default');
  });

  // ── Property 6: ProfileEditPage pre-populates all editable fields ──────────

  it(
    'Property 6 – pre-populates all editable fields from profile (Validates: Requirements 6.1)',
    () => {
      const nonEmptyPrintable = fc
        .string({ minLength: 1, maxLength: 64 })
        .filter((s) => s.trim().length > 0);

      const optionalPrintable = fc
        .string({ minLength: 1, maxLength: 30 })
        .filter((s) => s.trim().length > 0);

      fc.assert(
        fc.property(
          fc.record({
            displayName: nonEmptyPrintable,
            bio: fc.option(optionalPrintable, { nil: '' }),
            imageUrl: fc.constant('https://example.com/img.png'),
            xHandle: fc.option(optionalPrintable, { nil: '' }),
          }),
          ({ displayName, bio, imageUrl, xHandle }) => {
            const profile = buildProfile({
              displayName,
              bio: bio ?? '',
              imageUrl,
              xHandle: xHandle ?? '',
            });
            mockUseProfile.mockReturnValue({
              profile,
              loading: false,
              error: null,
              isRegistered: true,
              refetch: vi.fn(),
            });
            seedStore(profile);

            const container = document.createElement('div');
            document.body.appendChild(container);

            const { unmount } = render(
              <BrowserRouter>
                <ProfileEditPage />
              </BrowserRouter>,
              { container },
            );

            const { getByPlaceholderText } = within(container);

            const displayNameInput = getByPlaceholderText('Your Name');
            expect(displayNameInput).toHaveValue(displayName);

            const bioTextarea = getByPlaceholderText(/tell supporters/i);
            expect(bioTextarea).toHaveValue(bio ?? '');

            // codeql[js/regex/missing-regexp-anchor]
            // False positive. This is a test-only placeholder matcher against a
            // hardcoded example.com fixture, not URL validation. Anchoring it
            // would break the match, which is the point of the helper.
            const imageUrlInput = getByPlaceholderText(/https:\/\/example\.com\/avatar/i);
            expect(imageUrlInput).toHaveValue(imageUrl);

            const xHandleInput = getByPlaceholderText('@yourhandle');
            expect(xHandleInput).toHaveValue(xHandle ?? '');

            unmount();
            document.body.removeChild(container);
          },
        ),
        { numRuns: 100 },
      );
    },
    15000,
  );

  // ── Sub-task 4.2: Unit tests for ProfileEditPage example flows ─────────────

  describe('4.2 Unit tests – example flows', () => {
    it('navigates to /profile after successful edit (Req 6.2)', async () => {
      const profile = buildProfile();
      setProfileLoaded(profile);
      seedStore(profile);

      // submitUpdate resolves successfully; navigate is called by the form on success.
      mockSubmitUpdate.mockResolvedValue('tx-hash-xyz');

      renderPage();

      // Change the display name so the form detects a diff
      const displayNameInput = screen.getByDisplayValue(profile.displayName);
      await userEvent.clear(displayNameInput);
      await userEvent.type(displayNameInput, 'New Display Name');

      const form = displayNameInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(
        () => {
          expect(mockNavigate).toHaveBeenCalledWith('/profile');
        },
        { timeout: 3000 },
      );
    });

    it('redirects to /register when no profile is registered (Req 6.3)', async () => {
      setNoProfile();

      renderPage();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/register', { replace: true });
      });
    });

    it('shows loading indicator while profile data is loading (Req 6.4)', () => {
      setProfileLoading();

      renderPage();

      expect(screen.getByTestId('profile-skeleton')).toBeInTheDocument();
    });
  });
});
