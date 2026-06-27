import { z } from 'zod';

export const imageUploadSchema = z.object({
  dataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|gif|webp);base64,/, 'Invalid image data URL'),
});

export type ImageUploadInput = z.infer<typeof imageUploadSchema>;
