import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useContract } from "./useContract";
import { Tip } from "../types/contract";
import { env } from "../helpers/env";
import { mockTips } from "../features/mockData";
import { logger } from "../services/logger";

export type TransactionType = "sent" | "received" | "withdrawal";

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: string; // stroops as string
  counterparty: string; // address of the other party
  date: number; // unix seconds
  message: string;
  /** Stellar transaction hash — populated when available */
  txHash?: string;
  /** For withdrawals: fee deducted in stroops */
  fee?: string;
  /** For withdrawals: net amount after fee */
  net?: string;
}

export type TabFilter = "all" | "sent" | "received" | "withdrawals";

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

export interface TransactionHistoryData {
  transactions: Transaction[];
  filtered: Transaction[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
  totalCount: number;
}

const PAGE_SIZE = 20;

/**
 * Converts a Tip (received) to a Transaction.
 * Direction is determined by comparing the connected wallet address
 * against the tip's creator field — not guessed from mock data.
 */
function tipToReceived(tip: Tip): Transaction {
  return {
    id: `received-${tip.id}`,
    type: "received",
    amount: tip.amount,
    counterparty: tip.tipper,
    date: tip.timestamp,
    message: tip.message,
  };
}

/**
 * Converts a Tip (sent) to a Transaction.
 * Direction is determined by comparing the connected wallet address
 * against the tip's tipper field — not guessed from mock data.
 */
function tipToSent(tip: Tip): Transaction {
  return {
    id: `sent-${tip.id}`,
    type: "sent",
    amount: tip.amount,
    counterparty: tip.creator,
    date: tip.timestamp,
    message: tip.message,
  };
}

/**
 * Builds mock withdrawal transactions from a set of tips.
 * Only used when VITE_USE_MOCK_DATA=true — never in live mode.
 */
function buildMockWithdrawals(tips: Tip[], feeBps: number): Transaction[] {
  return tips.slice(0, 3).map((tip, i) => {
    const gross = BigInt(tip.amount) * BigInt(i + 2);
    const fee = (gross * BigInt(feeBps)) / BigInt(10_000);
    const net = gross - fee;
    return {
      id: `withdrawal-${tip.id}-${i}`,
      type: "withdrawal" as TransactionType,
      amount: gross.toString(),
      counterparty: "",
      date: tip.timestamp - (i + 1) * 12 * 60 * 60,
      message: "",
      fee: fee.toString(),
      net: net.toString(),
    };
  });
}

/**
 * Hook that fetches and manages the full transaction history for the connected wallet.
 *
 * In live mode (VITE_USE_MOCK_DATA unset or false):
 *   - Received tips are fetched via getRecentTips(publicKey, ...) — tips where
 *     the connected wallet is the creator.
 *   - Sent tips are fetched via getTipsByTipper(publicKey, ...) — tips where
 *     the connected wallet is the tipper.
 *   - Direction is determined by which API returned the tip, not guessed.
 *   - Withdrawals are omitted (not yet exposed by the contract API).
 *
 * In mock mode (VITE_USE_MOCK_DATA=true):
 *   - Only tips that exactly match publicKey as creator or tipper are shown.
 *   - The previous fallback that showed ALL mock tips as "received" when no
 *     exact match existed has been removed — it caused sent tips to appear
 *     as received, a serious correctness bug (issue #1302).
 *   - Mock withdrawals are still generated for demo purposes.
 *
 * Pagination is cursor-based via offset: loadMore() fetches the next page of
 * received and/or sent tips depending on the active tab.
 */
export function useTransactionHistory(
  publicKey: string | null,
  tab: TabFilter,
  dateRange: DateRange,
  feeBps = 200,
): TransactionHistoryData {
  const {
    getRecentTips,
    getCreatorTipCount,
    getTipsByTipper,
    getTipperTipCount,
  } = useContract();

  const [receivedTips, setReceivedTips] = useState<Tip[]>([]);
  const [sentTips, setSentTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receivedTotal, setReceivedTotal] = useState(0);
  const [sentTotal, setSentTotal] = useState(0);
  const [receivedOffset, setReceivedOffset] = useState(0);
  const [sentOffset, setSentOffset] = useState(0);

  const isFetchingRef = useRef(false);

  // ── Initial load ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!publicKey || isFetchingRef.current) return;

    if (env.useMockData) {
      // In mock mode, only show tips that exactly match this wallet address.
      // Never fall back to showing all mock tips as "received" — that produces
      // incorrect direction data (issue #1302).
      const received = mockTips.filter((t) => t.creator === publicKey);
      const sent = mockTips.filter((t) => t.tipper === publicKey);
      setReceivedTips(received);
      setSentTips(sent);
      setReceivedTotal(received.length);
      setSentTotal(sent.length);
      setReceivedOffset(received.length);
      setSentOffset(sent.length);
      setLoading(false);
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const [receivedResult, sentResult, receivedCountResult, sentCountResult] =
        await Promise.allSettled([
          getRecentTips(publicKey, PAGE_SIZE, 0),
          getTipsByTipper(publicKey, PAGE_SIZE),
          getCreatorTipCount(publicKey),
          getTipperTipCount(publicKey),
        ]);

      if (receivedResult.status === "fulfilled") {
        setReceivedTips(receivedResult.value);
        setReceivedOffset(receivedResult.value.length);
      }
      if (sentResult.status === "fulfilled") {
        setSentTips(sentResult.value);
        setSentOffset(sentResult.value.length);
      }
      if (receivedCountResult.status === "fulfilled") {
        setReceivedTotal(receivedCountResult.value);
      }
      if (sentCountResult.status === "fulfilled") {
        setSentTotal(sentCountResult.value);
      }

      if (
        receivedResult.status === "rejected" &&
        sentResult.status === "rejected"
      ) {
        setError("Failed to load transaction history.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load transactions",
      );
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [
    publicKey,
    getRecentTips,
    getTipsByTipper,
    getCreatorTipCount,
    getTipperTipCount,
  ]);

  useEffect(() => {
    setReceivedTips([]);
    setSentTips([]);
    setReceivedOffset(0);
    setSentOffset(0);
    setError(null);
    fetchAll();
  }, [publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load more (cursor-based pagination) ───────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!publicKey || isFetchingRef.current || env.useMockData) return;

    isFetchingRef.current = true;
    try {
      if (tab === "received" || tab === "all") {
        if (receivedOffset < receivedTotal) {
          const more = await getRecentTips(
            publicKey,
            PAGE_SIZE,
            receivedOffset,
          );
          setReceivedTips((prev) => [...prev, ...more]);
          setReceivedOffset((o) => o + more.length);
        }
      }
      if (tab === "sent" || tab === "all") {
        if (sentOffset < sentTotal) {
          const more = await getTipsByTipper(publicKey, PAGE_SIZE);
          setSentTips((prev) => [...prev, ...more]);
          setSentOffset((o) => o + more.length);
        }
      }
    } catch (err) {
      logger.error(
        "hooks/useTransactionHistory",
        "loadMore failed",
        undefined,
        err instanceof Error ? err : new Error(String(err)),
      );
    } finally {
      isFetchingRef.current = false;
    }
  }, [
    publicKey,
    tab,
    receivedOffset,
    receivedTotal,
    sentOffset,
    sentTotal,
    getRecentTips,
    getTipsByTipper,
  ]);

  // ── Derived data ──────────────────────────────────────────────────────────

  // Withdrawals are only available in mock mode — the contract API does not
  // yet expose a withdrawal history endpoint. In live mode the list is empty.
  const withdrawals = useMemo<Transaction[]>(
    () => (env.useMockData ? buildMockWithdrawals(receivedTips, feeBps) : []),
    [receivedTips, feeBps],
  );

  const allTransactions = useMemo<Transaction[]>(() => {
    const list: Transaction[] = [
      ...receivedTips.map(tipToReceived),
      ...sentTips.map(tipToSent),
      ...withdrawals,
    ];
    return list.sort((a, b) => b.date - a.date);
  }, [receivedTips, sentTips, withdrawals]);

  const filtered = useMemo<Transaction[]>(() => {
    return allTransactions.filter((tx) => {
      // Tab filter
      if (tab === "sent" && tx.type !== "sent") return false;
      if (tab === "received" && tx.type !== "received") return false;
      if (tab === "withdrawals" && tx.type !== "withdrawal") return false;

      // Date range filter
      if (dateRange.start) {
        const start = new Date(dateRange.start).getTime();
        if (tx.date * 1000 < start) return false;
      }
      if (dateRange.end) {
        const end = new Date(dateRange.end).getTime() + 24 * 60 * 60 * 1000 - 1;
        if (tx.date * 1000 > end) return false;
      }

      return true;
    });
  }, [allTransactions, tab, dateRange]);

  const hasMore = receivedOffset < receivedTotal || sentOffset < sentTotal;

  const totalCount =
    tab === "all"
      ? allTransactions.length
      : tab === "received"
      ? receivedTips.length
      : tab === "sent"
      ? sentTips.length
      : withdrawals.length;

  return {
    transactions: allTransactions,
    filtered,
    loading,
    error,
    hasMore,
    loadMore,
    refetch: fetchAll,
    totalCount,
  };
}
