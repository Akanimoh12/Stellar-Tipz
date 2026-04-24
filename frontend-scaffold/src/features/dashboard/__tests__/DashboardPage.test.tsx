import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockUseDashboard = vi.fn();
vi.mock('@/hooks/useDashboard', () => ({
  useDashboard: () => mockUseDashboard(),
}));

const mockUseWalletStore = vi.fn();
vi.mock('@/store/walletStore', () => ({
  useWalletStore: () => mockUseWalletStore(),
}));

vi.mock('@/hooks/useTipNotifications', () => ({
  useTipNotifications: () => ({
    latestTip: null,
    markSeen: vi.fn(),
    unseenCount: 0,
    settings: { sound: false, desktop: false },
    updateSettings: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePageMeta', () => ({
  usePageMeta: vi.fn(),
}));

// Mock hooks used by child components
vi.mock('@/hooks/useContract', () => ({
  useContract: () => ({
    getProfile: vi.fn(),
    getStats: vi.fn(),
    getRecentTips: vi.fn().mockResolvedValue([]),
    withdrawTips: vi.fn(),
  }),
}));

vi.mock('@/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/hooks')>('@/hooks');
  return {
    ...actual,
    useTipz: () => ({
      withdrawTips: vi.fn(),
      withdrawing: false,
      error: null,
      txHash: null,
      reset: vi.fn(),
    }),
  };
});

vi.mock('@/store/toastStore', () => ({
  useToastStore: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({
    favorites: [],
    isFavorite: vi.fn().mockReturnValue(false),
    toggleFavorite: vi.fn(),
    sortedFavorites: vi.fn().mockReturnValue([]),
    removeFavorite: vi.fn(),
    recordTip: vi.fn(),
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import DashboardPage from '../DashboardPage';
import type { Profile, Tip, ContractStats } from '@/types/contract';

function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    owner: 'GABC123',
    username: 'testcreator',
    displayName: 'Test Creator',
    bio: 'A bio',
    imageUrl: '',
    xHandle: '',
    xFollowers: 0,
    xEngagementAvg: 0,
    creditScore: 75,
    totalTipsReceived: '10000000',
    totalTipsCount: 5,
    balance: '5000000',
    registeredAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function buildStats(overrides: Partial<ContractStats> = {}): ContractStats {
  return {
    totalCreators: 10,
    totalTipsCount: 100,
    totalTipsVolume: '1000000000',
    totalFeesCollected: '20000000',
    feeBps: 200,
    ...overrides,
  };
}

function setDashboardState(state: {
  profile?: Profile | null;
  tips?: Tip[];
  stats?: ContractStats | null;
  loading?: boolean;
  error?: string | null;
}) {
  mockUseDashboard.mockReturnValue({
    profile: state.profile ?? null,
    tips: state.tips ?? [],
    stats: state.stats ?? null,
    loading: state.loading ?? false,
    error: state.error ?? null,
    refetch: vi.fn(),
    applyOptimisticWithdrawal: vi.fn(),
    revertOptimisticWithdrawal: vi.fn(),
  });
}

function setWalletConnected(publicKey = 'GTEST123') {
  mockUseWalletStore.mockReturnValue({ connected: true, publicKey });
}

function setWalletDisconnected() {
  mockUseWalletStore.mockReturnValue({ connected: false, publicKey: null });
}

function renderPage() {
  return render(
    <BrowserRouter>
      <DashboardPage />
    </BrowserRouter>,
  );
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setWalletConnected();
  });

  // ── Sub-task 6.1: Property 8 – Dashboard displays profile stats ───────────

  it(
    // Feature: storage-key-collision-and-ui-tests, Property 8: Dashboard displays profile stats
    'Property 8 – renders tip count and credit score for any profile (Validates: Requirements 8.1)',
    () => {
      fc.assert(
        fc.property(
          fc.record({
            // Use min: 1 to avoid ambiguity with other zeros in the DOM
            creditScore: fc.integer({ min: 1, max: 100 }),
            // Tips this week is computed from the tips array; we pass a matching
            // set of recent tips so the rendered count equals tipsThisWeek.
            tipsThisWeek: fc.integer({ min: 1, max: 20 }),
          }),
          ({ creditScore, tipsThisWeek }) => {
            const nowSec = Math.floor(Date.now() / 1000);
            // Build tips that all fall within the last 7 days
            const tips = Array.from({ length: tipsThisWeek }, (_, i) => ({
              id: i,
              tipper: 'GTIPPER',
              creator: 'GABC123',
              amount: '1000000',
              message: '',
              timestamp: nowSec - i * 60, // each 1 minute apart, all within 7 days
            }));

            const profile = buildProfile({ creditScore });
            setDashboardState({ profile, tips, stats: buildStats(), loading: false, error: null });

            const container = document.createElement('div');
            document.body.appendChild(container);

            const { unmount } = render(
              <BrowserRouter>
                <DashboardPage />
              </BrowserRouter>,
              { container },
            );

            const allText = container.textContent ?? '';

            // Credit score is rendered directly as a number in the stat card
            expect(allText).toContain(String(creditScore));

            // Tips this week count is rendered in the "Tips This Week" stat card
            expect(allText).toContain(String(tipsThisWeek));

            unmount();
            document.body.removeChild(container);
          },
        ),
        { numRuns: 100 },
      );
    },
    20000,
  );

  // ── Sub-task 6.2: Unit tests for DashboardPage example flows ──────────────

  describe('6.2 Unit tests – example flows', () => {
    it('opens the withdraw modal when the withdraw button is clicked (Req 8.2)', () => {
      const profile = buildProfile({ balance: '50000000' }); // non-zero balance enables button
      setDashboardState({ profile, stats: buildStats(), loading: false, error: null });

      renderPage();

      // The withdraw button is rendered by QuickActions inside OverviewTab
      const withdrawBtn = screen.getByRole('button', { name: /withdraw/i });
      fireEvent.click(withdrawBtn);

      // WithdrawModal renders a dialog with aria-modal="true"
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Withdraw balance');
    });

    it('shows empty state when wallet is connected but no profile exists (Req 8.3)', () => {
      setDashboardState({ profile: null, loading: false, error: null });

      renderPage();

      expect(screen.getByText(/no creator profile yet/i)).toBeInTheDocument();
    });

    it('shows skeleton loading state while data is loading (Req 8.4)', () => {
      setDashboardState({ profile: null, loading: true, error: null });

      renderPage();

      // Loading state renders with aria-busy="true"
      const busyEl = document.querySelector('[aria-busy="true"]');
      expect(busyEl).not.toBeNull();
    });

    it('shows error state when dashboard data fetch fails (Req 8.5)', () => {
      setDashboardState({ profile: null, loading: false, error: 'Network error' });

      renderPage();

      // ErrorState renders a retry button
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
  });
});
