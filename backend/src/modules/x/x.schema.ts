/**
 * Zod validation schemas for X module (issues #1294, #1293).
 */

import { z } from "zod";

export const linkXAccountSchema = z.object({
  xHandle: z
    .string()
    .min(1, "X handle is required")
    .max(15, "X handle must be 15 characters or less")
    .regex(/^[a-zA-Z0-9_]+$/, "X handle can only contain letters, numbers, and underscores"),
  proofType: z.enum(["oauth", "post_nonce"], {
    errorMap: () => ({ message: "Invalid proof type" }),
  }),
  proofData: z
    .string()
    .min(1, "Proof data is required"),
});

export const unlinkXAccountSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export const verifyProofSchema = z.object({
  xHandle: z.string().min(1).max(15),
  nonce: z.string().min(1),
});

export type LinkXAccountInput = z.infer<typeof linkXAccountSchema>;
export type VerifyProofInput = z.infer<typeof verifyProofSchema>;
