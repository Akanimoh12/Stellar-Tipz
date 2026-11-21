import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { logger } from "../services/logger";

type TransactionStatus = "idle" | "pending" | "success" | "error";

const TX_GUARD_STORAGE_KEY = "tipz_tx_guard_v1";
const GUARD_PAYLOAD_VERSION = 1;

export const NAVIGATION_CONFIRM_MESSAGE =
  "A transaction is in progress. Leaving now may interrupt it. Are you sure you want to leave?";

interface PersistedGuard {
  version: number;
  startedAt: number;
  timeoutMs: number;
}

// Module-level registry so any component (e.g. TransactionNavigationBlock) can
// observe whether an in-flight transaction exists, independent of React state.
let activeTransactions = 0;
const listeners = new Set<() => void>();

function emitRegistry(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeActiveTransactions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveTransactionCount(): number {
  return activeTransactions;
}

export function useActiveTransactionCount(): number {
  return useSyncExternalStore(
    subscribeActiveTransactions,
    getActiveTransactionCount,
    getActiveTransactionCount,
  );
}

function enterTransaction(): void {
  activeTransactions += 1;
  emitRegistry();
}

function exitTransaction(): void {
  activeTransactions = Math.max(0, activeTransactions - 1);
  emitRegistry();
}

function readPersistedGuard(): PersistedGuard | null {
  try {
    const raw = sessionStorage.getItem(TX_GUARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedGuard> | null;
    if (
      !parsed ||
      parsed.version !== GUARD_PAYLOAD_VERSION ||
      typeof parsed.startedAt !== "number" ||
      typeof parsed.timeoutMs !== "number"
    ) {
      return null;
    }
    return parsed as PersistedGuard;
  } catch {
    return null;
  }
}

function writePersistedGuard(startedAt: number, timeoutMs: number): void {
  try {
    sessionStorage.setItem(
      TX_GUARD_STORAGE_KEY,
      JSON.stringify({ version: GUARD_PAYLOAD_VERSION, startedAt, timeoutMs }),
    );
  } catch {
    // storage failures are non-fatal
  }
}

export function clearPersistedGuard(): void {
  try {
    sessionStorage.removeItem(TX_GUARD_STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface UseTransactionGuardReturn {
  isPending: boolean;
  status: TransactionStatus;
  restored: boolean;
  startTransaction: <T>(transaction: () => Promise<T>) => Promise<T | null>;
  reset: () => void;
}

/**
 * Hook to guard against duplicate form submissions during pending transactions.
 *
 * Features:
 * - Prevents duplicate submissions while a transaction is pending
 * - Shows beforeunload warning when a transaction is in progress
 * - Persists pending state so a refresh mid-transaction is detected on return
 * - Automatically clears pending state on success, error, or timeout
 *
 * @example
 * const { isPending, startTransaction, restored, reset } = useTransactionGuard();
 *
 * const handleSubmit = async () => {
 *   await startTransaction(async () => {
 *     await sendTip(creator, amount, message);
 *   });
 * };
 *
 * return <Button disabled={isPending} onClick={handleSubmit}>Send</Button>;
 */
export function useTransactionGuard(
  timeoutMs: number = 120_000,
): UseTransactionGuardReturn {
  const [status, setStatus] = useState<TransactionStatus>("idle");
  const [restored, setRestored] = useState(false);
  const transactionLockRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enteredRef = useRef(false);

  const isPending = status === "pending";

  const release = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    transactionLockRef.current = false;
    clearPersistedGuard();
    if (enteredRef.current) {
      enteredRef.current = false;
      exitTransaction();
    }
  }, []);

  const scheduleTimeout = useCallback((delayMs: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setStatus("error");
      transactionLockRef.current = false;
      clearPersistedGuard();
      if (enteredRef.current) {
        enteredRef.current = false;
        exitTransaction();
      }
      logger.warn("hooks/useTransactionGuard", "Transaction timed out");
    }, delayMs);
  }, []);

  // Restore a persisted pending transaction after a page refresh.
  useEffect(() => {
    const persisted = readPersistedGuard();
    if (!persisted) return;

    const remaining = persisted.startedAt + persisted.timeoutMs - Date.now();
    if (remaining <= 0) {
      clearPersistedGuard();
      return;
    }

    logger.warn(
      "hooks/useTransactionGuard",
      "Restoring pending transaction after reload",
      {
        remainingMs: remaining,
      },
    );
    transactionLockRef.current = true;
    setStatus("pending");
    setRestored(true);
    if (!enteredRef.current) {
      enteredRef.current = true;
      enterTransaction();
    }
    scheduleTimeout(remaining);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (enteredRef.current) {
        enteredRef.current = false;
        exitTransaction();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add beforeunload warning during pending transactions
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isPending) {
        event.preventDefault();
        // Modern browsers ignore custom messages, but legacy support
        event.returnValue =
          "A transaction is in progress. Are you sure you want to leave?";
        return event.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isPending]);

  const startTransaction = useCallback(
    async <T>(transaction: () => Promise<T>): Promise<T | null> => {
      // Reject if a transaction is already in progress
      if (transactionLockRef.current || isPending) {
        logger.warn(
          "hooks/useTransactionGuard",
          "Transaction already in progress, rejecting duplicate submission",
        );
        return null;
      }

      transactionLockRef.current = true;
      setStatus("pending");
      setRestored(false);
      if (!enteredRef.current) {
        enteredRef.current = true;
        enterTransaction();
      }
      writePersistedGuard(Date.now(), timeoutMs);
      scheduleTimeout(timeoutMs);

      try {
        const result = await transaction();

        release();
        setStatus("success");
        return result;
      } catch (error) {
        release();
        setStatus("error");
        throw error;
      }
    },
    [isPending, timeoutMs, release, scheduleTimeout],
  );

  const reset = useCallback(() => {
    release();
    setStatus("idle");
    setRestored(false);
  }, [release]);

  // Clean up the registry entry if this instance still owns it on unmount.
  useEffect(() => {
    return () => {
      if (enteredRef.current) {
        enteredRef.current = false;
        exitTransaction();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return { isPending, status, restored, startTransaction, reset };
}
