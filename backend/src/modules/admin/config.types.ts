/**
 * Types for admin contract-config mutation endpoints.
 */

/** Returned by every prepare endpoint. */
export interface PreparedConfigTx {
  /** Base64-encoded unsigned Soroban transaction XDR for the admin to sign. */
  unsignedTxXdr: string;
  /** Human-readable description of what this transaction will do. */
  description: string;
  contractId: string;
  networkPassphrase: string;
}

/** Returned by every submit endpoint on success. */
export interface SubmittedConfigTx {
  txHash: string;
  status: 'PENDING' | 'SUCCESS' | 'ERROR';
}

/** Pending fee change as surfaced to callers (coordinates with #016). */
export interface PendingFeeChange {
  /** Proposed fee in basis points. */
  newFeeBps: number;
  /** Current fee in basis points (before change is applied). */
  currentFeeBps: number;
  /** Ledger sequence at which the change becomes effective. */
  effectiveLedger: number;
  /** Ledger sequence at which the change was proposed. */
  proposedLedger: number;
  /** True when this is a fee decrease (no timelock). */
  isDecrease: boolean;
}
