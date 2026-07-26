import { z } from "zod";

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
