import { z } from 'zod';

export const imageUploadSchema = z.object({
  dataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|gif|webp);base64,/, 'Invalid image data URL'),
});

export type ImageUploadInput = z.infer<typeof imageUploadSchema>;

export const checkUsernameQuerySchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-z0-9_]+$/, 'Username must be lowercase alphanumeric with underscores'),
});
