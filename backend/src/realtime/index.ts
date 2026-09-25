export {
  initRealtime,
  emitTipCreated,
  emitNotificationCreated,
  emitBalanceUpdated,
  emitLeaderboardUpdated,
  getIO,
} from "./gateway.js";
export type {
  ServerToClientEvents,
  ClientToServerEvents,
  NotificationPayload,
  BalanceUpdatedPayload,
  LeaderboardUpdatedPayload,
} from "./types.js";
