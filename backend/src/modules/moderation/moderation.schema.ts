import { z } from 'zod';

export const createModerationReportSchema = z.object({
  targetType: z.enum(['profile', 'tip', 'goal', 'subscription', 'message', 'other']),
  targetId: z.string().min(1).max(160),
  reason: z.enum(['spam', 'harassment', 'impersonation', 'fraud', 'illegal_content', 'other']),
  details: z.string().max(2_000).optional(),
}).strict();

export type CreateModerationReportInput = z.infer<typeof createModerationReportSchema>;

export const createModerationAppealSchema = z.object({
  moderationActionId: z.string().min(1).max(160),
  reason: z.string().min(1).max(2_000),
  details: z.string().max(5_000).optional(),
}).strict();

export type CreateModerationAppealInput = z.infer<typeof createModerationAppealSchema>;

export const reviewModerationAppealSchema = z.object({
  decision: z.enum(['upheld', 'overturned']),
  notes: z.string().max(5_000).optional(),
}).strict();

export type ReviewModerationAppealInput = z.infer<typeof reviewModerationAppealSchema>;
