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
