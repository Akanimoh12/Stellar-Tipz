/**
 * Shared types for the tips module.
 */

import { TipStatus } from '../../types/enums.js';

export interface TipUserSummary {
  id: string;
  stellarAddress: string;
  username: string | null;
  displayName: string | null;
  imageUrl: string | null;
}

export interface Tip {
  id: string;
  txHash: string;
  ledger: number;
  fromAddress: string;
  toAddress: string;
  amountStroops: string;
  networkFee: string;
  tokenCode: string;
  isAnonymous: boolean;
  status: TipStatus;
  message: string | null;
  createdAt: string;
  senderId: string | null;
  recipientId: string | null;
}

export interface CreateTipRequest {
  txHash: string;
  ledger: number;
  fromAddress: string;
  toAddress: string;
  amountStroops: string;
  networkFee?: string;
  tokenCode?: string;
  isAnonymous?: boolean;
  message?: string;
}

export interface TipResponse {
  id: string;
  txHash: string;
  ledger: number;
  fromAddress: string | null; // Null if anonymous
  toAddress: string;
  amountStroops: string;
  networkFee: string;
  tokenCode: string;
  isAnonymous: boolean;
  status: TipStatus;
  message: string | null;
  createdAt: string;
  senderId: string | null; // Null if anonymous
  recipientId: string | null;
  sender?: TipUserSummary | null; // Null if anonymous or not found
  recipient?: TipUserSummary | null; // Null if not found
}
