import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CopyButton from '../CopyButton';

// Mock the toast store
vi.mock('@/store/toastStore', () => ({
  useToastStore: () => ({
    addToast: vi.fn(),
  }),
}));

describe('CopyButton', () => {
  beforeEach(() => {
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
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
    
    await fireEvent.click(button);
    
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('GABCD...');
  });

  it('shows checkmark icon after copy', async () => {
    render(<CopyButton text="GABCD..." />);
    const button = screen.getByLabelText(/copy/i);
    
    await fireEvent.click(button);
    
    // After click, the button should have aria-label "Copied"
    expect(screen.getByLabelText(/copied/i)).toBeInTheDocument();
  });

  it('reverts to copy icon after 2 seconds', async () => {
    vi.useFakeTimers();
    render(<CopyButton text="GABCD..." />);
    const button = screen.getByLabelText(/copy/i);
    
    await fireEvent.click(button);
    expect(screen.getByLabelText(/copied/i)).toBeInTheDocument();
    
    // Fast-forward 2 seconds
    vi.advanceTimersByTime(2000);
    
    // Should revert to copy label
    expect(screen.getByLabelText(/copy/i)).toBeInTheDocument();
    
    vi.useRealTimers();
  });

  it('uses fallback when clipboard API is not available', async () => {
    // Remove clipboard API
    Object.assign(navigator, { clipboard: undefined });
    
    const mockExecCommand = vi.fn().mockReturnValue(true);
    document.execCommand = mockExecCommand;
    
    render(<CopyButton text="GABCD..." />);
    const button = screen.getByLabelText(/copy/i);
    
    await fireEvent.click(button);
    
    expect(mockExecCommand).toHaveBeenCalledWith('copy');
  });

  it('shows error toast when copy fails', async () => {
    const mockAddToast = vi.fn();
    vi.doMock('@/store/toastStore', () => ({
      useToastStore: () => ({
        addToast: mockAddToast,
      }),
    }));

    // Mock clipboard failure
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Copy failed')),
      },
    });

    render(<CopyButton text="GABCD..." />);
    const button = screen.getByLabelText(/copy/i);
    
    await fireEvent.click(button);
    
    // Should show error toast
    expect(mockAddToast).toHaveBeenCalledWith({
      message: 'Failed to copy',
      type: 'error',
      priority: 'medium',
      duration: 3000,
    });
  });

  it('renders with custom size', () => {
    render(<CopyButton text="GABCD..." size="lg" />);
    const button = screen.getByLabelText(/copy/i);
    expect(button).toBeInTheDocument();
  });

  it('renders with custom className', () => {
    render(<CopyButton text="GABCD..." className="custom-class" />);
    const button = screen.getByLabelText(/copy/i);
    expect(button).toHaveClass('custom-class');
  });
});
