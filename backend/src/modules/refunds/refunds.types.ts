/** Serialized refund record returned by the refunds API. */
export interface RefundResponse {
  id: string;
  tipId: string;
  /** Refunded amount in stroops, serialised as a string to preserve precision (issue #088). */
  amountStroops: string;
  reason: string;
  status: string;
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
}
