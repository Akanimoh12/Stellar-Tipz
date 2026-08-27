import { z } from 'zod';

export const createModerationReportSchema = z.object({
  targetType: z.enum(['profile', 'tip', 'goal', 'subscription', 'message', 'other']),
  targetId: z.string().min(1).max(160),
  reason: z.enum(['spam', 'harassment', 'impersonation', 'fraud', 'illegal_content', 'other']),
  details: z.string().max(2_000).optional(),
});

export type CreateModerationReportInput = z.infer<typeof createModerationReportSchema>;
