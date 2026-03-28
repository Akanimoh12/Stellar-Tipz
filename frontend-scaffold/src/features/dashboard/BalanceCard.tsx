import React from "react";

import AmountDisplay from "../../components/shared/AmountDisplay";
import Button from "../../components/ui/Button";

interface BalanceCardProps {
  balance: string;
  feeBps: number;
  onWithdraw: () => void;
}

const BalanceCard: React.FC<BalanceCardProps> = ({
  balance,
  feeBps,
  onWithdraw,
}) => {
  return (
    <section
      className="space-y-5 border-[4px] border-black bg-[#fff2b2] p-6 sm:p-8"
      style={{ boxShadow: "10px 10px 0px 0px rgba(0,0,0,1)" }}
    >
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-gray-600">
          Available for withdrawal
        </p>
        <AmountDisplay
          amount={balance}
          className="block text-4xl sm:text-5xl lg:text-6xl"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm font-bold text-gray-700">
          Withdrawal fee: {(feeBps / 100).toFixed(2)}%
        </p>
        <Button className="w-full sm:w-auto" onClick={onWithdraw}>
          Withdraw
        </Button>
      </div>
    </section>
  );
};

export default BalanceCard;
