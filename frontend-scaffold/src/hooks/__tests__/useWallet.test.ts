import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWallet } from '../useWallet';
import { useWalletStore } from '../../store/walletStore';

// Mock the StellarWalletsKit
vi.mock('@creit.tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: vi.fn().mockImplementation(() => ({
    openModal: vi.fn(),
    setWallet: vi.fn(),
    getAddress: vi.fn(),
    signTransaction: vi.fn(),
  })),
  WalletNetwork: {
    TESTNET: 'TESTNET',
    PUBLIC: 'PUBLIC',
  },
  FREIGHTER_ID: 'freighter',
  FreighterModule: vi.fn(),
  AlbedoModule: vi.fn(),
  xBullModule: vi.fn(),
}));

// Mock window.freighter
Object.defineProperty(window, 'freighter', {
  value: {
    getNetwork: vi.fn(),
    getAddress: vi.fn(),
  },
  writable: true,
});

describe('useWallet', () => {
  beforeEach(() => {
    // Reset the store before each test
    useWalletStore.setState({
      publicKey: null,
      connected: false,
      connecting: false,
      error: null,
      network: 'TESTNET',
    });
    vi.clearAllMocks();
  });

  it('should return initial wallet state', () => {
    const { result } = renderHook(() => useWallet());

    expect(result.current.publicKey).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.connecting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.network).toBe('TESTNET');
  });

  it('should connect wallet and set publicKey', async () => {
    const { result } = renderHook(() => useWallet());
    
    const mockAddress = 'GD1234567890ABCDEF';
    const mockOnWalletSelected = vi.fn();
    
    // Mock the kit.openModal to call the callback with address
    const StellarWalletsKit = await import('@creit.tech/stellar-wallets-kit');
    const mockKit = (StellarWalletsKit.StellarWalletsKit as any).mock.results[0].value;
    mockKit.openModal.mockImplementation(({ onWalletSelected }) => {
      mockOnWalletSelected.mockImplementation(async (option: any) => {
        mockKit.setWallet(option.id);
        mockKit.getAddress.mockResolvedValue({ address: mockAddress });
        await onWalletSelected(option);
      });
      return Promise.resolve();
    });

    await act(async () => {
      result.current.connect();
    });

    // Simulate wallet selection
    await act(async () => {
      await mockOnWalletSelected({ id: 'freighter' });
    });

    await waitFor(() => {
      expect(result.current.publicKey).toBe(mockAddress);
      expect(result.current.connected).toBe(true);
      expect(result.current.connecting).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  it('should disconnect wallet and clear state', () => {
    // First set up a connected state
    useWalletStore.setState({
      publicKey: 'GD1234567890ABCDEF',
      connected: true,
      connecting: false,
      error: null,
      network: 'TESTNET',
    });

    const { result } = renderHook(() => useWallet());

    expect(result.current.publicKey).toBe('GD1234567890ABCDEF');
    expect(result.current.connected).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle connection errors', async () => {
    const { result } = renderHook(() => useWallet());
    
    const mockOnWalletSelected = vi.fn();
    
    // Mock the kit.openModal to call the callback with error
    const StellarWalletsKit = await import('@creit.tech/stellar-wallets-kit');
    const mockKit = (StellarWalletsKit.StellarWalletsKit as any).mock.results[0].value;
    mockKit.openModal.mockImplementation(({ onWalletSelected }) => {
      mockOnWalletSelected.mockImplementation(async (option: any) => {
        mockKit.setWallet(option.id);
        mockKit.getAddress.mockRejectedValue(new Error('Connection failed'));
        await onWalletSelected(option);
      });
      return Promise.resolve();
    });

    await act(async () => {
      result.current.connect();
    });

    // Simulate wallet selection with error
    await act(async () => {
      await mockOnWalletSelected({ id: 'freighter' });
    });

    await waitFor(() => {
      expect(result.current.publicKey).toBeNull();
      expect(result.current.connected).toBe(false);
      expect(result.current.connecting).toBe(false);
      expect(result.current.error).toBe('Connection failed');
    });
  });

  it('should set network', () => {
    const { result } = renderHook(() => useWallet());

    expect(result.current.network).toBe('TESTNET');

    act(() => {
      result.current.setNetwork('PUBLIC');
    });

    expect(result.current.network).toBe('PUBLIC');
  });

  it('should sign transaction', async () => {
    const mockXdr = 'AAAAAgAAAAA=';
    const mockSignedXdr = 'AAAAAwAAAAA=';
    
    // Set up connected state
    useWalletStore.setState({
      publicKey: 'GD1234567890ABCDEF',
      connected: true,
      connecting: false,
      error: null,
      network: 'TESTNET',
    });

    const { result } = renderHook(() => useWallet());
    
    const StellarWalletsKit = await import('@creit.tech/stellar-wallets-kit');
    const mockKit = (StellarWalletsKit.StellarWalletsKit as any).mock.results[0].value;
    mockKit.signTransaction.mockResolvedValue({ signedTxXdr: mockSignedXdr });

    const signedTx = await result.current.signTransaction(mockXdr);

    expect(signedTx).toBe(mockSignedXdr);
    expect(mockKit.signTransaction).toHaveBeenCalledWith(mockXdr, {
      address: 'GD1234567890ABCDEF',
    });
  });
});
