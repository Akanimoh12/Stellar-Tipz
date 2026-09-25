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

export interface SubmitWithdrawalResult {
  id: string;
  txHash: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  amount: string;
  fee: string;
  netAmount: string;
}
