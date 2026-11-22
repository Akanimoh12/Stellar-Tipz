import React, { useState, useEffect } from "react";
import { ArrowDownToLine, ReceiptText } from "lucide-react";

import AmountDisplay from "../../components/shared/AmountDisplay";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { formatTimestamp } from "../../helpers/format";
import BalanceCard from "./BalanceCard";
import EarningsChart from "./EarningsChart";
import WithdrawModal from "./WithdrawModal";
import Loader from "../../components/ui/Loader";
import { Tip } from "../../types/contract";
import { useToastStore } from "@/store/toastStore";
import { useDashboardContext } from "./DashboardContext";

interface WithdrawalHistoryItem {
  id: string;
  amount: string;
  fee: string;
  net: string;
  txHash: string | null;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  requestedAt: string;
  confirmedAt: string | null;
}

const DEFAULT_FEE_BPS = 200;

const EarningsTab: React.FC = () => {
  const {
    profile,
    tips,
    stats,
    loading,
    applyOptimisticWithdrawal,
    revertOptimisticWithdrawal,
    refetch,
  } = useDashboardContext();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalHistoryItem[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(true);
  const [withdrawalsError, setWithdrawalsError] = useState<string | null>(null);
  const { addToast } = useToastStore();
  const feeBps = stats?.feeBps ?? DEFAULT_FEE_BPS;

  useEffect(() => {
    const fetchWithdrawals = async () => {
      setWithdrawalsLoading(true);
      setWithdrawalsError(null);
      try {
        const response = await fetch("/api/withdrawals/me?limit=50");
        if (!response.ok) {
          throw new Error(`Failed to fetch withdrawals: ${response.statusText}`);
        }
        const data = await response.json();
        setWithdrawals(data.data || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setWithdrawalsError(message);
      } finally {
        setWithdrawalsLoading(false);
      }
    };

    void fetchWithdrawals();
  }, []);

  if (loading && !profile) {
    return (
      <div className="flex justify-center py-20">
        <Loader size="lg" text="Loading earnings..." />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6 pt-6">
      <BalanceCard
        balance={profile.balance}
        feeBps={feeBps}
        onWithdraw={() => setWithdrawOpen(true)}
      />

      <Card padding="lg" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-800 dark:text-gray-200">
              Earnings trend
            </p>
            <h2 className="mt-2 text-2xl font-black uppercase">
              Performance snapshot
            </h2>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-sm font-bold uppercase text-gray-600">
            <ArrowDownToLine size={16} />
            Withdrawals enabled
          </div>
        </div>
        <EarningsChart tips={tips} />
      </Card>

      <Card padding="lg" className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-800 dark:text-gray-200">
              Withdrawal history
            </p>
            <h2 className="mt-2 text-2xl font-black uppercase">
              Past payouts
            </h2>
          </div>
          <Button onClick={() => setWithdrawOpen(true)}>Withdraw</Button>
        </div>

        {withdrawalsLoading ? (
          <div className="flex justify-center py-12">
            <Loader size="md" text="Loading withdrawal history..." />
          </div>
        ) : withdrawalsError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-semibold">Error loading withdrawals</p>
            <p className="text-red-600 text-sm mt-1">{withdrawalsError}</p>
          </div>
        ) : withdrawals.length === 0 ? (
          <EmptyState
            icon={<ReceiptText />}
            title="No withdrawals yet"
            description="Completed withdrawals will appear here with fee and net payout details."
          />
        ) : (
          <div className="space-y-3">
            {withdrawals.map((entry) => {
              const statusColor =
                entry.status === "CONFIRMED"
                  ? "text-green-600"
                  : entry.status === "FAILED"
                    ? "text-red-600"
                    : "text-yellow-600";

              return (
                <article
                  key={entry.id}
                  className="grid gap-4 border-[3px] border-black bg-[#faf7ef] p-4 md:grid-cols-[1.1fr_repeat(3,minmax(0,1fr))_1fr]"
                >
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
                      Requested
                    </p>
                    <p className="mt-2 text-lg font-black">
                      {new Date(entry.requestedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
                      Gross
                    </p>
                    <AmountDisplay
                      amount={entry.amount}
                      className="mt-2 block text-lg"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
                      Fee
                    </p>
                    <AmountDisplay
                      amount={entry.fee}
                      className="mt-2 block text-lg"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
                      Net
                    </p>
                    <AmountDisplay
                      amount={
                        (BigInt(entry.amount) - BigInt(entry.fee)).toString()
                      }
                      className="mt-2 block text-lg"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
                      Status
                    </p>
                    <p className={`mt-2 text-sm font-bold uppercase ${statusColor}`}>
                      {entry.status}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      <WithdrawModal
        isOpen={withdrawOpen}
        balance={profile.balance}
        feeBps={feeBps}
        minWithdrawal={10}
        onClose={() => setWithdrawOpen(false)}
        onSuccess={({ amountXlm, amountStroops }) => {
          applyOptimisticWithdrawal(amountStroops);
          addToast({
            type: "success",
            message: `Withdrawal successful: ${amountXlm} XLM`,
            duration: 3500,
          });
          refetch();
        }}
        onFailure={() => revertOptimisticWithdrawal()}
      />
    </div>
  );
};

export default EarningsTab;
