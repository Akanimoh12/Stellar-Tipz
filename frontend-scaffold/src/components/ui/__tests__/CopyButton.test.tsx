import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CopyButton from '../CopyButton';

const mockLoggerError = vi.fn();

vi.mock('../../../services/logger', () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

describe('CopyButton', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockLoggerError.mockClear();
    // Mock clipboard API
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders copy button with correct label', () => {
    render(<CopyButton text="GABCD..." />);
    const button = screen.getByLabelText(/copy/i);
    expect(button).toBeInTheDocument();
  });

  it('copies wallet address to clipboard', async () => {
    render(<CopyButton text="GABCD..." />);
    const button = screen.getByLabelText(/copy/i);

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('GABCD...');
  });

  it('shows checkmark state after copy', async () => {
    render(<CopyButton text="GABCD..." />);
    const button = screen.getByLabelText(/copy/i);

    fireEvent.click(button);

    // After click, the button should have aria-label "Copied"
    await waitFor(() => {
      expect(screen.getByLabelText(/copied/i)).toBeInTheDocument();
    });
  });

  it('reverts to copy state after 2 seconds', async () => {
    vi.useFakeTimers();
    render(<CopyButton text="GABCD..." />);
    const button = screen.getByLabelText(/copy/i);

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(screen.getByLabelText(/copied/i)).toBeInTheDocument();

    // Fast-forward 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Should revert to copy label
    expect(screen.getByLabelText(/copy/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('uses fallback when clipboard API is not available', async () => {
    // Remove clipboard API
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    const mockExecCommand = vi.fn().mockReturnValue(true);
    document.execCommand = mockExecCommand;

    render(<CopyButton text="GABCD..." />);
    const button = screen.getByLabelText(/copy/i);

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(mockExecCommand).toHaveBeenCalledWith('copy');
    await waitFor(() => {
      expect(screen.getByLabelText(/copied/i)).toBeInTheDocument();
    });
  });

  it('logs an error and stays in copy state when copy fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Copy failed'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText,
      },
    });

    render(<CopyButton text="GABCD..." />);
    const button = screen.getByLabelText(/copy/i);

    fireEvent.click(button);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('GABCD...');
      expect(mockLoggerError).toHaveBeenCalled();
    });
    expect(screen.queryByLabelText(/copied/i)).not.toBeInTheDocument();
  });

  it('renders a visible label and swaps it after copy', async () => {
    render(<CopyButton text="tx-hash" label="Copy TX Hash" />);
    const button = screen.getByRole('button', { name: /copy tx hash/i });

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('tx-hash');
  });

  it('renders with custom size', () => {
    render(<CopyButton text="GABCD..." size="lg" />);
    const button = screen.getByLabelText(/copy/i);
    expect(button).toBeInTheDocument();
    expect(button.querySelector('svg')).toHaveAttribute('width', '24');
  });

  it('renders with custom className', () => {
    render(<CopyButton text="GABCD..." className="custom-class" />);
    const button = screen.getByLabelText(/copy/i);
    expect(button).toHaveClass('custom-class');
  });
});
