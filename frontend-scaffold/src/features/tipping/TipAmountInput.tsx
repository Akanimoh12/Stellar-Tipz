import BigNumber from "bignumber.js";
import React, { useEffect, useState } from "react";

import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { env } from "../../helpers/env";
import {
  stroopToXlm,
  xlmToStroop,
  formatXlmDisplay,
} from "../../helpers/format";
import { useWallet, useContract, useBalance } from "../../hooks";
import { logger } from '../../services/logger';
import { BASE_FEE } from "../../services";
import FeeBreakdown from "./FeeBreakdown";
import Skeleton from "../../components/ui/Skeleton";

interface TipAmountInputProps {
  amount: string;
  onChange: (amount: string) => void;
  /** Creator wallet address — when set, uses per-creator minimum tip if configured */
  creatorAddress?: string;
}

const QUICK_AMOUNTS = ["1", "5", "10", "25", "50"];
const DEFAULT_MIN_TIP_XLM = "0.1"; // 1,000,000 stroops
const ESTIMATED_NETWORK_FEE_XLM = new BigNumber(stroopToXlm(BASE_FEE, 5));

const TipAmountInput: React.FC<TipAmountInputProps> = ({
  amount,
  onChange,
  creatorAddress,
}) => {
  const { connected, publicKey } = useWallet();
  const { getMinTipAmount, getCreatorMinTip } = useContract();
  const [useCustom, setUseCustom] = useState(!QUICK_AMOUNTS.includes(amount));
  const [minTipXlm, setMinTipXlm] = useState<string>(DEFAULT_MIN_TIP_XLM);
  const { balance: fetchedBalance, loading } = useBalance(publicKey);

  // Fetch minimum tip amount from contract
  useEffect(() => {
    let active = true;

    const fetchMinTip = async () => {
      try {
        const minTip = creatorAddress
          ? await getCreatorMinTip(creatorAddress)
          : await getMinTipAmount();
        if (active) {
          setMinTipXlm(minTip);
        }
      } catch (err) {
        logger.warn('features/tipping/TipAmountInput', 'Failed to fetch minimum tip amount', undefined, err instanceof Error ? err : new Error(String(err)));
        // Use default if fetch fails
        if (active) {
          setMinTipXlm(DEFAULT_MIN_TIP_XLM);
        }
      }
    };

    void fetchMinTip();

    return () => {
      active = false;
    };
  }, [getMinTipAmount, getCreatorMinTip, creatorAddress]);

  const effectiveBalance = fetchedBalance;
  const numericAmount = Number(amount);
  const numericBalance = Number(effectiveBalance);
  const numericMinTip = Number(minTipXlm);
  const amountBigNumber = Number.isNaN(numericAmount)
    ? new BigNumber(0)
    : new BigNumber(amount || "0");
  const amountInStroops =
    Number.isNaN(numericAmount) || numericAmount <= 0
      ? null
      : xlmToStroop(amount);
  const platformFeeXlm = amountBigNumber.multipliedBy(0.02);
  const totalCost = amountBigNumber
    .plus(platformFeeXlm)
    .plus(ESTIMATED_NETWORK_FEE_XLM);
  const balanceBigNumber =
    !effectiveBalance || Number.isNaN(numericBalance)
      ? null
      : new BigNumber(effectiveBalance);

  let amountError: string | undefined;

  if (!amount.trim()) {
    amountError = "Enter a tip amount.";
  } else if (Number.isNaN(numericAmount)) {
    amountError = "Amount must be numeric.";
  } else if (numericAmount <= 0) {
    amountError = "Amount must be greater than 0.";
  } else if (numericAmount < numericMinTip) {
    amountError = `Minimum tip is ${minTipXlm} XLM.`;
  } else if (
    connected &&
    effectiveBalance &&
    !Number.isNaN(numericBalance) &&
    numericAmount > numericBalance
  ) {
    amountError = "Amount exceeds your available XLM balance.";
  } else if (connected && balanceBigNumber && totalCost.gt(balanceBigNumber)) {
    amountError =
      "Total cost exceeds your available XLM balance once network fees are included.";
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600">
        Tip amount
      </p>

      <div className="rounded-md border-2 border-black bg-yellow-100 p-5 text-center">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600">
          Selected amount
        </p>
        <p className="mt-2 text-4xl font-black">
          {amount || "0"} <span className="text-2xl">XLM</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((value) => (
          <Button
            key={value}
            type="button"
            variant={!useCustom && amount === value ? "primary" : "outline"}
            size="sm"
            onClick={() => {
              setUseCustom(false);
              onChange(value);
            }}
          >
            {value} XLM
          </Button>
        ))}

        <Button
          type="button"
          variant={useCustom ? "primary" : "outline"}
          size="sm"
          data-tip-amount-trigger="true"
          onClick={() => {
            setUseCustom(true);
            if (QUICK_AMOUNTS.includes(amount)) {
              onChange("");
            }
          }}
        >
          Custom
        </Button>
      </div>

      {useCustom && (
        <Input
          label="Custom amount"
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          placeholder="0.0"
          value={amount}
          onChange={(event) => onChange(event.target.value)}
          error={amountError}
          data-tip-amount="true"
          className="scroll-safe-bottom"
        />
      )}

      {!useCustom && amountError && (
        <p className="text-sm font-medium text-red-600">{amountError}</p>
      )}

      <FeeBreakdown
        amountBigNumber={amountBigNumber}
        amountInStroops={amountInStroops}
        platformFeeXlm={platformFeeXlm}
        networkFeeXlm={ESTIMATED_NETWORK_FEE_XLM}
        totalCost={totalCost}
        balanceBigNumber={balanceBigNumber}
        connected={connected}
      />

      <p className="text-sm font-bold text-gray-600">
        Your balance:{" "}
        {loading ? (
          <span
            className="inline-block align-middle ml-2"
            data-testid="balance-skeleton"
          >
            <Skeleton className="h-4 w-16" />
          </span>
        ) : effectiveBalance ? (
          `${Number(effectiveBalance).toLocaleString()} XLM`
        ) : (
          "Connect wallet to load balance"
        )}
      </p>
    </div>
  );
};

export default TipAmountInput;
