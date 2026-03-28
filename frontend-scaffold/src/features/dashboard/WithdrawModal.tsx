import React, { useMemo } from "react";

import AmountDisplay from "../../components/shared/AmountDisplay";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";

interface WithdrawModalProps {
  isOpen: boolean;
  balance: string;
  feeBps: number;
  onClose: () => void;
}

const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  balance,
  feeBps,
  onClose,
}) => {
  const { fee, net } = useMemo(() => {
    const rawBalance = BigInt(balance || "0");
    const feeAmount = (rawBalance * BigInt(feeBps)) / BigInt(10_000);
    const netAmount = rawBalance - feeAmount;

    return {
      fee: feeAmount.toString(),
      net: netAmount.toString(),
    };
  }, [balance, feeBps]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Withdraw balance">
      <div className="space-y-5">
        <p className="text-sm font-medium leading-6 text-gray-700">
          This scaffold modal previews the withdrawal breakdown and keeps the
          action flow visible until contract-backed withdrawal execution lands.
        </p>

        <div className="grid gap-3">
          <div className="border-2 border-black bg-yellow-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">
              Gross amount
            </p>
            <AmountDisplay amount={balance} className="mt-2 block text-2xl" />
          </div>
          <div className="border-2 border-black bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">
              Fee
            </p>
            <AmountDisplay amount={fee} className="mt-2 block text-xl" />
          </div>
          <div className="border-2 border-black bg-black p-4 text-white">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">
              Net payout
            </p>
            <AmountDisplay amount={net} className="mt-2 block text-2xl text-white" />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onClose}>Confirm withdrawal</Button>
        </div>
      </div>
    </Modal>
  );
};

export default WithdrawModal;
