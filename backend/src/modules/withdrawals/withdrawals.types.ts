/**
 * Shared types for the withdrawals module.
 */

export interface WithdrawalResponse {
  id: string;
  userId: string;
  amount: string;
  fee: string;
  status: string;
  txHash: string | null;
  requestedAt: string;
  confirmedAt: string | null;
}
export interface WithdrawalResponse {
  id: string;
  amount: string;
  fee: string;
  txHash: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  requestedAt: string;
  confirmedAt: string | null;
}

export interface WithdrawableBalanceResponse {
  stellarAddress: string;
  totalReceived: string;
  totalWithdrawn: string;
  withdrawableBalance: string;
}
