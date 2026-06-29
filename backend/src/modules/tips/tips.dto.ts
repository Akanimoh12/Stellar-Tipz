export interface TipResponseDto {
  id: string;
  txHash: string;
  ledger: number;
  fromAddress: string;
  toAddress: string;
  amountStroops: string;
  status: string;
  message: string | null;
  createdAt: string;
}
