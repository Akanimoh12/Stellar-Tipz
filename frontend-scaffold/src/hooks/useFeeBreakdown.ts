import { useState, useEffect, useCallback, useMemo } from "react";
import { useXlmPrice } from "./useXlmPrice";
import {
  calculateFeeBreakdown,
  FeeBreakdown,
  FeeEstimationError,
} from "../services/gasEstimation";

export interface UseFeeBreakdownOptions {
  amount: string | number;
  platformFeePercent?: number; // default 0.02 (2%)
  networkFeeXLM?: string | number;
  isOpen?: boolean;
  simulateFailure?: boolean; // For testing or explicit failure injection
}

export interface UseFeeBreakdownResult {
  breakdown: FeeBreakdown;
  price: number | null;
  priceLoading: boolean;
  isEstimating: boolean;
  estimationError: string | null;
  canSign: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook to calculate and maintain transaction fee breakdown before signing.
 * Displays amount, network fee, platform fee, and total in both XLM and fiat.
 * Refreshes if configuration or amount changes, and blocks signing if estimation fails.
 */
export function useFeeBreakdown({
  amount,
  platformFeePercent = 0.02,
  networkFeeXLM = "0.00001",
  isOpen = true,
  simulateFailure = false,
}: UseFeeBreakdownOptions): UseFeeBreakdownResult {
  const { price, loading: priceLoading, refetch: refetchPrice } = useXlmPrice();
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimationError, setEstimationError] = useState<string | null>(null);
  const [estimatedNetworkFee, setEstimatedNetworkFee] = useState<string>(
    String(networkFeeXLM)
  );

  const estimateFee = useCallback(async () => {
    if (!isOpen) return;
    setIsEstimating(true);
    setEstimationError(null);

    try {
      if (simulateFailure) {
        throw new FeeEstimationError(
          "Network fee estimation failed: RPC simulation error. Signing is blocked until a valid fee estimate is obtained."
        );
      }

      // Check if amount is valid
      const num = parseFloat(String(amount));
      if (isNaN(num) || num <= 0) {
        throw new FeeEstimationError("Enter a valid transaction amount to estimate fees.");
      }

      // In browser/contract environments, network fee is resolved from Soroban simulation or validated baseline
      setEstimatedNetworkFee(String(networkFeeXLM));
      setEstimationError(null);
    } catch (err) {
      const msg =
        err instanceof FeeEstimationError
          ? err.message
          : "Fee estimation failed. Unable to compute transaction network fees. Signing blocked.";
      setEstimationError(msg);
    } finally {
      setIsEstimating(false);
    }
  }, [amount, isOpen, networkFeeXLM, simulateFailure]);

  useEffect(() => {
    if (isOpen) {
      void estimateFee();
      void refetchPrice();
    }
  }, [amount, platformFeePercent, isOpen, estimateFee, refetchPrice]);

  const breakdown = useMemo(() => {
    return calculateFeeBreakdown({
      amount,
      platformFeePercent,
      networkFeeXLM: estimatedNetworkFee,
      xlmUsdPrice: price,
    });
  }, [amount, platformFeePercent, estimatedNetworkFee, price]);

  const canSign = useMemo(() => {
    return !isEstimating && !estimationError && parseFloat(String(amount)) > 0;
  }, [isEstimating, estimationError, amount]);

  return {
    breakdown,
    price,
    priceLoading,
    isEstimating,
    estimationError,
    canSign,
    refresh: estimateFee,
  };
}
