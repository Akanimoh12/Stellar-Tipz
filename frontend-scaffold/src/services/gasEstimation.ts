/**
 * Gas Estimation Service
 * Simulates transactions and estimates fees before submission
 * Issue #599
 */

import { SorobanRpc, Transaction } from '@stellar/stellar-sdk';
import { logger } from './logger';

export interface FeeEstimation {
  estimatedFee: string; // in stroops
  estimatedFeeXLM: string; // in XLM
  baseFee: string;
  resourceFees: string;
  breakdown: {
    cpuInstructions: number;
    memoryBytes: number;
    readBytes: number;
    writeBytes: number;
  };
  isHighFee: boolean;
  hasSufficientBalance: boolean;
}

export class FeeEstimationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeeEstimationError';
  }
}

export const STROOPS_PER_XLM = 10_000_000;
const HIGH_FEE_THRESHOLD_XLM = 0.1; // 0.1 XLM

/**
 * Simulate a transaction and estimate gas costs.
 * Never guesses or falls back silently to a dummy estimate when simulation fails.
 */
export async function estimateTransactionFee(
  transaction: Transaction,
  server: SorobanRpc.Server,
  userBalance?: string,
  options: { allowFallback?: boolean } = {}
): Promise<FeeEstimation> {
  try {
    // Simulate the transaction
    const simulation = await server.simulateTransaction(transaction);

    if (SorobanRpc.Api.isSimulationError(simulation)) {
      throw new FeeEstimationError(`Simulation failed: ${simulation.error}`);
    }

    // Extract fee information
    const minResourceFee = simulation.minResourceFee || '0';
    const baseFee = transaction.fee || '100';
    const totalFee = (BigInt(baseFee) + BigInt(minResourceFee)).toString();
    const totalFeeXLM = (Number(totalFee) / STROOPS_PER_XLM).toFixed(7);

    // Check if fee is high
    const isHighFee = Number(totalFeeXLM) > HIGH_FEE_THRESHOLD_XLM;

    // Check if user has sufficient balance
    const hasSufficientBalance = userBalance
      ? BigInt(userBalance) > BigInt(totalFee)
      : true;

    // Extract resource breakdown
    const cost = simulation.cost as Record<string, unknown> | undefined;
    const breakdown = {
      cpuInstructions: Number(cost?.cpuInsns || 0),
      memoryBytes: Number(cost?.memBytes || 0),
      readBytes: Number(cost?.readBytes || 0),
      writeBytes: Number(cost?.writeBytes || 0),
    };

    return {
      estimatedFee: totalFee,
      estimatedFeeXLM: totalFeeXLM,
      baseFee,
      resourceFees: minResourceFee,
      breakdown,
      isHighFee,
      hasSufficientBalance,
    };
  } catch (error) {
    logger.error('services/gasEstimation', 'Fee estimation failed', undefined, error instanceof Error ? error : new Error(String(error)));
    if (options.allowFallback) {
      return getFallbackEstimation(userBalance);
    }
    throw error instanceof FeeEstimationError ? error : new FeeEstimationError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Get fallback estimation when simulation fails (only if explicitly opted-in)
 */
function getFallbackEstimation(userBalance?: string): FeeEstimation {
  const fallbackFee = '1000000'; // 0.1 XLM fallback
  const fallbackFeeXLM = '0.1';

  return {
    estimatedFee: fallbackFee,
    estimatedFeeXLM: fallbackFeeXLM,
    baseFee: '100',
    resourceFees: '999900',
    breakdown: {
      cpuInstructions: 0,
      memoryBytes: 0,
      readBytes: 0,
      writeBytes: 0,
    },
    isHighFee: false,
    hasSufficientBalance: userBalance
      ? BigInt(userBalance) > BigInt(fallbackFee)
      : true,
  };
}

/**
 * Format fee for display
 */
export function formatFee(fee: string): string {
  const feeXLM = Number(fee) / STROOPS_PER_XLM;
  return `${feeXLM.toFixed(7)} XLM`;
}

/**
 * Check if user has sufficient balance for transaction
 */
export function checkSufficientBalance(
  balance: string,
  amount: string,
  fee: string
): boolean {
  const total = BigInt(amount) + BigInt(fee);
  return BigInt(balance) >= total;
}

export interface FeeBreakdown {
  amountXLM: string;
  amountFiat: string | null;
  platformFeeXLM: string;
  platformFeeFiat: string | null;
  networkFeeXLM: string;
  networkFeeFiat: string | null;
  totalXLM: string;
  totalFiat: string | null;
  platformFeePercent: number;
}

/**
 * Calculate complete cost breakdown for transaction confirmations (both in XLM and fiat).
 */
export function calculateFeeBreakdown({
  amount,
  platformFeePercent = 0.02,
  networkFeeXLM = '0.00001',
  xlmUsdPrice = null,
}: {
  amount: string | number;
  platformFeePercent?: number;
  networkFeeXLM?: string | number;
  xlmUsdPrice?: number | null;
}): FeeBreakdown {
  const numAmount = parseFloat(String(amount)) || 0;
  const numPlatformFee = numAmount * platformFeePercent;
  const numNetworkFee = parseFloat(String(networkFeeXLM)) || 0;
  const numTotal = numAmount + numPlatformFee + numNetworkFee;

  const formatFiat = (val: number): string | null => {
    if (xlmUsdPrice === null || xlmUsdPrice === undefined || isNaN(xlmUsdPrice)) return null;
    return `$${(val * xlmUsdPrice).toFixed(2)}`;
  };

  return {
    amountXLM: numAmount.toFixed(2),
    amountFiat: formatFiat(numAmount),
    platformFeeXLM: numPlatformFee.toFixed(4),
    platformFeeFiat: formatFiat(numPlatformFee),
    networkFeeXLM: Number(numNetworkFee).toFixed(5),
    networkFeeFiat: formatFiat(numNetworkFee),
    totalXLM: numTotal.toFixed(5),
    totalFiat: formatFiat(numTotal),
    platformFeePercent: platformFeePercent * 100,
  };
}
