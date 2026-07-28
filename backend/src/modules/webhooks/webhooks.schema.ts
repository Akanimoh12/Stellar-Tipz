import { z } from "zod";

/** Event types a webhook subscription can be registered for. */
export const WEBHOOK_EVENT_TYPES = [
  "tip.received",
  "tip.sent",
  "goal.completed",
  "withdrawal.completed",
  "credit_score.updated",
] as const;

export const createWebhookSubscriptionSchema = z.object({
  url: z
    .string()
    .url("Must be a valid URL")
    .startsWith("https://", "Webhook URL must use https"),
  events: z
    .array(z.enum(WEBHOOK_EVENT_TYPES))
    .min(1, "At least one event is required"),
});

export const listWebhookSubscriptionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const webhookSubscriptionIdParamSchema = z.object({
  id: z.string().min(1, "Webhook subscription ID is required"),
});

export type CreateWebhookSubscriptionInput = z.infer<typeof createWebhookSubscriptionSchema>;
export type ListWebhookSubscriptionsQuery = z.infer<typeof listWebhookSubscriptionsQuerySchema>;
export type WebhookSubscriptionIdParam = z.infer<typeof webhookSubscriptionIdParamSchema>;

export const deliveryQuerySchema = z.object({
  subscriptionId: z.string().optional(),
  status: z.enum(["PENDING", "SUCCESS", "FAILED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const deliveryIdParamSchema = z.object({
  id: z.string().min(1, "Delivery ID is required"),
});

export type DeliveryQuery = z.infer<typeof deliveryQuerySchema>;
export type DeliveryIdParam = z.infer<typeof deliveryIdParamSchema>;
