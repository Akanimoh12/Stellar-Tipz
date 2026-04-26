import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import PageTransition from '../PageTransition';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('PageTransition', () => {
  beforeEach(() => {
    // Reset matchMedia mock
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders children without errors', () => {
    render(
      <BrowserRouter>
        <PageTransition>
          <div>Test Content</div>
        </PageTransition>
      </BrowserRouter>
    );
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('applies data-motion attribute when animation is enabled', () => {
    render(
      <BrowserRouter>
        <PageTransition animationType="fade">
          <div>Test Content</div>
        </PageTransition>
      </BrowserRouter>
    );
    const motionDiv = screen.getByText('Test Content').closest('[data-motion]');
    expect(motionDiv).toBeInTheDocument();
    expect(motionDiv).toHaveAttribute('data-motion', 'true');
  });

  it('does not apply data-motion attribute when animation is disabled', () => {
    render(
      <BrowserRouter>
        <PageTransition animationType="none">
          <div>Test Content</div>
        </PageTransition>
      </BrowserRouter>
    );
    const motionDiv = screen.getByText('Test Content').closest('[data-motion]');
    expect(motionDiv).toBeNull();
  });

  it('respects prefers-reduced-motion setting', () => {
    // Mock reduced motion preference
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(
      <BrowserRouter>
        <PageTransition animationType="fade">
          <div>Test Content</div>
        </PageTransition>
      </BrowserRouter>
    );
    const motionDiv = screen.getByText('Test Content').closest('[data-motion]');
    expect(motionDiv).toBeNull();
  });

  it('uses custom animation when provided', () => {
    const customAnimation = {
      initial: { opacity: 0, scale: 0.8 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.8 },
      transition: { duration: 0.5 },
    };

    render(
      <BrowserRouter>
        <PageTransition customAnimation={customAnimation}>
          <div>Test Content</div>
        </PageTransition>
      </BrowserRouter>
    );
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('animates on route change', async () => {
    const TestComponent = () => {
      const navigate = useNavigate();
      return (
        <div>
          <button onClick={() => navigate('/leaderboard')}>Navigate</button>
          <PageTransition animationType="fade">
            <div>Current Page</div>
          </PageTransition>
        </div>
      );
    };

    render(
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TestComponent />} />
          <Route path="/leaderboard" element={<div>Leaderboard</div>} />
        </Routes>
      </BrowserRouter>
    );

    const motionDiv = screen.getByText('Current Page').closest('[data-motion]');
    expect(motionDiv).toBeInTheDocument();
  });

  it('defaults to fade animation type', () => {
    render(
      <BrowserRouter>
        <PageTransition>
          <div>Test Content</div>
        </PageTransition>
      </BrowserRouter>
    );
    const motionDiv = screen.getByText('Test Content').closest('[data-motion]');
    expect(motionDiv).toBeInTheDocument();
  });

  it('handles slide animation type', () => {
    render(
      <BrowserRouter>
        <PageTransition animationType="slide">
          <div>Test Content</div>
        </PageTransition>
      </BrowserRouter>
    );
    const motionDiv = screen.getByText('Test Content').closest('[data-motion]');
    expect(motionDiv).toBeInTheDocument();
  });
});
