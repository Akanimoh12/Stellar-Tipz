import { z } from 'zod';

const stellarAddressRegex = /^G[A-Z2-7]{55}$/;

export const challengeRequestSchema = z.object({
  address: z
    .string()
    .regex(stellarAddressRegex, 'Invalid Stellar public key'),
});

export type ChallengeRequest = z.infer<typeof challengeRequestSchema>;
