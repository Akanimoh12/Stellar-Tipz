import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WalletConnect from '../WalletConnect';
import { useWallet, useProfile } from '../../../hooks';

// Mock the hooks
vi.mock('../../../hooks', () => ({
  useWallet: vi.fn(),
  useProfile: vi.fn(),
}));

describe('WalletConnect', () => {
  const mockConnectWallet = vi.fn();
  const mockSetError = vi.fn();
  const mockIsWalletInstalled = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useWallet as any).mockReturnValue({
      publicKey: null,
      connected: false,
      connecting: false,
      error: null,
      disconnect: vi.fn(),
      connectWallet: mockConnectWallet,
      isWalletInstalled: mockIsWalletInstalled,
      setError: mockSetError,
    });
    (useProfile as any).mockReturnValue({ profile: null });
  });

  it('shows all supported wallet options when button is clicked', () => {
    render(<WalletConnect />);
    
    // Click connect button to open modal
    fireEvent.click(screen.getByText(/Connect Wallet/i));
    
    expect(screen.getByText(/freighter/i)).toBeInTheDocument();
    expect(screen.getByText(/xbull/i)).toBeInTheDocument();
    expect(screen.getByText(/albedo/i)).toBeInTheDocument();
  });

  it('indicates installed status', () => {
    mockIsWalletInstalled.mockImplementation((id) => id === 'freighter');
    
    render(<WalletConnect />);
    fireEvent.click(screen.getByText(/Connect Wallet/i));
    
    expect(screen.getByText(/installed/i)).toBeInTheDocument();
  });

  it('links to install page for missing wallets', () => {
    mockIsWalletInstalled.mockReturnValue(false);
    
    render(<WalletConnect />);
    fireEvent.click(screen.getByText(/Connect Wallet/i));
    
    const installLinks = screen.getAllByRole('link', { name: /install/i });
    expect(installLinks[0]).toHaveAttribute('href', expect.stringContaining('freighter'));
  });
});
