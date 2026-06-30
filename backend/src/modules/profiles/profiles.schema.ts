import { z } from "zod";

/**
 * Zod validation schemas for profiles endpoints.
 */

export const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  imageUrl: z.string().url().optional(),
  avatarCid: z.string().optional(),
  xHandle: z
    .string()
    .min(1)
    .max(15)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
});

export const profileIdSchema = z.object({
  id: z.string().min(1),
});

export const usernameSchema = z.object({
  username: z.string().min(1),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ProfileIdInput = z.infer<typeof profileIdSchema>;
export type UsernameInput = z.infer<typeof usernameSchema>;
