import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import ConnectionStatusIndicator from '../ConnectionStatusIndicator';
import type { ConnectionState } from '@/services/eventStream';

expect.extend(toHaveNoViolations);

describe('ConnectionStatusIndicator', () => {
  describe('rendering of connection states', () => {
    it('returns null and does not render anything when state is "connected"', () => {
      const { container } = render(<ConnectionStatusIndicator state="connected" />);
      expect(container.firstChild).toBeNull();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('renders "Reconnecting..." with a pulsing yellow dot when state is "connecting"', () => {
      const { container } = render(<ConnectionStatusIndicator state="connecting" />);

      const status = screen.getByRole('status');
      expect(status).toBeInTheDocument();
      expect(screen.getByText('Reconnecting...')).toBeInTheDocument();

      const dot = container.querySelector('span[aria-hidden="true"]');
      expect(dot).toBeInTheDocument();
      expect(dot).toHaveClass('bg-yellow-400');
      expect(dot).toHaveClass('animate-pulse');
    });

    it('renders "Offline" with a gray dot without pulse when state is "disconnected"', () => {
      const { container } = render(<ConnectionStatusIndicator state="disconnected" />);

      const status = screen.getByRole('status');
      expect(status).toBeInTheDocument();
      expect(screen.getByText('Offline')).toBeInTheDocument();

      const dot = container.querySelector('span[aria-hidden="true"]');
      expect(dot).toBeInTheDocument();
      expect(dot).toHaveClass('bg-gray-400');
      expect(dot).not.toHaveClass('animate-pulse');
    });

    it('renders "Disconnected" with a red dot when state is "gave-up"', () => {
      const { container } = render(<ConnectionStatusIndicator state="gave-up" />);

      const status = screen.getByRole('status');
      expect(status).toBeInTheDocument();
      expect(screen.getByText('Disconnected')).toBeInTheDocument();

      const dot = container.querySelector('span[aria-hidden="true"]');
      expect(dot).toBeInTheDocument();
      expect(dot).toHaveClass('bg-red-500');
      expect(dot).not.toHaveClass('animate-pulse');
    });
  });

  describe('retry interactions', () => {
    it('renders a Retry button when state is "gave-up" and onRetry is provided', () => {
      const onRetry = vi.fn();
      render(<ConnectionStatusIndicator state="gave-up" onRetry={onRetry} />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
      expect(retryButton).toHaveAttribute('type', 'button');
    });

    it('calls onRetry callback when Retry button is clicked', async () => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      render(<ConnectionStatusIndicator state="gave-up" onRetry={onRetry} />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      await user.click(retryButton);

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('does not render Retry button when state is "gave-up" but onRetry is not provided', () => {
      render(<ConnectionStatusIndicator state="gave-up" />);
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    it('does not render Retry button for "connecting" or "disconnected" states even if onRetry is provided', () => {
      const onRetry = vi.fn();
      const { rerender } = render(
        <ConnectionStatusIndicator state="connecting" onRetry={onRetry} />,
      );
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();

      rerender(<ConnectionStatusIndicator state="disconnected" onRetry={onRetry} />);
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    it('handles state transition from connecting to connected and gave-up', () => {
      const { container, rerender } = render(
        <ConnectionStatusIndicator state="connecting" />,
      );
      expect(screen.getByText('Reconnecting...')).toBeInTheDocument();

      rerender(<ConnectionStatusIndicator state="connected" />);
      expect(container.firstChild).toBeNull();

      rerender(<ConnectionStatusIndicator state="gave-up" onRetry={vi.fn()} />);
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  describe('accessibility attributes', () => {
    it('has proper role and aria-live attributes', () => {
      render(<ConnectionStatusIndicator state="connecting" />);
      const statusElement = screen.getByRole('status');

      expect(statusElement).toHaveAttribute('role', 'status');
      expect(statusElement).toHaveAttribute('aria-live', 'polite');
    });

    it('hides the indicator dot from screen readers using aria-hidden', () => {
      const { container } = render(<ConnectionStatusIndicator state="disconnected" />);
      const dot = container.querySelector('span[aria-hidden="true"]');

      expect(dot).toBeInTheDocument();
      expect(dot).toHaveAttribute('aria-hidden', 'true');
    });

    it('has no accessibility violations across all visible states', async () => {
      const states: ConnectionState[] = ['connecting', 'disconnected', 'gave-up'];

      for (const state of states) {
        const { container, unmount } = render(
          <ConnectionStatusIndicator state={state} onRetry={vi.fn()} />,
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        unmount();
      }
    });
  });
});
