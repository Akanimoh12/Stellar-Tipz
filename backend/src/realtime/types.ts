/**
 * Shared Socket.IO event contract for Stellar Tipz realtime layer.
 * Ensures client and server agree on event names, payloads, and socket data.
 */

import type { Server as HttpServer } from 'node:http';
import type { Server as SocketIOServer, Socket } from 'socket.io';

/** Authenticated user data attached to socket after successful handshake. */
export interface SocketAuthData {
  userId: string;
  address: string; // Stellar address
  tier: 'new' | 'bronze' | 'silver' | 'gold' | 'diamond';
  iat?: number; // issued at (unix seconds)
  exp?: number; // expires at (unix seconds)
}

/** Extended socket data map for type-safe custom properties. */
export interface SocketData {
  auth?: SocketAuthData;
  /** Per-socket rate limit tick marker (set by packet rate limiter) */
  __rateLimitTick?: number;
}

/** Client-to-server events */
export interface ClientToServerEvents {
  /** Join a creator's room for live tip updates */
  'room:join': (creatorAddress: string, ack: (err?: { message: string }) => void) => void;
  /** Leave a creator's room */
  'room:leave': (creatorAddress: string) => void;
  /** Subscribe to leaderboard updates */
  'leaderboard:subscribe': (period: 'all' | 'monthly' | 'weekly', ack: (err?: { message: string }) => void) => void;
  /** Unsubscribe from leaderboard updates */
  'leaderboard:unsubscribe': (period: 'all' | 'monthly' | 'weekly') => void;
  /** Heartbeat/ping from client */
  'ping': (ack: (ts: number) => void) => void;
}

/** Server-to-client events */
export interface ServerToClientEvents {
  /** New tip received by a creator the client is watching */
  'tip:created': (payload: TipCreatedPayload) => void;
  /** Credit score changed for a creator */
  'credit:updated': (payload: CreditUpdatedPayload) => void;
  /** Leaderboard snapshot update */
  'leaderboard:updated': (payload: LeaderboardUpdatedPayload) => void;
  /** New notification for the authenticated user */
  'notification:created': (payload: NotificationCreatedPayload) => void;
  /** Error emitted to client (rate limit, auth, etc.) */
  'error': (payload: ErrorPayload) => void;
  /** Connection acknowledged with server time */
  'connected': (payload: ConnectedPayload) => void;
  /** Pong response with server timestamp */
  'pong': (serverTs: number) => void;
}

/** Inter-server events (for multi-process scaling with Redis adapter) */
export interface InterServerEvents {
  /** Broadcast tip event to all gateway processes */
  'broadcast:tip': (payload: TipCreatedPayload) => void;
  /** Broadcast credit update to all gateway processes */
  'broadcast:credit': (payload: CreditUpdatedPayload) => void;
  /** Broadcast leaderboard update to all gateway processes */
  'broadcast:leaderboard': (payload: LeaderboardUpdatedPayload) => void;
  /** Broadcast notification to all gateway processes */
  'broadcast:notification': (payload: NotificationCreatedPayload) => void;
}

/** Socket data attached to each connected client */
export interface SocketDataExtended extends SocketData {}

/** Payload for tip:created event */
export interface TipCreatedPayload {
  tipId: number;
  creator: string;
  sender: string;
  amount: string; // stroops as string to avoid JS number precision loss
  message?: string;
  isAnonymous: boolean;
  timestamp: number;
}

/** Payload for credit:updated event */
export interface CreditUpdatedPayload {
  creator: string;
  previousScore: number;
  newScore: number;
  previousTier: string;
  newTier: string;
  timestamp: number;
}

/** Payload for leaderboard:updated event */
export interface LeaderboardUpdatedPayload {
  period: 'all' | 'monthly' | 'weekly';
  entries: Array<{
    rank: number;
    address: string;
    username: string;
    amount: string;
    creditScore: number;
  }>;
  timestamp: number;
}

/** Payload for notification:created event */
export interface NotificationCreatedPayload {
  id: string;
  userId: string;
  type: 'tip_received' | 'credit_tier_changed' | 'leaderboard_rank' | 'subscription' | 'system';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: number;
}

/** Payload for error event */
export interface ErrorPayload {
  code: 'UNAUTHENTICATED' | 'RATE_LIMITED' | 'BANNED' | 'INVALID_PAYLOAD' | 'NOT_FOUND' | 'INTERNAL_ERROR';
  message: string;
  retryAfterMs?: number;
}

/** Payload for connected event */
export interface ConnectedPayload {
  socketId: string;
  serverTime: number;
  heartbeatIntervalMs: number;
}

/** Type-safe socket instance */
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketDataExtended>;

/** Type-safe server instance */
export type TypedServer = SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketDataExtended>;

/** Initialize and attach the Socket.IO server to an HTTP server */
export function initRealtime(_httpServer: HttpServer): TypedServer {
  // Implementation in gateway.ts
  throw new Error('initRealtime not implemented — import from gateway.ts');
}