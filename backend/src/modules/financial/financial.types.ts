export interface WithdrawalFeePreview {
  amountStroops: bigint;
  feeBps: number;
  feeStroops: bigint;
  netAmountStroops: bigint;
}

export interface RefundCheck {
  tipId: string;
  canRefund: boolean;
  reason?: string;
  requestWindowSecsRemaining?: number;
  responseWindowSecsRemaining?: number;
}
