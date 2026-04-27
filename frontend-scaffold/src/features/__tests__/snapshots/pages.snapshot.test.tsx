/**
 * Visual regression snapshot tests for Tipz page-level and section components.
 *
 * framer-motion is mocked so snapshots are deterministic — motion props
 * (initial, animate, variants, …) are stripped and the underlying HTML element
 * is rendered directly, which is what matters for visual-regression purposes.
 *
 * To update baselines after intentional changes run:
 *   npm test -- --update-snapshots
 *   (or: npx vitest run --update-snapshots)
 */

import React from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Strip framer-motion so snapshots are deterministic (no animation state).
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({ children, ...rest }: React.HTMLAttributes<HTMLElement>) =>
          React.createElement(tag, rest, children),
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useInView: () => true,
  useAnimation: () => ({ start: vi.fn() }),
}));

// Silence usePageTitle side-effects (sets document.title).
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import HowItWorksSection from '../../landing/HowItWorksSection';
import FeaturesSection from '../../landing/FeaturesSection';
import CreatorNotFound from '../../tipping/CreatorNotFound';
import NotFoundPage from '../../not-found/NotFoundPage';

// ── Helper ────────────────────────────────────────────────────────────────────

function withRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

// ── HowItWorksSection ─────────────────────────────────────────────────────────

describe('HowItWorksSection snapshots', () => {
  it('renders four steps with icons and descriptions', () => {
    const { container } = render(<HowItWorksSection />);
    expect(container).toMatchSnapshot();
  });
});

// ── FeaturesSection ───────────────────────────────────────────────────────────

describe('FeaturesSection snapshots', () => {
  it('renders all feature cards', () => {
    const { container } = render(<FeaturesSection />);
    expect(container).toMatchSnapshot();
  });
});

// ── CreatorNotFound ───────────────────────────────────────────────────────────

describe('CreatorNotFound snapshots', () => {
  it('with a known username', () => {
    const { container } = withRouter(<CreatorNotFound username="alice" />);
    expect(container).toMatchSnapshot();
  });

  it('with no username (fallback to "unknown")', () => {
    const { container } = withRouter(<CreatorNotFound />);
    expect(container).toMatchSnapshot();
  });
});

// ── NotFoundPage ──────────────────────────────────────────────────────────────

describe('NotFoundPage snapshots', () => {
  it('renders 404 page with navigation links', () => {
    const { container } = withRouter(<NotFoundPage />);
    expect(container).toMatchSnapshot();
  });
});
