import { z } from "zod";

export const createApiKeySchema = z.object({
  scopes: z.array(z.string().min(1)).min(1, "At least one scope is required"),
  expiresAt: z.string().datetime().optional(),
});

export const rotateApiKeySchema = z.object({
  gracePeriodMinutes: z.coerce.number().int().positive().max(10080).optional(),
});

export const apiKeyIdParamSchema = z.object({
  id: z.string().min(1, "API key ID is required"),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type RotateApiKeyInput = z.infer<typeof rotateApiKeySchema>;
export type ApiKeyIdParam = z.infer<typeof apiKeyIdParamSchema>;
