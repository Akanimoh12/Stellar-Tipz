import type { TipResponseDto } from '../modules/tips/tips.dto.js';

export interface ServerToClientEvents {
  'tip.created': (tip: TipResponseDto) => void;
  'notification.created': (notification: NotificationPayload) => void;
  'balance.updated': (balance: BalanceUpdatedPayload) => void;
}

export interface ClientToServerEvents {
  'subscribe:creator': (creatorAddress: string) => void;
  'subscribe:notifications': (userId: string) => void;
  'unsubscribe:creator': (creatorAddress: string) => void;
  'unsubscribe:notifications': (userId: string) => void;
}

export interface NotificationPayload {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  createdAt: string;
}

export interface BalanceUpdatedPayload {
  userId: string;
  stellarAddress: string;
  totalReceived: string;
  totalWithdrawn: string;
  withdrawableBalance: string;
}
