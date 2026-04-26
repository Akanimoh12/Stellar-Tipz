import React, { useState, useCallback, useRef, useEffect } from "react";
import { History, Wallet, Download } from "lucide-react";

import PageContainer from "@/components/layout/PageContainer";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";
import Button from "@/components/ui/Button";
import WalletConnect from "@/components/shared/WalletConnect";
import ErrorState from "@/components/shared/ErrorState";
import { categorizeError } from "@/helpers/error";
import { useWalletStore } from "@/store/walletStore";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  useTransactionHistory,
  TabFilter,
  DateRange,
} from "@/hooks/useTransactionHistory";

import TransactionRow from "./TransactionRow";
import TransactionFilters from "./TransactionFilters";
import { exportTransactionsCsv } from "./exportCsv";

const TABS: { id: TabFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sent", label: "Sent" },
  { id: "received", label: "Received" },
  { id: "withdrawals", label: "Withdrawals" },
];

const TransactionsPage: React.FC = () => {
  usePageTitle("Transactions");

  const { connected, publicKey } = useWalletStore();
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>({ start: "", end: "" });

  const { filtered, loading, error, hasMore, loadMore, refetch } =
    useTransactionHistory(publicKey, activeTab, dateRange);

  // ── Infinite scroll sentinel ───────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loading) loadMore();
  }, [hasMore, loading, loadMore]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadMore();
      },
      { threshold: 0.1 },
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [handleLoadMore]);

  // ── Tab change resets date filter ──────────────────────────────────────
  const handleTabChange = (tab: TabFilter) => {
    setActiveTab(tab);
    setDateRange({ start: "", end: "" });
  };

  // ── CSV export ─────────────────────────────────────────────────────────
  const handleExport = () => {
    exportTransactionsCsv(
      filtered,
      `tipz-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  // ── Not connected ──────────────────────────────────────────────────────
  if (!connected) {
    return (
      <PageContainer maxWidth="xl" className="space-y-8 py-10">
        <PageHeader />
        <EmptyState
          icon={<Wallet />}
          title="Connect your wallet"
          description="Connect a Stellar wallet to view your transaction history."
        />
        <div className="flex justify-center">
          <WalletConnect />
        </div>
      </PageContainer>
    );
  }

  // ── Initial loading ────────────────────────────────────────────────────
  if (loading && filtered.length === 0) {
    return (
      <PageContainer
        maxWidth="xl"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-10"
      >
        <Loader size="lg" text="Loading transaction history…" />
      </PageContainer>
    );
  }

  // ── Error (no data at all) ─────────────────────────────────────────────
  if (error && filtered.length === 0) {
    return (
      <PageContainer maxWidth="xl" className="py-20">
        <ErrorState category={categorizeError(error).category} onRetry={refetch} />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="xl" className="space-y-8 py-10">
      {/* ── Header ── */}
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
            Wallet activity
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-black uppercase">
            <History size={32} />
            Transactions
          </h1>
          <p className="mt-2 text-sm font-bold text-gray-600">
            Your complete history of tips, sends, and withdrawals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleExport}
            disabled={filtered.length === 0}
            aria-label="Export transactions as CSV"
          >
            Export CSV
          </Button>
          <WalletConnect />
        </div>
      </section>

      {/* ── Tabs ── */}
      <div
        role="tablist"
        aria-label="Transaction type filter"
        className="flex border-b-2 border-black"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2 text-sm uppercase tracking-wide transition-colors ${
                isActive
                  ? "font-bold border-b-[3px] border-black -mb-[2px]"
                  : "font-normal hover:underline"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab panel ── */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="space-y-5"
      >
        {/* Date range filter */}
        <TransactionFilters
          dateRange={dateRange}
          onDateRangeChange={(range) => {
            setDateRange(range);
          }}
        />

        {/* Result count */}
        {filtered.length > 0 && (
          <p className="text-sm font-bold text-gray-600">
            {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
            {(dateRange.start || dateRange.end) && " matching filter"}
          </p>
        )}

        {/* Transaction list */}
        {filtered.length === 0 && !loading ? (
          <EmptyState
            icon={<History />}
            title="No transactions found"
            description={
              dateRange.start || dateRange.end
                ? "Try adjusting the date range."
                : activeTab === "all"
                ? "You haven't made or received any transactions yet."
                : `No ${activeTab} transactions yet.`
            }
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} aria-hidden="true" />

        {/* Load more indicator */}
        {loading && filtered.length > 0 && (
          <div className="flex justify-center py-6">
            <Loader size="md" text="Loading more…" />
          </div>
        )}

        {/* Manual load more fallback */}
        {!loading && hasMore && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" onClick={handleLoadMore}>
              Load more
            </Button>
          </div>
        )}

        {/* End of list */}
        {!hasMore && filtered.length > 0 && !loading && (
          <p className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 py-4">
            — End of history —
          </p>
        )}
      </div>
    </PageContainer>
  );
};

// ── Sub-component ──────────────────────────────────────────────────────────
const PageHeader: React.FC = () => (
  <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div>
      <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
        Wallet activity
      </p>
      <h1 className="mt-2 flex items-center gap-3 text-4xl font-black uppercase">
        <History size={32} />
        Transactions
      </h1>
    </div>
  </section>
);

export default TransactionsPage;
