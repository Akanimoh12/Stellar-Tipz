import { z } from 'zod';

export const notificationsQuerySchema = z.object({
  unreadOnly: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1, 'Invalid cursor').optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).refine((query) => query.cursor === undefined || query.offset === undefined, {
  message: 'cursor and offset cannot be used together',
});

export const notificationIdParamSchema = z.object({
  id: z.string().min(1),
});

export const updateNotificationPreferencesSchema = z
  .object({
    tipReceived: z.boolean().optional(),
    goalReached: z.boolean().optional(),
    subscriptionCharged: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one preference must be provided',
  });

export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;
export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;
