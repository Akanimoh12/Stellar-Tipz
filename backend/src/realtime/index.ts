export { initRealtime, emitTipCreated, emitNotificationCreated, emitBalanceUpdated, getIO } from "./gateway.js";
export type {
  ServerToClientEvents,
  ClientToServerEvents,
  NotificationPayload,
  BalanceUpdatedPayload,
} from "./types.js";
