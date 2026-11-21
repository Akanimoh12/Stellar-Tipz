/** @jsxImportSource react */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import ErrorBoundary, { FeatureErrorBoundary } from '../ErrorBoundary';

const captureError = vi.hoisted(() => vi.fn());

vi.mock('@/services/sentry', () => ({
  captureError,
}));

const originalConsoleError = console.error;

beforeEach(() => {
  console.error = vi.fn();
  captureError.mockClear();
});

afterEach(() => {
  console.error = originalConsoleError;
});

const ThrowError = ({ message = 'Test error' }: { message?: string }) => {
  throw new Error(message);
};

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('catches render errors and shows a feature fallback with retry', () => {
    render(
      <FeatureErrorBoundary name="widget">
        <ThrowError />
      </FeatureErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText("This section couldn't load")).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    expect(screen.queryByText('Test error')).not.toBeInTheDocument();
  });

  it('root boundary offers try again, reload, and go home', () => {
    const reload = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload, assign });

    render(
      <ErrorBoundary level="root" name="app">
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(screen.getByText('The app hit a problem')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    expect(screen.getByText('Reload now')).toBeInTheDocument();
    expect(screen.getByText('Go Home')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Reload now'));
    expect(reload).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Go Home'));
    expect(assign).toHaveBeenCalledWith('/');

    vi.unstubAllGlobals();
  });

  it('recovers on Try Again click', async () => {
    let shouldThrow = true;
    const Component = () => {
      if (shouldThrow) throw new Error('Test error');
      return <div>Recovered</div>;
    };

    render(
      <ErrorBoundary>
        <Component />
      </ErrorBoundary>,
    );

    expect(screen.getByText("This section couldn't load")).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText('Try Again'));

    await waitFor(() => {
      expect(screen.getByText('Recovered')).toBeInTheDocument();
    });
  });

  it('reports caught errors to sentry', () => {
    render(
      <ErrorBoundary level="feature" name="dashboard-tips">
        <ThrowError message="boom" />
      </ErrorBoundary>,
    );

    expect(captureError).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
      expect.objectContaining({
        boundary: 'feature',
        feature: 'dashboard-tips',
      }),
    );
  });

  it('isolates a failed feature so siblings still render', () => {
    render(
      <div>
        <FeatureErrorBoundary name="broken">
          <ThrowError />
        </FeatureErrorBoundary>
        <FeatureErrorBoundary name="healthy">
          <div>Healthy widget</div>
        </FeatureErrorBoundary>
      </div>,
    );

    expect(screen.getByText("This section couldn't load")).toBeInTheDocument();
    expect(screen.getByText('Healthy widget')).toBeInTheDocument();
  });

  it('never exposes stack traces to users in production', () => {
    const originalEnv = import.meta.env;
    Object.defineProperty(import.meta, 'env', {
      value: { ...originalEnv, DEV: false, PROD: true, MODE: 'production' },
      configurable: true,
    });

    const err = new Error('secret-failure');
    err.stack = 'Error: secret-failure\n    at ExplosiveWidget';

    const Explosive = () => {
      throw err;
    };

    render(
      <ErrorBoundary level="root" name="app">
        <Explosive />
      </ErrorBoundary>,
    );

    expect(screen.queryByText(/secret-failure/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ExplosiveWidget/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Stack Trace/i)).not.toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();

    Object.defineProperty(import.meta, 'env', {
      value: originalEnv,
      configurable: true,
    });
  });

  it('respects custom fallback prop', () => {
    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('calls onReset prop when retrying', () => {
    const mockOnReset = vi.fn();
    let shouldThrow = true;
    const Component = () => {
      if (shouldThrow) throw new Error('Test error');
      return <div>Content</div>;
    };

    render(
      <ErrorBoundary onReset={mockOnReset}>
        <Component />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByText('Try Again'));

    expect(mockOnReset).toHaveBeenCalled();
  });
});
