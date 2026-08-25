import { z } from 'zod';

export const payoutScheduleSchema = z.object({
  enabled: z.boolean().optional(),
  thresholdStroops: z
    .string()
    .regex(/^\d+$/, 'Must be a non-negative integer string (stroops)')
    .optional(),
  cadence: z.enum(['MANUAL', 'DAILY', 'WEEKLY', 'MONTHLY']).optional(),
});

export type PayoutScheduleInput = z.infer<typeof payoutScheduleSchema>;
