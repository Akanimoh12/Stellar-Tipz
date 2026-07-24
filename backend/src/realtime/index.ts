export { initRealtime } from "./realtime.gateway.js";
export type { RealtimeServer } from "./realtime.gateway.js";
export type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "./realtime.types.js";
export { initRealtime, emitTipCreated, emitNotificationCreated, getIO } from './gateway.js';
export type { ServerToClientEvents, ClientToServerEvents, NotificationPayload } from './types.js';
