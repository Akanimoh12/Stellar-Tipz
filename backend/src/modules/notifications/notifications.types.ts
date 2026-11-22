export interface NotificationResponse {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  data: NotificationResponse[];
  nextCursor: string | null;
}

/** Notification type discriminators used by the createNotification triggers. */
export type NotificationType =
  | 'tip_received'
  | 'goal_reached'
  | 'subscription_charged'
  | 'payout_failed'
  | 'withdrawal_completed'
  | 'security_event'
  | 'subscription_charge_failed'
  | 'subscription_failed'
  | 'webhook_disabled';

/** Operational notifications that cannot be disabled by preference settings. */
export type SystemNotificationType =
  | 'subscription_charge_failed'
  | 'subscription_failed'
  | 'webhook_disabled';

export interface UnreadCountResponse {
  count: number;
}

export interface NotificationPreferenceResponse {
  batchingEnabled: boolean;
  batchingWindowSeconds: number;
  tipReceived: boolean;
  goalReached: boolean;
  subscriptionCharged: boolean;
  updatedAt: string;
}
