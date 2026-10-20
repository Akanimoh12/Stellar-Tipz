import BigNumber from "bignumber.js";
import React, { useEffect, useMemo, useState } from "react";

import AmountDisplay from "../../components/shared/AmountDisplay";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import { stroopToXlmBigNumber, xlmToStroop } from "../../helpers/format";
import { useTipz, useFeeBreakdown } from "../../hooks";
import { logger } from '../../services/logger';

interface WithdrawModalProps {
  isOpen: boolean;
  balance: string;
  feeBps: number;
  minWithdrawal?: number | string;
  onClose: () => void;
  onSuccess?: (params: {
    amountXlm: string;
    amountStroops: string;
    txHash: string;
  }) => void;
  onFailure?: () => void;
}

const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  balance,
  feeBps,
  minWithdrawal,
  onClose,
  onSuccess,
  onFailure,
}) => {
  const { withdrawTips, withdrawing, error, txHash, reset } = useTipz();
  const [amount, setAmount] = useState("");

  const balanceXlm = useMemo(
    () => stroopToXlmBigNumber(balance || "0"),
    [balance],
  );

  useEffect(() => {
    if (isOpen) {
      setAmount(balanceXlm.toFixed());
    }
  }, [balanceXlm, isOpen]);

  const parsedAmount = useMemo(() => {
    const trimmedAmount = amount.trim();
    if (!trimmedAmount) {
      return null;
    }

    const nextAmount = new BigNumber(trimmedAmount);
    return nextAmount.isFinite() ? nextAmount : null;
  }, [amount]);

  const amountError = useMemo(() => {
    if (!amount.trim()) {
      return "Enter the amount you want to withdraw.";
    }

    if (!parsedAmount) {
      return "Enter a valid XLM amount.";
    }

    if (parsedAmount.lte(0)) {
      return "Withdrawal amount must be greater than zero.";
    }

    if (minWithdrawal !== undefined) {
      const minWNumber = new BigNumber(minWithdrawal);
      if (parsedAmount.lt(minWNumber)) {
        return `Minimum withdrawal amount is ${minWithdrawal} XLM.`;
      }
    }

    if (parsedAmount.gt(balanceXlm)) {
      return "Withdrawal amount cannot exceed your available balance.";
    }

    return null;
  }, [amount, parsedAmount, balanceXlm, minWithdrawal]);

  const requestedStroops = useMemo(() => {
    if (!parsedAmount || amountError) {
      return "0";
    }

    return xlmToStroop(parsedAmount).toFixed(0);
  }, [amountError, parsedAmount]);

  const handleWithdraw = async () => {
    if (amountError) {
      return;
    }

    try {
      const hash = await withdrawTips(amount);
      onSuccess?.({
        amountXlm: amount,
        amountStroops: requestedStroops,
        txHash: hash,
      });
    } catch (err) {
      logger.error('features/dashboard/WithdrawModal', 'Withdrawal failed', undefined, err instanceof Error ? err : new Error(String(err)));
      onFailure?.();
    }
  };

  const handleClose = () => {
    reset();
    setAmount(balanceXlm.toFixed());
    onClose();
  };

  const {
    breakdown,
    isEstimating,
    estimationError,
    canSign,
    refresh,
  } = useFeeBreakdown({
    amount: parsedAmount ? parsedAmount.toFixed() : "0",
    platformFeePercent: (feeBps || 200) / 10000,
    isOpen,
  });

  const { fee, net } = useMemo(() => {
    const rawAmount = BigInt(requestedStroops);
    const feeAmount = (rawAmount * BigInt(feeBps)) / BigInt(10_000);
    const netAmount = rawAmount - feeAmount;

    return {
      fee: feeAmount.toString(),
      net: netAmount.toString(),
    };
  }, [feeBps, requestedStroops]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Withdraw balance">
      <div className="space-y-5">
        <p className="text-sm font-medium leading-6 text-gray-700">
          Choose how much of your current balance you want to withdraw. The fee
          and estimated net payout update before you confirm.
        </p>

        {estimationError && (
          <div
            className="p-3 border-2 border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm font-bold"
            role="alert"
          >
            <p>{estimationError}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-2 text-xs font-black uppercase underline hover:text-black"
            >
              Retry Fee Estimation
            </button>
          </div>
        )}

        {error && (
          <div
            className="p-3 border-2 border-red-500 bg-red-50 text-red-700 text-sm"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            {error}
          </div>
        )}

        {txHash && (
          <div
            className="p-3 border-2 border-green-500 bg-green-50 text-green-700 text-sm"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            Withdrawal successful! Transaction hash: {txHash}
          </div>
        )}

        <div className="relative">
          <Input
            label="Amount to withdraw"
            type="number"
            step="0.0000001"
            min="0"
            max={balanceXlm.toFixed()}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            disabled={withdrawing}
            error={amountError ?? undefined}
          />
          <button
            type="button"
            onClick={() => setAmount(balanceXlm.toFixed())}
            className="absolute right-3 top-[38px] text-xs font-black uppercase underline hover:text-gray-600"
            disabled={withdrawing}
          >
            Max
          </button>
        </div>

        <div className="grid gap-3">
          <div className="border-2 border-black bg-yellow-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
              Available balance
            </p>
            <AmountDisplay amount={balance} className="mt-2 block text-2xl" />
          </div>
          <div className="border-2 border-black bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
              Requested amount
            </p>
            <AmountDisplay
              amount={requestedStroops}
              className="mt-2 block text-xl"
            />
            {breakdown.amountFiat && (
              <span className="text-xs font-bold text-gray-500 block mt-1">
                ≈ {breakdown.amountFiat}
              </span>
            )}
          </div>
          <div className="border-2 border-black bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
              Platform Fee ({(feeBps / 100).toFixed(1)}%)
            </p>
            <AmountDisplay amount={fee} className="mt-2 block text-xl" />
            {breakdown.platformFeeFiat && (
              <span className="text-xs font-bold text-gray-500 block mt-1">
                ≈ {breakdown.platformFeeFiat}
              </span>
            )}
          </div>
          <div className="border-2 border-black bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
              Network Fee
            </p>
            <span className="mt-2 block text-xl font-bold">
              {isEstimating ? "Estimating..." : `${breakdown.networkFeeXLM} XLM`}
            </span>
            {breakdown.networkFeeFiat && !isEstimating && (
              <span className="text-xs font-bold text-gray-500 block mt-1">
                ≈ {breakdown.networkFeeFiat}
              </span>
            )}
          </div>
          <div className="border-2 border-black bg-black p-4 text-white">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">
              Net payout
            </p>
            <AmountDisplay
              amount={net}
              className="mt-2 block text-2xl text-white"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button
            onClick={handleWithdraw}
            disabled={withdrawing || Boolean(amountError) || !canSign || Boolean(estimationError)}
          >
            {withdrawing ? "Withdrawing..." : "Confirm withdrawal"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default WithdrawModal;
