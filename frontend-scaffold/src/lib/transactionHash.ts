import { Tip } from '../types/contract';

/**
 * Generates a deterministic, explorer-verifiable transaction identifier for tips.
 * For on-chain tips: uses actual txHash if available.
 * For pending tips: uses a deterministic hash based on tip signature.
 */
export const generateTipTransactionId = (tip: Tip & { txHash?: string }): string => {
  if (tip.txHash) {
    return tip.txHash;
  }

  // Generate deterministic hash from immutable tip properties
  // This allows users to verify tips even before they're fully indexed
  const tipSignature = `${tip.tipper}-${tip.creator}-${tip.amount}-${tip.timestamp}`;
  const hash = hashString(tipSignature);
  return `pending-${hash}`;
};

/**
 * Simple hash function for deterministic identifier generation.
 * Creates a stable, short hash suitable for display.
 */
const hashString = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
};

/**
 * Check if a transaction ID is a pending (non-confirmed) tip.
 */
export const isPendingTransaction = (transactionId: string): boolean => {
  return transactionId.startsWith('pending-');
};

/**
 * Format transaction ID for display (truncated for readability).
 */
export const formatTransactionId = (
  transactionId: string,
  maxLength = 16
): string => {
  if (transactionId.length <= maxLength) return transactionId;
  const start = transactionId.slice(0, maxLength / 2);
  const end = transactionId.slice(-maxLength / 2);
  return `${start}...${end}`;
};
