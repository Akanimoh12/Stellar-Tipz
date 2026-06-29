import { z } from 'zod';

const stellarAddressRegex = /^G[A-Z2-7]{55}$/;
const usernameRegex = /^[a-z0-9_]+$/;
const RESERVED_USERNAMES = new Set(['admin', 'stellar', 'test', 'help', 'api', 'root']);

export const addressParamSchema = z.object({
  address: z.string().regex(stellarAddressRegex, 'Invalid Stellar address'),
});

export type AddressParam = z.infer<typeof addressParamSchema>;

export const usernameQuerySchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(usernameRegex, 'Username can only contain lowercase letters, numbers, and underscores')
    .refine((u) => !RESERVED_USERNAMES.has(u), {
      message: `Username is reserved`,
    }),
});

export type UsernameQuery = z.infer<typeof usernameQuerySchema>;

export const createProfileSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(usernameRegex, 'Username can only contain lowercase letters, numbers, and underscores')
    .refine((u) => !RESERVED_USERNAMES.has(u), {
      message: 'Username is reserved',
    }),
  displayName: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  avatarCid: z.string().max(255).optional(),
  xHandle: z.string().max(50).optional(),
});

export type CreateProfileInput = z.infer<typeof createProfileSchema>;

export const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(usernameRegex)
    .refine((u) => !RESERVED_USERNAMES.has(u))
    .optional(),
  displayName: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  avatarCid: z.string().max(255).optional(),
  xHandle: z.string().max(50).optional(),
  minTipAmount: z.string().regex(/^\d+$/, 'minTipAmount must be a string of digits (stroops)').optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const uploadImageSchema = z.object({
  dataUrl: z.string().startsWith('data:image/', 'Must be a valid data URL for an image'),
});

export type UploadImageInput = z.infer<typeof uploadImageSchema>;
