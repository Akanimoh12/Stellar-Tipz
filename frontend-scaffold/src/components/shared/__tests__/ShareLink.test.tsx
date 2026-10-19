import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ShareLink from '../ShareLink';

vi.mock('@/services/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('ShareLink', () => {
  const username = 'alice';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the tip URL in a read-only input', () => {
    render(<ShareLink username={username} domain="https://tipz.app" />);

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('https://tipz.app/@alice');
    expect(input).toHaveAttribute('readonly');
  });

  it('uses window.location.origin as default domain', () => {
    render(<ShareLink username={username} />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue(`${window.location.origin}/@alice`);
  });

  it('renders Copy and Share on X buttons', () => {
    render(<ShareLink username={username} domain="https://tipz.app" />);

    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /share on x/i })).toBeInTheDocument();
  });

  // ── Copy interaction ───────────────────────────────────────────────────────

  it('copies the tip URL to clipboard on Copy click', async () => {
    render(<ShareLink username={username} domain="https://tipz.app" />);

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://tipz.app/@alice');
    });
  });

  it('shows "Copied!" label after a successful copy', async () => {
    render(<ShareLink username={username} domain="https://tipz.app" />);

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
    });
  });

  it('reverts Copy label back after 2 seconds', async () => {
    render(<ShareLink username={username} domain="https://tipz.app" />);

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument(),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument();
  });

  it('logs an error when clipboard write fails', async () => {
    const { logger } = await import('@/services/logger');
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error('Permission denied'),
    );

    render(<ShareLink username={username} domain="https://tipz.app" />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ── Share on X interaction ─────────────────────────────────────────────────

  it('opens a Twitter intent URL when Share on X is clicked', () => {
    render(<ShareLink username={username} domain="https://tipz.app" />);

    fireEvent.click(screen.getByRole('button', { name: /share on x/i }));

    expect(window.open).toHaveBeenCalledOnce();
    const [url] = vi.mocked(window.open).mock.calls[0];
    expect(url).toContain('twitter.com/intent/tweet');
    expect(url).toContain(encodeURIComponent('https://tipz.app/@alice'));
  });

  it('opens the Twitter URL in a new window with correct dimensions', () => {
    render(<ShareLink username={username} domain="https://tipz.app" />);

    fireEvent.click(screen.getByRole('button', { name: /share on x/i }));

    const [, target, features] = vi.mocked(window.open).mock.calls[0];
    expect(target).toBe('_blank');
    expect(features).toContain('width=550');
    expect(features).toContain('height=420');
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('input has a title on the Copy button describing its action', () => {
    render(<ShareLink username={username} domain="https://tipz.app" />);

    const copyBtn = screen.getByRole('button', { name: /copy/i });
    expect(copyBtn).toHaveAttribute('title', 'Copy to clipboard');
  });

  it('input is not editable by the user', () => {
    render(<ShareLink username={username} domain="https://tipz.app" />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hacked' } });

    expect(input).toHaveValue(`${window.location.origin}/@alice`);
  });
});
