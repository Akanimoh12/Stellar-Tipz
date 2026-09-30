import React, { useMemo, useState } from "react";

import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Table from "../../components/ui/Table";
import SkeletonWrapper from "../../components/ui/SkeletonWrapper";
import { useTips } from "../../hooks/useTips";
import { useWalletStore } from "../../store/walletStore";
import Pagination from "../../components/ui/Pagination";
import { stroopToXlm } from "../../helpers/format";
import ExportButton from "./ExportButton";
import TipsTabSkeleton from "./TipsTabSkeleton";

const PAGE_SIZE = 20;


function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

const TipsTab: React.FC = () => {
  const { publicKey } = useWalletStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [senderSearch, setSenderSearch] = useState("");

  const { tips, totalCount, loading, error } = useTips(publicKey || "", "creator", 100);

  const filtered = useMemo(() => {
    return tips.filter((tip) => {
      if (startDate) {
        const start = new Date(startDate).getTime();
        if (tip.timestamp * 1000 < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1;
        if (tip.timestamp * 1000 > end) return false;
      }
      if (senderSearch.trim()) {
        const q = senderSearch.trim().toLowerCase();
        if (!tip.tipper.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tips, startDate, endDate, senderSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, filtered.length);
  const paginated = filtered.slice(startIdx, endIdx);

  const tableData = paginated.map((tip) => ({
    date: formatTimestamp(tip.timestamp),
    tipper: truncateAddress(tip.tipper),
    amount: `${stroopToXlm(tip.amount, 7)} XLM`,
    message: tip.isEncrypted && tip.message
      ? <span><span className="text-amber-600 mr-1">🔒</span>Encrypted</span>
      : (tip.message || "—"),
  }));

  const columns = [
    { key: "date", label: "Date" },
    { key: "tipper", label: "Sender" },
    { key: "amount", label: "Amount", align: "right" as const },
    { key: "message", label: "Message" },
  ];

  if (error && tips.length === 0) {
    return (
      <div className="py-20">
        <EmptyState title="Error fetching tips" description={error} />
      </div>
    );
  }

   return (
     <SkeletonWrapper loading={loading && tips.length === 0} skeleton={<TipsTabSkeleton />}>
     <div className="space-y-5">
       <ExportButton />
       {/* Filter row */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
            From date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setCurrentPage(1);
            }}
            className="h-10 border-2 border-black bg-white px-3 text-sm font-medium focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
            To date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setCurrentPage(1);
            }}
            className="h-10 border-2 border-black bg-white px-3 text-sm font-medium focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          />
        </div>
        <div className="flex-1 min-w-[220px]">
          <Input
            label="Search by sender"
            placeholder="Paste sender address…"
            value={senderSearch}
            onChange={(e) => {
              setSenderSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {/* Row count */}
      {filtered.length > 0 && (
        <p className="text-sm font-bold text-gray-600">
          Showing {startIdx + 1}–{endIdx} of {filtered.length} tip{filtered.length !== 1 ? "s" : ""}
          {totalCount > tips.length && ` (from ${tips.length} recently loaded)`}
        </p>
      )}

      {/* Responsive table */}
      {paginated.length === 0 ? (
        tips.length === 0 ? (
          <EmptyState
            title="No tips yet"
            description="Share your profile to receive your first tip."
            action={{ label: "Go to profile", to: "/dashboard" }}
          />
        ) : (
          <EmptyState
            title="No tips match your filters"
            description="Try adjusting your date range or sender search."
            variant="filtered"
            onClearFilters={() => {
              setStartDate("");
              setEndDate("");
              setSenderSearch("");
              setCurrentPage(1);
            }}
          />
        )
      ) : (
        <div className="overflow-x-auto">
          <Table columns={columns} data={tableData} />
        </div>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
    </SkeletonWrapper>
  );
};

export default TipsTab;
