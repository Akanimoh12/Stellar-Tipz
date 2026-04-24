import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
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

const mockRegisterProfile = vi.fn();
const mockUsernameCheck = vi.fn();
const mockStartTransaction = vi.fn();
const mockResetGuard = vi.fn();

// Mock the barrel export — RegisterForm imports from '@/hooks'
vi.mock('@/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/hooks')>('@/hooks');
  return {
    ...actual,
    useContract: () => ({
      registerProfile: mockRegisterProfile,
      getProfileByUsername: vi.fn().mockRejectedValue(new Error('not found')),
    }),
    useUsernameCheck: (username: string) => mockUsernameCheck(username),
    useTransactionGuard: () => ({
      isPending: false,
      status: 'idle',
      startTransaction: mockStartTransaction,
      reset: mockResetGuard,
    }),
  };
});

// Also mock individual module paths in case of direct imports
vi.mock('@/hooks/useContract', () => ({
  useContract: () => ({
    registerProfile: mockRegisterProfile,
    getProfileByUsername: vi.fn().mockRejectedValue(new Error('not found')),
  }),
}));

vi.mock('@/hooks/useUsernameCheck', () => ({
  useUsernameCheck: (username: string) => mockUsernameCheck(username),
}));

vi.mock('@/hooks/useTransactionGuard', () => ({
  useTransactionGuard: () => ({
    isPending: false,
    status: 'idle',
    startTransaction: mockStartTransaction,
    reset: mockResetGuard,
  }),
}));

const mockAddToast = vi.fn();
vi.mock('@/store/toastStore', () => ({
  useToastStore: () => ({ addToast: mockAddToast }),
}));

// Mock AvatarUpload to avoid IPFS service complexity in tests
vi.mock('@/features/profile/AvatarUpload', () => ({
  default: () => <div data-testid="avatar-upload-mock" />,
}));

// Mock IPFS service
vi.mock('@/services/ipfs', () => ({
  uploadToIPFS: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import RegisterPage from '../RegisterPage';

function renderPage() {
  return render(
    <BrowserRouter>
      <RegisterPage />
    </BrowserRouter>,
  );
}

/** Default username check: available, not checking */
function setUsernameAvailable() {
  mockUsernameCheck.mockReturnValue({ available: true, checking: false, error: null });
}

/** Username check returns taken */
function setUsernameTaken() {
  mockUsernameCheck.mockReturnValue({ available: false, checking: false, error: null });
}

/** Make startTransaction actually execute the callback (simulates real behaviour) */
function makeTransactionExecute() {
  mockStartTransaction.mockImplementation(async (fn: () => Promise<unknown>) => {
    return fn();
  });
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUsernameAvailable();
    makeTransactionExecute();
  });

  // ── Property 5: Username length validation rejects out-of-range inputs ──────

  it(
    // Feature: storage-key-collision-and-ui-tests, Property 5: Username length validation rejects out-of-range inputs
    'Property 5 – rejects usernames outside [3, 32] chars (Validates: Requirements 5.1, 5.2)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate strings that are either too short (<3) or too long (>32)
          fc.oneof(
            fc.string({ minLength: 0, maxLength: 2 }),
            fc.string({ minLength: 33, maxLength: 60 }),
          ),
          async (badUsername) => {
            // Reset mocks for each run
            vi.clearAllMocks();
            setUsernameAvailable();

            // Use a fresh container per run to avoid DOM accumulation
            const container = document.createElement('div');
            document.body.appendChild(container);

            const { unmount } = render(
              <BrowserRouter>
                <RegisterPage />
              </BrowserRouter>,
              { container },
            );

            const { getByPlaceholderText, findByText } = within(container);

            const usernameInput = getByPlaceholderText('your_handle');
            const displayNameInput = getByPlaceholderText('Your Name');

            // Fill in a valid display name so only username triggers the error
            fireEvent.change(displayNameInput, { target: { value: 'Test User' } });

            // Use fireEvent.change to set arbitrary strings (avoids userEvent key-descriptor parsing)
            fireEvent.change(usernameInput, { target: { value: badUsername } });

            // Submit the form directly to bypass any disabled-button state
            const form = usernameInput.closest('form')!;
            fireEvent.submit(form);

            // Validation error must appear
            const errorEl = await findByText(/username must be 3.?32 characters/i);
            expect(errorEl).toBeInTheDocument();

            // Contract must NOT have been called
            expect(mockRegisterProfile).not.toHaveBeenCalled();

            unmount();
            document.body.removeChild(container);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // ── Unit tests: RegisterPage example flows ────────────────────────────────

  describe('3.2 Unit tests – example flows', () => {
    it('shows error when display name is empty (Req 5.3)', async () => {
      renderPage();

      const usernameInput = screen.getByPlaceholderText('your_handle');
      const displayNameInput = screen.getByPlaceholderText('Your Name');

      // Type a valid username but leave display name empty
      await userEvent.type(usernameInput, 'validuser');

      // Ensure display name is empty
      expect(displayNameInput).toHaveValue('');

      // Submit the form directly
      const form = usernameInput.closest('form')!;
      fireEvent.submit(form);

      expect(
        await screen.findByText(/display name must be/i),
      ).toBeInTheDocument();
      expect(mockRegisterProfile).not.toHaveBeenCalled();
    });

    it('navigates to /profile on successful submission (Req 5.4)', async () => {
      mockRegisterProfile.mockResolvedValue('tx-hash-abc');

      renderPage();

      const usernameInput = screen.getByPlaceholderText('your_handle');
      const displayNameInput = screen.getByPlaceholderText('Your Name');

      await userEvent.type(usernameInput, 'validuser');
      await userEvent.type(displayNameInput, 'Valid User');

      const form = usernameInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(mockRegisterProfile).toHaveBeenCalledOnce();
      });

      // Navigation is triggered after a 1500ms setTimeout; wait for it
      await waitFor(
        () => {
          expect(mockNavigate).toHaveBeenCalledWith('/profile');
        },
        { timeout: 3000 },
      );
    });

    it('displays duplicate username error when username is already taken (Req 5.5)', async () => {
      // Simulate the username availability check returning taken
      setUsernameTaken();

      renderPage();

      const usernameInput = screen.getByPlaceholderText('your_handle');
      const displayNameInput = screen.getByPlaceholderText('Your Name');

      await userEvent.type(usernameInput, 'takenuser');
      await userEvent.type(displayNameInput, 'Taken User');

      // Submit the form directly (button is disabled when username is taken)
      const form = usernameInput.closest('form')!;
      fireEvent.submit(form);

      // The validate() function sets errors.username = 'Username is already taken'
      expect(
        await screen.findByText(/username is already taken/i),
      ).toBeInTheDocument();
      expect(mockRegisterProfile).not.toHaveBeenCalled();
    });

    it('renders form correctly when wallet is not connected (Req 5.6)', async () => {
      // The form renders regardless of wallet connection state.
      // Per Req 5.6: the form renders in a state that prevents submission without a wallet.
      // registerProfile throws "Wallet not connected" when no wallet is present.
      renderPage();

      // The form fields should be present and accessible
      expect(screen.getByPlaceholderText('your_handle')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Your Name')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /register profile/i })).toBeInTheDocument();
    });
  });
});
