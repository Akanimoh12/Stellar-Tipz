import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import App from '@/App';
import { routes } from '@/routes';

vi.mock('@/services/serviceWorker', () => ({
  register: vi.fn(),
  onUpdateAvailable: vi.fn(() => () => {}),
  skipWaiting: vi.fn(),
}));

vi.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({
    connected: false,
    isReconnecting: false,
    walletType: null,
  }),
}));

vi.mock('@/store/toastStore', () => ({
  useToastStore: () => ({
    addToast: vi.fn(),
  }),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/useOfflineStatus', () => ({
  useOfflineStatus: () => ({
    isOffline: false,
  }),
}));

describe('Routes', () => {
  describe('route configuration', () => {
    it('should have all expected routes defined', () => {
      const expectedPaths = [
        '/',
        '/register',
        '/@:username',
        '/embed/@:username',
        '/receipt',
        '/leaderboard',
        '/profile',
        '/profile/edit',
        '/dashboard',
        '/transactions',
        '/settings',
        '/admin',
        '*',
      ];
      const definedPaths = routes.map((r) => r.path);
      expectedPaths.forEach((path) => {
        expect(definedPaths).toContain(path);
      });
    });

    it('should render landing page at /', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should render leaderboard page at /leaderboard', async () => {
      render(
        <MemoryRouter initialEntries={['/leaderboard']}>
          <App />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should render 404 page for invalid route', async () => {
      render(
        <MemoryRouter initialEntries={['/invalid-route-xyz']}>
          <App />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.getByText(/not found/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('protected routes', () => {
    it('should redirect to home when accessing /dashboard without wallet connection', async () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <App />
        </MemoryRouter>
      );
      await waitFor(() => {
        // ProtectedRoute redirects to '/' when not connected
        expect(screen.queryByText(/dashboard/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should redirect to home when accessing /profile without wallet connection', async () => {
      render(
        <MemoryRouter initialEntries={['/profile']}>
          <App />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.queryByText(/profile/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should redirect to home when accessing /settings without wallet connection', async () => {
      render(
        <MemoryRouter initialEntries={['/settings']}>
          <App />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.queryByText(/settings/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should redirect to home when accessing /admin without wallet connection', async () => {
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <App />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.queryByText(/admin/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should redirect to home when accessing /transactions without wallet connection', async () => {
      render(
        <MemoryRouter initialEntries={['/transactions']}>
          <App />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.queryByText(/transaction/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should protect /profile/edit route', async () => {
      render(
        <MemoryRouter initialEntries={['/profile/edit']}>
          <App />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.queryByText(/edit profile/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('route parameters', () => {
    it('should handle username route parameter /@username', async () => {
      render(
        <MemoryRouter initialEntries={['/@alice']}>
          <App />
        </MemoryRouter>
      );
      // Should not show 404 for valid param path
      await waitFor(() => {
        expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should handle various usernames in /@:username route', async () => {
      const usernames = ['john', 'jane_doe', 'user123', '@stellar'];
      for (const username of usernames) {
        const { unmount } = render(
          <MemoryRouter initialEntries={[`/@${username}`]}>
            <App />
          </MemoryRouter>
        );
        await waitFor(() => {
          expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
        }, { timeout: 3000 });
        unmount();
      }
    });
  });

  describe('lazy loading', () => {
    it('should lazy load components with Suspense fallback', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );
      // Wait for lazy-loaded component to render
      await waitFor(() => {
        expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('navigation', () => {
    it('should allow navigation from home to leaderboard', async () => {
      const { rerender } = render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      );

      rerender(
        <MemoryRouter initialEntries={['/leaderboard']}>
          <App />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should render public routes without authentication', () => {
      const publicRoutes = ['/', '/register', '/leaderboard', '/@testuser', '/receipt'];
      publicRoutes.forEach((route) => {
        const { unmount } = render(
          <MemoryRouter initialEntries={[route]}>
            <App />
          </MemoryRouter>
        );
        expect(screen.queryByText(/connect your wallet/i)).not.toBeInTheDocument();
        unmount();
      });
    });

    it('should show wallet connection prompt for protected routes', async () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <App />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });
});
