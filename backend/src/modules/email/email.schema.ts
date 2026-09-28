import { z } from 'zod';

export const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(160),
  text: z.string().min(1).max(10_000),
  html: z.string().max(20_000).optional(),
  type: z.string().min(1).max(80).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type SendEmailInput = z.infer<typeof sendEmailSchema>;
