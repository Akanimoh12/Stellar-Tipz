import { useEffect, useRef } from 'react';
import { useWallet } from './useWallet';
import { useWalletStore } from '../store/walletStore';
import { logger } from '../services/logger';

interface WalletStateSnapshot {
  publicKey: string | null;
  network: 'PUBLIC' | 'TESTNET';
  timestamp: number;
}

const WALLET_CHECK_INTERVAL = 3000; // Check wallet state every 3s
const STATE_MISMATCH_THRESHOLD = 2; // Trigger recovery after 2 consecutive mismatches
const NETWORK_CHECK_TIMEOUT = 5000; // Timeout for network checks

/**
 * Ensures wallet connection stays in sync with extension state.
 * Handles wallet disconnects, account switches, and network changes.
 * Triggers graceful recovery instead of silent failures.
 */
export const useWalletResilience = () => {
  const { publicKey, network, connected } = useWalletStore();
  const { setError, disconnect } = useWallet();

  const stateSnapshotRef = useRef<WalletStateSnapshot | null>(null);
  const mismatchCountRef = useRef(0);
  const watcherRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCheckingRef = useRef(false);

  useEffect(() => {
    if (!connected || !publicKey) return;

    const checkWalletState = async () => {
      if (isCheckingRef.current) return;
      isCheckingRef.current = true;

      try {
        const win = window as unknown as {
          freighter?: { getAddress?: () => Promise<{ address: string }> };
        };

        if (!win.freighter?.getAddress) {
          // Wallet extension became unavailable
          handleWalletError(
            'Wallet extension unavailable',
            'disconnect'
          );
          isCheckingRef.current = false;
          return;
        }

        // Check if account changed
        const addressCheckPromise = Promise.race([
          win.freighter.getAddress().then((res) => res.address),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), NETWORK_CHECK_TIMEOUT)
          ),
        ]);

        const remoteAddress = (await addressCheckPromise) as string | null;

        if (remoteAddress === null) {
          // Timeout reaching wallet extension
          mismatchCountRef.current++;
        } else if (remoteAddress !== publicKey) {
          // Account switched without our knowledge
          handleWalletError(
            'Wallet account was switched externally',
            'accountSwitched'
          );
          isCheckingRef.current = false;
          return;
        } else {
          // State matches; reset mismatch counter
          mismatchCountRef.current = 0;
        }

        // If we've had consistent mismatches, force reconnect
        if (mismatchCountRef.current >= STATE_MISMATCH_THRESHOLD) {
          handleWalletError(
            'Lost wallet connection',
            'reconnect'
          );
          isCheckingRef.current = false;
          return;
        }

        stateSnapshotRef.current = {
          publicKey,
          network,
          timestamp: Date.now(),
        };
      } catch (error) {
        logger.warn(
          'hooks/useWalletResilience',
          'Wallet state check failed',
          undefined,
          error instanceof Error ? error : new Error(String(error))
        );
        mismatchCountRef.current++;
      } finally {
        isCheckingRef.current = false;
      }
    };

    // Start periodic checks
    watcherRef.current = setInterval(checkWalletState, WALLET_CHECK_INTERVAL);

    // Initial snapshot
    stateSnapshotRef.current = {
      publicKey,
      network,
      timestamp: Date.now(),
    };

    return () => {
      if (watcherRef.current) {
        clearInterval(watcherRef.current);
        watcherRef.current = null;
      }
    };
  }, [connected, publicKey, network]);

  const handleWalletError = (
    message: string,
    recovery: 'disconnect' | 'accountSwitched' | 'reconnect'
  ) => {
    logger.error(
      'hooks/useWalletResilience',
      `Wallet resilience: ${message}`,
      { recovery }
    );

    switch (recovery) {
      case 'disconnect':
        // Clean disconnect
        disconnect();
        setError('Your wallet connection was lost. Please reconnect.');
        break;
      case 'accountSwitched':
        // Account switched; user should reconnect
        disconnect();
        setError(
          'Your wallet account was switched. Please reconnect with the correct account.'
        );
        break;
      case 'reconnect':
        // Lost connection; try to recover gracefully
        disconnect();
        setError(
          'Wallet connection unstable. Please check your wallet extension and reconnect.'
        );
        break;
    }
  };
};
