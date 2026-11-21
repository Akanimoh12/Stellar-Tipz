import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { wrap } from '@/helpers/routeHelpers';

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/services/sentry', () => ({
  captureError: vi.fn(),
}));

const CrashingPage: React.FC = () => {
  throw new Error('Route exploded');
};

const HealthyPage: React.FC = () => <main>Healthy page content</main>;

describe('Per-route ErrorBoundary (routeHelpers.wrap)', () => {
  const originalError = console.error;

  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('isolates a crashing route without blanking the outer app shell', () => {
    render(
      <MemoryRouter initialEntries={['/broken']}>
        <header>App Header</header>
        <Routes>
          <Route path="/broken" element={wrap(<CrashingPage />, undefined, 'route:/broken')} />
          <Route path="/healthy" element={wrap(<HealthyPage />, undefined, 'route:/healthy')} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('App Header')).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-error-boundary', 'route:/broken');
  });

  it('renders a healthy route cleanly even after another route has crashed', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/broken']}>
        <Routes>
          <Route path="/broken" element={wrap(<CrashingPage />, undefined, 'route:/broken')} />
          <Route path="/healthy" element={wrap(<HealthyPage />, undefined, 'route:/healthy')} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter initialEntries={['/healthy']}>
        <Routes>
          <Route path="/broken" element={wrap(<CrashingPage />, undefined, 'route:/broken')} />
          <Route path="/healthy" element={wrap(<HealthyPage />, undefined, 'route:/healthy')} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Healthy page content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
