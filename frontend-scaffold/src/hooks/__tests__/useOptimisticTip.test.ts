import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOptimisticTip } from '../useOptimisticTip';
import { useWalletStore } from '../../store/walletStore';
import { useOptimisticStore } from '../../store/optimisticUpdatesStore';
import { queryCache } from '../../lib/queryCache';
import { logger } from '../../services/logger';

describe('useOptimisticTip (#1519)', () => {
  const TEST_PUBLIC_KEY = 'GBEXAMPLEPUBLICKEY1234567890ABCDEF';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset stores to default clean state
    useWalletStore.setState({
      publicKey: TEST_PUBLIC_KEY,
      connected: true,
    });

    useOptimisticStore.setState({
      updates: new Map(),
    });

    vi.spyOn(queryCache, 'invalidate').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('initialization and loading state', () => {
    it('returns initial state with isSubmitting as false and empty pendingTips', () => {
      const { result } = renderHook(() => useOptimisticTip());

      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.pendingTips).toEqual([]);
      expect(typeof result.current.sendTip).toBe('function');
    });

    it('returns existing pending tips from the optimistic store', () => {
      const existingTip = {
        id: -1,
        tipper: TEST_PUBLIC_KEY,
        creator: 'GBCREATOR',
        amount: '50',
        message: 'Great work!',
        timestamp: 1600000000,
        isEncrypted: false,
        clientId: 'client-1',
        isOptimistic: true as const,
        transactionId: 'pending-1234',
      };

      useOptimisticStore.setState({
        updates: new Map([
          [
            'client-1',
            {
              id: 'client-1',
              type: 'tip',
              timestamp: 1600000000000,
              status: 'pending',
              data: existingTip,
            },
          ],
        ]),
      });

      const { result } = renderHook(() => useOptimisticTip());

      expect(result.current.pendingTips).toHaveLength(1);
      expect(result.current.pendingTips[0]).toEqual(existingTip);
    });
  });

  describe('success path', () => {
    it('optimistically adds tip, waits for confirmation, invalidates cache and returns clientId', async () => {
      const { result } = renderHook(() => useOptimisticTip());

      let sendPromise: Promise<string>;
      act(() => {
        sendPromise = result.current.sendTip({
          creator: 'GCREATORKEY987',
          amount: '25',
          message: 'Tip for stream',
        });
      });

      // While in flight, pending update should be present in store
      const stateBeforeConfirmation = useOptimisticStore.getState();
      expect(stateBeforeConfirmation.updates.size).toBe(1);

      const [optimisticUpdate] = Array.from(stateBeforeConfirmation.updates.values());
      expect(optimisticUpdate.status).toBe('pending');
      expect(optimisticUpdate.type).toBe('tip');
      expect(optimisticUpdate.data.tipper).toBe(TEST_PUBLIC_KEY);
      expect(optimisticUpdate.data.creator).toBe('GCREATORKEY987');
      expect(optimisticUpdate.data.amount).toBe('25');
      expect(optimisticUpdate.data.message).toBe('Tip for stream');
      expect(optimisticUpdate.data.isOptimistic).toBe(true);

      // Advance simulated transaction delay (500ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      const clientId = await sendPromise!;
      expect(clientId).toBe(optimisticUpdate.id);

      // Should mark update as confirmed
      const stateAfterConfirmation = useOptimisticStore.getState();
      const confirmedUpdate = stateAfterConfirmation.updates.get(clientId);
      expect(confirmedUpdate?.status).toBe('confirmed');

      // Should invalidate cache
      expect(queryCache.invalidate).toHaveBeenCalledWith('tips-');

      // Should log info message
      expect(logger.info).toHaveBeenCalledWith(
        'hooks/useOptimisticTip',
        'Tip sent optimistically',
        { clientId }
      );
    });

    it('defaults message to empty string when message is omitted', async () => {
      const { result } = renderHook(() => useOptimisticTip());

      let sendPromise: Promise<string>;
      act(() => {
        sendPromise = result.current.sendTip({
          creator: 'GCREATORKEY987',
          amount: '10',
        });
      });

      const [optimisticUpdate] = Array.from(useOptimisticStore.getState().updates.values());
      expect(optimisticUpdate.data.message).toBe('');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      await expect(sendPromise!).resolves.toBe(optimisticUpdate.id);
    });
  });

  describe('error handling', () => {
    it('throws error when wallet is not connected', async () => {
      useWalletStore.setState({ publicKey: null, connected: false });

      const { result } = renderHook(() => useOptimisticTip());

      await expect(
        result.current.sendTip({
          creator: 'GCREATORKEY987',
          amount: '5',
        })
      ).rejects.toThrow('Wallet not connected');

      // No optimistic update should be added
      expect(useOptimisticStore.getState().updates.size).toBe(0);
    });

    it('handles transaction failure by marking update as failed and logging error', async () => {
      const failUpdateSpy = vi.fn();
      useOptimisticStore.setState({
        confirmUpdate: () => {
          throw new Error('Network transaction dropped');
        },
        failUpdate: failUpdateSpy,
      });

      const { result } = renderHook(() => useOptimisticTip());

      let sendPromise: Promise<string>;
      act(() => {
        sendPromise = result.current.sendTip({
          creator: 'GCREATORKEY987',
          amount: '15',
        });
      });

      const [optimisticUpdate] = Array.from(useOptimisticStore.getState().updates.values());
      const clientId = optimisticUpdate.id;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      await expect(sendPromise!).rejects.toThrow('Network transaction dropped');

      expect(failUpdateSpy).toHaveBeenCalledWith(clientId, 'Network transaction dropped');
      expect(logger.error).toHaveBeenCalledWith(
        'hooks/useOptimisticTip',
        'Optimistic tip failed',
        { clientId },
        expect.any(Error)
      );
    });
  });

  describe('cleanup and dependency handling', () => {
    it('preserves memoized sendTip function across renders when dependencies do not change', () => {
      const { result, rerender } = renderHook(() => useOptimisticTip());
      const firstSendTip = result.current.sendTip;

      rerender();
      const secondSendTip = result.current.sendTip;

      expect(firstSendTip).toBe(secondSendTip);
    });

    it('updates sendTip function when publicKey changes', () => {
      const { result, rerender } = renderHook(() => useOptimisticTip());
      const firstSendTip = result.current.sendTip;

      act(() => {
        useWalletStore.setState({ publicKey: 'NEWPUBLICKEY99999' });
      });
      rerender();

      const secondSendTip = result.current.sendTip;
      expect(firstSendTip).not.toBe(secondSendTip);
    });
  });
});
