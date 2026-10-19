import React, { useState, useMemo } from 'react';
import { History, ExternalLink } from 'lucide-react';

import DataTable from '@/components/shared/DataTable';
import type { DataTableColumn } from '@/components/shared/DataTable';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Loader from '@/components/ui/Loader';
import WalletConnect from '@/components/shared/WalletConnect';
import ErrorState from '@/components/shared/ErrorState';
import { categorizeError } from '@/helpers/error';
import { stroopToXlm, truncateString } from '@/helpers/format';
import { useWalletStore } from '@/store/walletStore';
import {
  useTransactionHistory,
  type Transaction,
  type TabFilter,
  type DateRange,
} from '@/hooks/useTransactionHistory';

const TABS: { id: TabFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sent', label: 'Sent' },
  { id: 'received', label: 'Received' },
  { id: 'withdrawals', label: 'Withdrawals' },
];

const PAGE_SIZE = 20;

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  received: {
    label: 'Received',
    className: 'border-green-400 text-green-700 bg-green-50',
  },
  sent: {
    label: 'Sent',
    className: 'border-red-400 text-red-700 bg-red-50',
  },
  withdrawal: {
    label: 'Withdrawal',
    className: 'border-blue-400 text-blue-700 bg-blue-50',
  },
};

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr || '—';
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

const TransactionHistory: React.FC = () => {
  const { connected, publicKey, network } = useWalletStore();
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange>({ start: '', end: '' });
  const [page, setPage] = useState(1);

  const { filtered, loading, error, refetch } = useTransactionHistory(
    publicKey,
    activeTab,
    dateRange,
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pagedData = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const explorerBase =
    network === 'PUBLIC'
      ? 'https://stellar.expert/explorer/public'
      : 'https://stellar.expert/explorer/testnet';

  const columns: DataTableColumn<Transaction>[] = useMemo(
    () => [
      {
        key: 'date',
        label: 'Date',
        sortable: true,
        render: (row) => (
          <span className="font-medium">{formatDate(row.date)}</span>
        ),
      },
      {
        key: 'type',
        label: 'Type',
        render: (row) => {
          const badge = TYPE_BADGE[row.type];
          return (
            <span
              className={`inline-flex items-center border-2 px-2 py-0.5 text-xs font-black uppercase tracking-wide ${badge.className}`}
            >
              {badge.label}
            </span>
          );
        },
      },
      {
        key: 'counterparty',
        label: 'From',
        render: (row) => (
          <span className="font-mono text-xs">
            {truncateAddress(row.counterparty)}
          </span>
        ),
      },
      {
        key: 'amount',
        label: 'Amount',
        align: 'right',
        sortable: true,
        render: (row) => {
          const prefix =
            row.type === 'received'
              ? '+'
              : row.type === 'sent'
              ? '−'
              : '↓';
          const color =
            row.type === 'received'
              ? 'text-green-700'
              : row.type === 'sent'
              ? 'text-red-700'
              : 'text-blue-700';
          return (
            <span className={`font-black ${color}`}>
              {prefix}
              {stroopToXlm(row.amount, 7)} XLM
            </span>
          );
        },
      },
      {
        key: 'message',
        label: 'Message',
        render: (row) =>
          row.message ? (
            <span className="truncate italic text-gray-600 max-w-[200px] block">
              &ldquo;{row.message}&rdquo;
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          ),
      },
      {
        key: 'txHash',
        label: 'ID',
        hidden: true,
        render: (row) =>
          row.txHash ? (
            <a
              href={`${explorerBase}/tx/${row.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs text-blue-500 hover:text-blue-700 underline"
              onClick={(e) => e.stopPropagation()}
              aria-label="View on Stellar Explorer"
            >
              {truncateString(row.txHash)}
              <ExternalLink size={11} />
            </a>
          ) : (
            <span className="text-gray-400">—</span>
          ),
      },
    ],
    [explorerBase],
  );

  const handleTabChange = (tab: TabFilter) => {
    setActiveTab(tab);
    setDateRange({ start: '', end: '' });
    setPage(1);
  };

  if (!connected) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
            Wallet activity
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-black uppercase">
            <History size={32} />
            Transactions
          </h1>
        </div>
        <EmptyState
          title="Connect your wallet"
          description="Connect a Stellar wallet to view your transaction history."
        />
        <div className="flex justify-center">
          <WalletConnect />
        </div>
      </div>
    );
  }

  if (loading && filtered.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader size="lg" text="Loading transaction history…" />
      </div>
    );
  }

  if (error && filtered.length === 0) {
    return <ErrorState errorData={categorizeError(error)} onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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
      </section>

      {/* Tabs */}
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
              id={`tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2 text-sm uppercase tracking-wide transition-colors ${
                isActive
                  ? 'font-bold border-b-[3px] border-black -mb-[2px]'
                  : 'font-normal hover:underline'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="th-date-start"
            className="text-xs font-black uppercase tracking-[0.2em] text-gray-500"
          >
            From
          </label>
          <input
            id="th-date-start"
            type="date"
            value={dateRange.start}
            max={dateRange.end || undefined}
            onChange={(e) => {
              setDateRange({ ...dateRange, start: e.target.value });
              setPage(1);
            }}
            className="h-10 border-2 border-black bg-white px-3 text-sm font-medium focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="th-date-end"
            className="text-xs font-black uppercase tracking-[0.2em] text-gray-500"
          >
            To
          </label>
          <input
            id="th-date-end"
            type="date"
            value={dateRange.end}
            min={dateRange.start || undefined}
            onChange={(e) => {
              setDateRange({ ...dateRange, end: e.target.value });
              setPage(1);
            }}
            className="h-10 border-2 border-black bg-white px-3 text-sm font-medium focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          />
        </div>
        {(dateRange.start || dateRange.end) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDateRange({ start: '', end: '' });
              setPage(1);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Result count */}
      {filtered.length > 0 && (
        <p className="text-sm font-bold text-gray-600">
          {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
          {(dateRange.start || dateRange.end) && ' matching filter'}
        </p>
      )}

      {/* Data table */}
      {pagedData.length === 0 && !loading ? (
        <EmptyState
          icon={<History />}
          title="No transactions found"
          description={
            dateRange.start || dateRange.end
              ? 'Try adjusting the date range.'
              : activeTab === 'all'
              ? "You haven't made or received any transactions yet."
              : `No ${activeTab} transactions yet.`
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={pagedData}
          keyExtractor={(row) => row.id}
          tabletColumns={['date', 'type', 'amount']}
          pagination={{
            currentPage: safePage,
            totalPages,
            onPageChange: setPage,
          }}
        />
      )}
    </div>
  );
};

export default TransactionHistory;
