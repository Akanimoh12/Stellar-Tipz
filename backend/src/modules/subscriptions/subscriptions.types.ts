export type SubscriptionIntervalName = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type SubscriptionStatusName = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED';

export interface SubscriptionResponse {
  id: string;
  tipperId: string;
  tipperStellarAddress: string;
  creatorId: string;
  creatorStellarAddress: string;
  amountStroops: string;
  interval: SubscriptionIntervalName;
  nextChargeAt: string;
  status: SubscriptionStatusName;
  createdAt: string;
}

export interface PreparedSubscriptionTx {
  unsignedTxXdr: string;
  contractId: string;
  networkPassphrase: string;
}

export interface SubmittedSubscriptionCreate {
  id: string;
  status: SubscriptionStatusName;
  nextChargeAt: string;
}

export interface SubmittedSubscriptionCancel {
  id: string;
  status: SubscriptionStatusName;
}
