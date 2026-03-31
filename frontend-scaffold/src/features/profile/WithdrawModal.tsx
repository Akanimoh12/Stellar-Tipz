import React from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import AmountDisplay from "@/components/shared/AmountDisplay";
import { hasPositiveBalance } from "@/helpers/balance";
import { useTipz, useProfile } from "@/hooks";
import Input from "@/components/ui/Input";
import TransactionStatus from "@/components/shared/TransactionStatus";
import { useToastStore } from "@/store/toastStore";
import { ERRORS, categorizeError } from "@/helpers/error";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: string;
  feeBps: number;
}

/**
 * WithdrawModal allows creators to withdraw their earned tips to  their connected wallet.
 */
const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  balance,
  feeBps,
}) => {
  const [amount, setAmount] = React.useState("");
  const { withdrawTips, withdrawing, error, txHash, txStatus, reset } = useTipz();
  const { refetch } = useProfile();
  const { addToast } = useToastStore();

  const numericBalance = parseFloat(balance);
  const numericAmount = parseFloat(amount) || 0;
  
  const fee = (numericAmount * feeBps) / 10000;
  const netAmount = Math.max(0, numericAmount - fee);

  const canWithdraw = numericAmount > 0 && numericAmount <= numericBalance;

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWithdraw) return;

    try {
      await withdrawTips(amount);
      addToast({
        type: "success",
        message: `Successfully withdrawn ${amount} XLM`,
        duration: 5000,
      });
      refetch();
      setTimeout(onClose, 2000); // Close after a short delay to show success state
    } catch (err) {
      console.error("Withdrawal failed:", err);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Withdraw Tips">
      <form onSubmit={handleWithdraw} className="space-y-6">
        <p className="text-gray-600 font-medium">
          Transfer your available balance to your connected Stellar wallet.
          A platform fee of {(feeBps / 100).toFixed(1)}% applies.
        </p>

        <div className="space-y-4">
          <div className="relative">
            <Input
              label="Amount to Withdraw"
              type="number"
              step="0.0000001"
              min="0"
              max={balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              disabled={withdrawing || txStatus === 'success'}
            />
            <button
              type="button"
              onClick={() => setAmount(balance)}
              className="absolute right-3 top-[38px] text-xs font-black uppercase underline hover:text-gray-600"
              disabled={withdrawing || txStatus === 'success'}
            >
              Max
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 border-2 border-black bg-gray-50">
              <p className="text-[10px] font-black uppercase text-gray-400">Platform Fee</p>
              <p className="font-bold">{fee.toFixed(2)} XLM</p>
            </div>
            <div className="p-3 border-2 border-black bg-green-50">
              <p className="text-[10px] font-black uppercase text-green-600">You'll Receive</p>
              <p className="font-bold text-green-700">{netAmount.toFixed(2)} XLM</p>
            </div>
          </div>
        </div>

        <div className="p-6 border-4 border-black bg-yellow-100 flex flex-col items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mb-2 text-center">
            Total Available Balance
          </p>
          <AmountDisplay amount={balance} className="text-3xl" />
        </div>

        {txStatus === 'signing' || txStatus === 'submitting' || txStatus === 'confirming' ? (
          <TransactionStatus
            status={txStatus}
            txHash={txHash ?? undefined}
            errorMessage={error ? (categorizeError(error) === 'network' ? ERRORS.NETWORK : ERRORS.CONTRACT) : undefined}
          />
        ) : null}

        {txStatus === 'success' && (
          <div className="p-3 border-2 border-green-500 bg-green-50 text-green-700 text-sm font-bold text-center uppercase">
            Withdrawal Successful!
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            type="submit"
            className="w-full"
            loading={withdrawing}
            disabled={withdrawing || !canWithdraw || txStatus === 'success'}
          >
            {withdrawing ? "Processing..." : "Confirm Withdrawal"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            type="button"
            onClick={handleClose}
            className="w-full"
            disabled={withdrawing}
          >
            {txStatus === 'success' ? "Done" : "Cancel"}
          </Button>
        </div>

        <p className="text-[10px] text-center font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
          Network fees will be deducted by the Stellar network.<br />
          Funds will be available in your wallet instantly.
        </p>
      </form>
    </Modal>
  );
};

export default WithdrawModal;
