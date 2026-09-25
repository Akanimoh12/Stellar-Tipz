import { useCallback } from 'react';
import { useOptimisticStore } from '../store/optimisticUpdatesStore';
import { useWalletStore } from '../store/walletStore';
import { queryCache } from '../lib/queryCache';
import { generateTipTransactionId } from '../lib/transactionHash';
import { Tip } from '../types/contract';
import { logger } from '../services/logger';

interface TipInput {
  creator: string;
  amount: string;
  message?: string;
}

interface OptimisticTipResult {
  sendTip: (input: TipInput) => Promise<string>;
  isSubmitting: boolean;
  pendingTips: Tip[];
}

/**
 * Hook for submitting tips with optimistic UI updates.
 * Shows tip immediately while transaction is pending.
 */
export const useOptimisticTip = (): OptimisticTipResult => {
  const { publicKey } = useWalletStore();
  const {
    addOptimisticUpdate,
    confirmUpdate,
    failUpdate,
    getUpdatesByType,
  } = useOptimisticStore();

  const sendTip = useCallback(
    async (input: TipInput): Promise<string> => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      const clientId = `${Date.now()}-${Math.random()}`;
      const now = Math.floor(Date.now() / 1000);

      // Create optimistic tip
      const optimisticTip: Tip = {
        id: -1, // Placeholder ID
        tipper: publicKey,
        creator: input.creator,
        amount: input.amount,
        message: input.message || '',
        timestamp: now,
        isEncrypted: false,
      };

      const transactionId = generateTipTransactionId(optimisticTip);

      const optimisticUpdate = {
        id: clientId,
        type: 'tip' as const,
        timestamp: now * 1000,
        status: 'pending' as const,
        data: {
          ...optimisticTip,
          clientId,
          isOptimistic: true,
          transactionId,
        },
      };

      // Add to optimistic store (shows in UI immediately)
      addOptimisticUpdate(optimisticUpdate);

      try {
        // Simulate transaction (replace with actual tipping logic)
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Mark as confirmed
        confirmUpdate(clientId);

        // Invalidate tips cache to trigger refresh
        queryCache.invalidate('tips-');

        logger.info(
          'hooks/useOptimisticTip',
          'Tip sent optimistically',
          { clientId }
        );

        return clientId;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to send tip';
        failUpdate(clientId, message);

        logger.error(
          'hooks/useOptimisticTip',
          'Optimistic tip failed',
          { clientId },
          error instanceof Error ? error : new Error(String(error))
        );

        throw error;
      }
    },
    [publicKey, addOptimisticUpdate, confirmUpdate, failUpdate]
  );

  const pendingTips = getUpdatesByType('tip').map((u) => u.data);

  return {
    sendTip,
    isSubmitting: false, // Could track from store
    pendingTips,
  };
};
