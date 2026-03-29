import React, { useMemo, useState } from "react";
import { ArrowDownToLine, ReceiptText } from "lucide-react";

import AmountDisplay from "../../components/shared/AmountDisplay";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { formatTimestamp } from "../../helpers/format";
import type { ContractStats, Profile } from "../../types";
import { mockTips } from "../mockData";
import BalanceCard from "./BalanceCard";
import EarningsChart from "./EarningsChart";
import WithdrawModal from "./WithdrawModal";

interface EarningsTabProps {
  profile: Profile;
  stats: ContractStats | null;
  loading?: boolean;
}

interface WithdrawalHistoryItem {
  id: string;
  createdAt: number;
  gross: string;
  fee: string;
  net: string;
}

const EarningsTab: React.FC<EarningsTabProps> = ({
  profile,
  stats,
  loading = false,
}) => {
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const feeBps = stats?.feeBps ?? 200;

  const withdrawals = useMemo<WithdrawalHistoryItem[]>(() => {
    return mockTips.slice(0, 4).map((tip, index) => {
      const gross = BigInt(tip.amount) * BigInt(index + 2);
      const fee = (gross * BigInt(feeBps)) / BigInt(10_000);
      const net = gross - fee;

      return {
        id: `${tip.from}-${tip.timestamp}`,
        createdAt: tip.timestamp - (index + 1) * 12 * 60 * 60,
        gross: gross.toString(),
        fee: fee.toString(),
        net: net.toString(),
      };
    });
  }, [feeBps]);

  if (loading) {
    return (
      <Card className="space-y-3">
        <p className="text-sm font-bold text-gray-600">
          Loading earnings dashboard...
        </p>
      </Card>
    );
  }

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
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
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
        <EarningsChart tips={mockTips} />
      </Card>

      <Card padding="lg" className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
              Withdrawal history
            </p>
            <h2 className="mt-2 text-2xl font-black uppercase">
              Past payouts
            </h2>
          </div>
          <Button onClick={() => setWithdrawOpen(true)}>Withdraw</Button>
        </div>

        {withdrawals.length === 0 ? (
          <EmptyState
            icon={<ReceiptText />}
            title="No withdrawals yet"
            description="Completed withdrawals will appear here with fee and net payout details."
          />
        ) : (
          <div className="space-y-3">
            {withdrawals.map((entry) => (
              <article
                key={entry.id}
                className="grid gap-4 border-[3px] border-black bg-[#faf7ef] p-4 md:grid-cols-[1.1fr_repeat(3,minmax(0,1fr))]"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">
                    Requested
                  </p>
                  <p className="mt-2 text-lg font-black">
                    {formatTimestamp(entry.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">
                    Gross
                  </p>
                  <AmountDisplay amount={entry.gross} className="mt-2 block text-lg" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">
                    Fee
                  </p>
                  <AmountDisplay amount={entry.fee} className="mt-2 block text-lg" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">
                    Net
                  </p>
                  <AmountDisplay amount={entry.net} className="mt-2 block text-lg" />
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <WithdrawModal
        isOpen={withdrawOpen}
        balance={profile.balance}
        feeBps={feeBps}
        onClose={() => setWithdrawOpen(false)}
      />
    </div>
  );
};

export default EarningsTab;
