export interface WithdrawalResponse {
  id: string;
  amount: string;
  fee: string;
  txHash: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  requestedAt: string;
  confirmedAt: string | null;
}
