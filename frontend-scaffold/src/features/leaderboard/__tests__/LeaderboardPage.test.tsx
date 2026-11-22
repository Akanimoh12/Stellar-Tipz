import React from 'react';
import { render, screen, waitFor, cleanup, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const leaderboardHookState = vi.hoisted(() => ({
  entries: [] as LeaderboardEntry[],
  loading: false,
  error: null as string | null,
  hasMore: false,
  loadMore: vi.fn(),
  refetch: vi.fn(),
}));

// NOTE: these hooks are dynamically mocked in beforeEach via vi.doMock()
vi.mock('@/hooks/useLeaderboard', () => ({
  useLeaderboard: () => leaderboardHookState,
}));

vi.mock('@/hooks/usePageMeta', () => ({
  usePageMeta: vi.fn(),
}));

const mockUseWalletStore = vi.fn();

// These mocks apply the selector when provided so that components that call
// useWalletStore((state) => state.publicKey) receive the selected primitive
// value rather than the full state object (which would cause .toLowerCase()
// to throw a TypeError in LeaderboardRow / LeaderboardTable).
vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector?: (s: unknown) => unknown) => {
    const state = mockUseWalletStore();
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

// Also mock via barrel store path (LeaderboardRow imports from '../../store')
vi.mock('../../store', () => ({
  useWalletStore: (selector?: (s: unknown) => unknown) => {
    const state = mockUseWalletStore();
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

const mockIsFavorite = vi.fn().mockReturnValue(false);
const mockToggleFavorite = vi.fn();
vi.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({
    isFavorite: mockIsFavorite,
    toggleFavorite: mockToggleFavorite,
    favorites: [],
    recordTip: vi.fn(),
    sortedFavorites: vi.fn().mockReturnValue([]),
    removeFavorite: vi.fn(),
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import type { LeaderboardEntry } from '@/types/contract';
import LeaderboardPage from '../LeaderboardPage';

function buildEntry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    address: 'GABC123',
    username: 'testuser',
    totalTipsReceived: '1000000',
    creditScore: 50,
    ...overrides,
  };
}

function setLeaderboardState(state: {
  entries?: LeaderboardEntry[];
  loading?: boolean;
  error?: string | null;
}) {
  leaderboardHookState.entries = state.entries ?? [];
  leaderboardHookState.loading = state.loading ?? false;
  leaderboardHookState.error = state.error ?? null;
  leaderboardHookState.hasMore = false;
  leaderboardHookState.loadMore = vi.fn();
  leaderboardHookState.refetch = vi.fn();
}

function setWalletConnected(publicKey = 'GTEST123') {
  mockUseWalletStore.mockReturnValue({
    connected: true,
    publicKey,
  });
}

function setWalletDisconnected() {
  mockUseWalletStore.mockReturnValue({
    connected: false,
    publicKey: null,
  });
}

function renderPage() {
  return render(
    <BrowserRouter>
      <LeaderboardPage />
    </BrowserRouter>,
  );
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('LeaderboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setWalletDisconnected();
    mockIsFavorite.mockReturnValue(false);
    setLeaderboardState({ entries: [], loading: false, error: null });
  });

  afterEach(() => {
    cleanup();
  });

  // ── Sub-task 5.1: Property 7 – Leaderboard renders every entry's username ──

  it(
    // Feature: storage-key-collision-and-ui-tests, Property 7: Leaderboard renders every entry's username
    'Property 7 – renders every entry username in the DOM (Validates: Requirements 7.1)',
    () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              address: fc.uuid().map((u) => `G${u.replace(/-/g, '').toUpperCase().slice(0, 20)}`),
              username: fc
                .string({ minLength: 3, maxLength: 20 })
                .filter((s) => /^[a-zA-Z0-9_]+$/.test(s)),
              totalTipsReceived: fc.nat().map(String),
              creditScore: fc.integer({ min: 0, max: 100 }),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          (entries) => {
            // Ensure unique addresses to avoid React key conflicts
            const uniqueEntries = entries.reduce<LeaderboardEntry[]>((acc, entry) => {
              if (!acc.find((e) => e.address === entry.address)) {
                acc.push(entry);
              }
              return acc;
            }, []);

            if (uniqueEntries.length === 0) return;

            setLeaderboardState({ entries: uniqueEntries, loading: false, error: null });

            const container = document.createElement('div');
            document.body.appendChild(container);

            const { unmount } = render(
              <BrowserRouter>
                <LeaderboardPage />
              </BrowserRouter>,
              { container },
            );

            // Every username must appear at least once in the DOM
            uniqueEntries.forEach((entry) => {
              expect(container.textContent ?? '').toContain(entry.username);
            });

            unmount();
            document.body.removeChild(container);
          },
        ),
        { numRuns: 100 },
      );
    },
    20000,
  );

  // ── Sub-task 5.2: Unit tests for LeaderboardPage example flows ─────────────

  describe('5.2 Unit tests – example flows', () => {
    it('shows empty-state message when entries list is empty (Req 7.2)', () => {
      setLeaderboardState({ entries: [], loading: false, error: null });

      renderPage();

      expect(
        screen.getAllByText(/no creators found on the leaderboard yet/i).length,
      ).toBeGreaterThan(0);
    });

    it('navigates to /@{username} when a creator row link is clicked (Req 7.3)', () => {
      const entry = buildEntry({ address: 'GTEST456', username: 'clickme' });
      setLeaderboardState({ entries: [entry], loading: false, error: null });

      renderPage();

      // LeaderboardPage renders a <Link to={`/@${entry.username}`}> inside the table row
      const link = screen.getAllByRole('link', { name: new RegExp(entry.username, 'i') })[0];
      expect(link).toHaveAttribute('href', `/@${entry.username}`);
    });

    it('renders skeleton loading state when data is loading (Req 7.4)', () => {
      setLeaderboardState({ entries: [], loading: true, error: null });

      renderPage();

      // More specifically, the skeleton container has aria-busy
      const busyEls = document.querySelectorAll('[aria-busy="true"]');
      expect(busyEls.length).toBeGreaterThan(0);
    });

    it('renders error state with retry option when fetch fails (Req 7.5)', () => {
      setLeaderboardState({ entries: [], loading: false, error: 'Failed to fetch leaderboard data' });

      renderPage();

      // ErrorState renders a "Try Again" button when onRetry is provided
      expect(screen.getAllByRole('button', { name: /try again/i }).length).toBeGreaterThan(0);
    });
  });
});
