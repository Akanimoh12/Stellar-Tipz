import { useCallback, useEffect, useRef, useState } from 'react';

type TransactionStatus = 'idle' | 'pending' | 'success' | 'error';

interface UseTransactionGuardReturn {
  isPending: boolean;
  status: TransactionStatus;
  startTransaction: <T>(transaction: () => Promise<T>) => Promise<T | null>;
  reset: () => void;
}

/**
 * Hook to guard against duplicate form submissions during pending transactions.
 * 
 * Features:
 * - Prevents duplicate submissions while a transaction is pending
 * - Shows beforeunload warning when a transaction is in progress
 * - Automatically clears pending state on success, error, or timeout
 * 
 * @example
 * const { isPending, startTransaction } = useTransactionGuard();
 * 
 * const handleSubmit = async () => {
 *   await startTransaction(async () => {
 *     await sendTip(creator, amount, message);
 *   });
 * };
 * 
 * return <Button disabled={isPending} onClick={handleSubmit}>Send</Button>;
 */
export function useTransactionGuard(timeoutMs: number = 120_000): UseTransactionGuardReturn {
  const [status, setStatus] = useState<TransactionStatus>('idle');
  const transactionLockRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPending = status === 'pending';

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Add beforeunload warning during pending transactions
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isPending) {
        event.preventDefault();
        // Modern browsers ignore custom messages, but legacy support
        event.returnValue = 'A transaction is in progress. Are you sure you want to leave?';
        return event.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isPending]);

  const startTransaction = useCallback(async <T,>(transaction: () => Promise<T>): Promise<T | null> => {
    // Reject if a transaction is already in progress
    if (transactionLockRef.current || isPending) {
      console.warn('Transaction already in progress, rejecting duplicate submission');
      return null;
    }

    transactionLockRef.current = true;
    setStatus('pending');

    // Set timeout to clear pending state
    timeoutRef.current = setTimeout(() => {
      setStatus('error');
      transactionLockRef.current = false;
      console.warn('Transaction timed out');
    }, timeoutMs);

    try {
      const result = await transaction();
      
      // Clear timeout on success
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      setStatus('success');
      transactionLockRef.current = false;
      return result;
    } catch (error) {
      // Clear timeout on error
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      setStatus('error');
      transactionLockRef.current = false;
      throw error;
    }
  }, [isPending, timeoutMs]);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus('idle');
    transactionLockRef.current = false;
  }, []);

  return { isPending, status, startTransaction, reset };
}
