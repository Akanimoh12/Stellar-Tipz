import type { TipResponseDto } from '../modules/tips/tips.dto.js';
import type { AuthPayload } from '../modules/auth/auth.types.js';
import type { TimeWindow } from '../modules/leaderboard/leaderboard.schema.js';

/**
 * Shared typed contract for the Socket.IO gateway. This is the single source
 * of truth for event names and payload shapes on both server and client.
 */

/** Events the server may emit to a connected client. */
export interface ServerToClientEvents {
  /** Emitted once, right after a successful auth handshake. */
  connected: (payload: { userId: string }) => void;
  /** Emitted for handshake failures, forbidden actions, and rate limiting. */
  error: (payload: { code: string; message: string }) => void;
  'tip.created': (tip: TipResponseDto) => void;
  'notification.created': (notification: NotificationPayload) => void;
  'balance.updated': (balance: BalanceUpdatedPayload) => void;
  'leaderboard.updated': (update: LeaderboardUpdatedPayload) => void;
}

/** Events a client may emit to the server. */
export interface ClientToServerEvents {
  'subscribe:creator': (creatorAddress: string) => void;
  'subscribe:notifications': (userId: string) => void;
  'subscribe:leaderboard': () => void;
  'unsubscribe:creator': (creatorAddress: string) => void;
  'unsubscribe:notifications': (userId: string) => void;
  'unsubscribe:leaderboard': () => void;
}

/** Events emitted between server instances (unused for now, required by the Socket.IO generic signature). */
export type InterServerEvents = Record<string, never>;

/** Per-connection data attached during the auth handshake. */
export interface SocketData {
  auth: AuthPayload;
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

export interface LeaderboardEntryPayload {
  rank: number;
  userId: string;
  stellarAddress: string;
  totalTips: string;
}

export interface LeaderboardUpdatedPayload {
  window: TimeWindow;
  entry: LeaderboardEntryPayload;
}
