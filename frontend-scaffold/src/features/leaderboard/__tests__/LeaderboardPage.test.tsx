import React from 'react';
import { render, screen, waitFor, cleanup, within, fireEvent } from '@testing-library/react';
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

const mockUseLeaderboard = vi.fn();
vi.mock('@/hooks/useLeaderboard', () => ({
  useLeaderboard: () => mockUseLeaderboard(),
}));

vi.mock('@/hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

const mockUseWalletStore = vi.fn();
vi.mock('@/store/walletStore', () => ({
  useWalletStore: () => mockUseWalletStore(),
}));

// Also mock via barrel store path (LeaderboardRow imports from '../../store')
vi.mock('../../store', () => ({
  useWalletStore: () => mockUseWalletStore(),
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

import LeaderboardPage from '../LeaderboardPage';
import type { LeaderboardEntry } from '@/types/contract';

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
  mockUseLeaderboard.mockReturnValue({
    entries: state.entries ?? [],
    loading: state.loading ?? false,
    error: state.error ?? null,
    refetch: vi.fn(),
  });
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
              const matches = container.querySelectorAll('*');
              const found = Array.from(matches).some(
                (el) => el.textContent?.includes(entry.username),
              );
              expect(found).toBe(true);
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
        screen.getByText(/no creators found on the leaderboard yet/i),
      ).toBeInTheDocument();
    });

    it('navigates to /@{username} when a creator row link is clicked (Req 7.3)', async () => {
      const entry = buildEntry({ address: 'GTEST456', username: 'clickme' });
      setLeaderboardState({ entries: [entry], loading: false, error: null });

      renderPage();

      // LeaderboardPage renders a <Link to={`/@${entry.username}`}> inside the table row
      const link = screen.getByRole('link', { name: new RegExp(entry.username, 'i') });
      expect(link).toHaveAttribute('href', `/@${entry.username}`);
    });

    it('renders skeleton loading state when data is loading (Req 7.4)', () => {
      setLeaderboardState({ entries: [], loading: true, error: null });

      renderPage();

      // LeaderboardSkeleton renders with aria-busy="true"
      expect(screen.getByRole('main', { hidden: true }) ?? document.querySelector('[aria-busy="true"]')).toBeTruthy();
      // More specifically, the skeleton container has aria-busy
      const busyEl = document.querySelector('[aria-busy="true"]');
      expect(busyEl).not.toBeNull();
    });

    it('renders error state with retry option when fetch fails (Req 7.5)', () => {
      setLeaderboardState({ entries: [], loading: false, error: 'Failed to fetch leaderboard data' });

      renderPage();

      // ErrorState renders a "Try Again" button when onRetry is provided
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
  });
});
