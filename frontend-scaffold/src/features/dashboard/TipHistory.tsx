import React, { useMemo, useState } from 'react';

import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Table from '@/components/ui/Table';
import { truncateString, stroopToXlm } from '@/helpers/format';
import { useTips } from '../../hooks/useTips';
import { useWalletStore } from '../../store/walletStore';
import Loader from '../../components/ui/Loader';

type SortBy = 'date' | 'amount';
type DateRange = 'week' | 'month' | 'all';

const PAGE_SIZE = 20;

const rangeCutoff = (range: DateRange): number => {
  const now = Date.now();
  if (range === 'week') return now - 7 * 24 * 60 * 60 * 1000;
  if (range === 'month') return now - 30 * 24 * 60 * 60 * 1000;
  return 0;
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const toCsv = (rows: Array<{ date: string; from: string; amount: string; message: string; txHash: string }>): string => {
  const headers = ['Date', 'From', 'Amount (XLM)', 'Message', 'TX Hash'];
  const escapeCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const body = rows.map((row) => [row.date, row.from, row.amount, row.message, row.txHash].map(escapeCell).join(','));
  return [headers.join(','), ...body].join('\n');
};

const TipHistory: React.FC = () => {
  const { publicKey } = useWalletStore();
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [range, setRange] = useState<DateRange>('all');
  const [page, setPage] = useState(1);

  const { tips, loading, error } = useTips(publicKey || "", "creator", 100);

  const filteredAndSorted = useMemo(() => {
    const cutoff = rangeCutoff(range);
    const filtered = tips.filter((tip) => (cutoff === 0 ? true : tip.timestamp * 1000 >= cutoff));

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'amount') {
        return Number(b.amount) - Number(a.amount);
      }
      return b.timestamp - a.timestamp;
    });

    return sorted;
  }, [tips, sortBy, range]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pagedTips = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredAndSorted.slice(start, start + PAGE_SIZE);
  }, [filteredAndSorted, safePage]);

  const tableRows = pagedTips.map((tip) => {
    // Contract Tips don't have txHash yet, so we use a placeholder or derived ID
    const txHash = `T-${tip.timestamp.toString(16).toUpperCase()}`;
    return {
      date: formatDate(tip.timestamp),
      from: truncateString(tip.from),
      amount: stroopToXlm(tip.amount),
      message: tip.message || 'No message',
      txHash: (
        <span className="font-mono text-xs text-gray-400">
          {truncateString(txHash)}
        </span>
      ),
      txHashRaw: txHash,
    };
  });

  const handleExportCsv = () => {
    if (tableRows.length === 0) return;
    const exportRows = filteredAndSorted.map(tip => ({
      date: formatDate(tip.timestamp),
      from: tip.from,
      amount: stroopToXlm(tip.amount),
      message: tip.message || '',
      txHash: `T-${tip.timestamp.toString(16).toUpperCase()}`
    }));
    const csv = toCsv(exportRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'tip-history.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  if (loading && tips.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <Loader size="lg" text="Loading history..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={sortBy === 'date' ? 'primary' : 'outline'} onClick={() => setSortBy('date')}>
            Sort: Newest
          </Button>
          <Button size="sm" variant={sortBy === 'amount' ? 'primary' : 'outline'} onClick={() => setSortBy('amount')}>
            Sort: Amount
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={range === 'week' ? 'primary' : 'outline'} onClick={() => { setRange('week'); setPage(1); }}>
            This week
          </Button>
          <Button size="sm" variant={range === 'month' ? 'primary' : 'outline'} onClick={() => { setRange('month'); setPage(1); }}>
            This month
          </Button>
          <Button size="sm" variant={range === 'all' ? 'primary' : 'outline'} onClick={() => { setRange('all'); setPage(1); }}>
            All time
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportCsv} disabled={tips.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>

      {tableRows.length === 0 ? (
        <EmptyState 
          title="No history found" 
          description={error || "Your tip history will appear here once supporters begin sending tips."} 
        />
      ) : (
        <>
          <Table
            columns={[
              { key: 'date', label: 'Date' },
              { key: 'from', label: 'From' },
              { key: 'amount', label: 'Amount (XLM)', align: 'right' },
              { key: 'message', label: 'Message' },
              { key: 'txHash', label: 'ID' },
            ]}
            data={tableRows}
          />
          <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
};

export default TipHistory;
