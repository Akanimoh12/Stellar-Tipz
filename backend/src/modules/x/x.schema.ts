import { z } from 'zod';

export const handleParamSchema = z.object({
  handle: z.string().min(1).max(50),
});

export type HandleParam = z.infer<typeof handleParamSchema>;
