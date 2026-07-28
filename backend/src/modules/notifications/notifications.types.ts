export interface NotificationResponse {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  data: NotificationResponse[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

/** Notification type discriminators used by the createNotification triggers. */
export type NotificationType = 'tip_received' | 'goal_reached' | 'subscription_charged';

export interface UnreadCountResponse {
  count: number;
}

export interface NotificationPreferenceResponse {
  tipReceived: boolean;
  goalReached: boolean;
  subscriptionCharged: boolean;
  updatedAt: string;
}
