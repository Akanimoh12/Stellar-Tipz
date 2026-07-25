import { z } from 'zod';

export const notificationsQuerySchema = z.object({
  unreadOnly: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const notificationIdParamSchema = z.object({
  id: z.string().min(1),
});

export const updateNotificationPreferencesSchema = z
  .object({
    tipReceived: z.boolean().optional(),
    goalReached: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one preference must be provided',
  });

export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;
export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;
