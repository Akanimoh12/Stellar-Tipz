/**
 * Real-time module exports.
 * Provides Socket.IO gateway, rate limiting, and typed event contracts.
 */

export * from './types.js';
export * from './rateLimit.js';
export {
  initRealtime,
  getRealtimeServer,
  broadcastTipCreated,
  broadcastCreditUpdated,
  broadcastLeaderboardUpdated,
  sendNotificationToUser,
  closeRealtime,
} from './gateway.js';
