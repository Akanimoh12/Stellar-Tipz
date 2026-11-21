import { z } from 'zod';

export const stellarEnvSchema = z.object({
  STELLAR_NETWORK: z.enum(['LOCAL', 'TESTNET', 'FUTURENET', 'MAINNET']).default('TESTNET'),
  SOROBAN_RPC_URL: z.string().url(),
  HORIZON_URL: z.string().url(),
  /** Comma-separated failover endpoints in priority order, after the primary. */
  SOROBAN_RPC_FALLBACK_URLS: z.string().default(''),
  HORIZON_FALLBACK_URLS: z.string().default(''),
  NETWORK_PASSPHRASE: z.string(),
  CONTRACT_ID: z.string().optional(),
  EXPECTED_CONTRACT_VERSION: z.coerce.number().int().positive().default(4),

  // Outbound timeouts
  SOROBAN_RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  HORIZON_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),

  // Circuit breakers
  RPC_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().positive().default(5),
  RPC_CIRCUIT_BREAKER_RESET_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  HORIZON_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().positive().default(5),
  HORIZON_CIRCUIT_BREAKER_RESET_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type StellarEnv = z.infer<typeof stellarEnvSchema>;
