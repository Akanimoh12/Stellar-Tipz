export interface NotificationPayload {
  [key: string]: unknown;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  payload: NotificationPayload;
  readAt: Date | null;
  createdAt: Date;
}

export interface PaginatedNotifications {
  items: NotificationItem[];
  cursor: string | null;
  hasMore: boolean;
}
