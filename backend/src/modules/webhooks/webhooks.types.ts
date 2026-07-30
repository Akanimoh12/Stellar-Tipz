import type { WebhookEventType } from "./webhooks.schema.js";

/** Lifecycle status of a webhook subscription. Mirrors the Prisma enum. */
export type WebhookSubscriptionStatus = "ACTIVE" | "DISABLED";

/** The signed envelope sent as the body of every webhook delivery. */
export interface WebhookEventEnvelope {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

/** Result of fanning an event out to matching subscriptions. */
export interface WebhookDispatchResult {
  matched: number;
  dispatched: number;
}

/** A registered webhook subscription (secret omitted — only returned on creation). */
export interface WebhookSubscriptionResponse {
  id: string;
  ownerId: string;
  url: string;
  events: string[];
  status: WebhookSubscriptionStatus;
  createdAt: string;
  updatedAt: string;
}

/** Creation response — includes the signing secret, shown once. */
export interface WebhookSubscriptionCreateResponse extends WebhookSubscriptionResponse {
  secret: string;
}

export interface WebhookSubscriptionListResponse {
  entries: WebhookSubscriptionResponse[];
  total: number;
  page: number;
  limit: number;
}

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
