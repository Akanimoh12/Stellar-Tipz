import React from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import AmountDisplay from "@/components/shared/AmountDisplay";
import { hasPositiveBalance } from "@/helpers/balance";
import { useTipz } from "@/hooks";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: string;
}

/**
 * WithdrawModal allows creators to withdraw their earned tips to  their connected wallet.
 */
const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  balance,
}) => {
  const { withdrawTips, withdrawing, error, txHash, reset } = useTipz();
  const canWithdraw = hasPositiveBalance(balance);

  const handleWithdraw = async () => {
    if (!canWithdraw) {
      return;
    }

    try {
      await withdrawTips(balance);
      // Success - the component will close automatically or user can close manually
    } catch (err) {
      // Error is handled by the hook, we just log it
      console.error("Withdrawal failed:", err);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Withdraw Tips">
      <div className="space-y-6">
        <p className="text-gray-600 font-medium">
          Transfer your available balance to your connected Stellar wallet.
        </p>

        {error && (
          <div className="p-3 border-2 border-red-500 bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {txHash && (
          <div className="p-3 border-2 border-green-500 bg-green-50 text-green-700 text-sm">
            Withdrawal successful! Transaction hash: {txHash}
          </div>
        )}

        <div className="p-8 border-4 border-black bg-yellow-100 flex flex-col items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mb-2 text-center">
            Available for Withdrawal
          </p>
          <AmountDisplay amount={balance} className="text-4xl" />
        </div>

        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={handleWithdraw}
            className="w-full"
            disabled={withdrawing || !canWithdraw}
          >
            {withdrawing ? "Withdrawing..." : "Confirm Withdrawal"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={handleClose}
            className="w-full"
          >
            Close
          </Button>
        </div>

        <p className="text-[10px] text-center font-bold text-gray-400 uppercase tracking-widest">
          Network fees will be deducted by the Stellar network
        </p>
      </div>
    </Modal>
  );
};

export default WithdrawModal;
