export { initRealtime, emitTipCreated, emitNotificationCreated, getIO } from './gateway.js';
export type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  NotificationPayload,
} from './types.js';
