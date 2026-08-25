/** Serialized refund record returned by the refunds API. */
export interface RefundResponse {
  id: string;
  tipId: string;
  amount: string;
  reason: string;
  status: string;
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PreparedRefundTx {
  unsignedTxXdr: string;
  contractId: string;
  networkPassphrase: string;
}

export interface SubmittedRefundResolution {
  id: string;
  status: string;
  txHash: string;
}
