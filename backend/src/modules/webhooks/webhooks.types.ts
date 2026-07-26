export interface WebhookDeliveryResponse {
  id: string;
  subscriptionId: string;
  status: string;
  responseCode: number | null;
  attempts: number;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryListResponse {
  entries: WebhookDeliveryResponse[];
  total: number;
  page: number;
  limit: number;
}
