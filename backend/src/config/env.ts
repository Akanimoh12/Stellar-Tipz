import 'dotenv/config';
import { z } from 'zod';
import {
  serverEnvSchema,
  databaseEnvSchema,
  authEnvSchema,
  stellarEnvSchema,
  indexerEnvSchema,
  servicesEnvSchema,
  observabilityEnvSchema,
} from './schemas/index.js';

export * from './schemas/index.js';

/**
 * Centralised, validated environment configuration.
 * Every module should import `env` from here rather than reading process.env directly.
 * Broken up by subsystem schema per section (#1629).
 */
export const envBaseSchema = serverEnvSchema
  .merge(databaseEnvSchema)
  .merge(authEnvSchema)
  .merge(stellarEnvSchema)
  .merge(indexerEnvSchema)
  .merge(servicesEnvSchema)
  .merge(observabilityEnvSchema);

export const envSchema = envBaseSchema.superRefine((data, ctx) => {
  // A leader must get at least two renewal attempts per lease, or one slow
  // Redis round trip would hand leadership over (issue #1263).
  if (data.INDEXER_LEADER_RENEW_INTERVAL_MS * 2 >= data.INDEXER_LEADER_LEASE_MS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['INDEXER_LEADER_RENEW_INTERVAL_MS'],
      message: 'INDEXER_LEADER_RENEW_INTERVAL_MS must be less than half of INDEXER_LEADER_LEASE_MS',
    });
  }

  // Production-specific hardening (issue #098) — dev ergonomics untouched,
  // but production reports ALL violations together for actionable startup failure.
  if (data.NODE_ENV !== 'production') return;

  const issues: { path: (string | number)[]; message: string }[] = [];

  // ── JWT_SECRET: substantially stronger in production ───────────────────
  const weakSecrets = new Set([
    'change-me-in-production',
    'changeme',
    'secret',
    'password',
    'test-secret-key-for-testing',
    'test-secret-key-for-vitest',
    'supersecretkey',
    'your_jwt_secret',
    '12345678',
  ]);
  const jwtLower = data.JWT_SECRET.toLowerCase();
  if (data.JWT_SECRET.length < 32) {
    issues.push({
      path: ['JWT_SECRET'],
      message: `JWT_SECRET must be at least 32 characters in production (got ${data.JWT_SECRET.length}). Generate with: openssl rand -hex 32`,
    });
  }
  if (weakSecrets.has(data.JWT_SECRET) || weakSecrets.has(jwtLower)) {
    issues.push({
      path: ['JWT_SECRET'],
      message: 'JWT_SECRET uses a known default/weak value — generate a unique secret (openssl rand -hex 32) and do not use the example placeholder',
    });
  }
  if (jwtLower.includes('change-me') || jwtLower.includes('changeme') || jwtLower === 'test-secret-key-for-testing' || jwtLower === 'test-secret-key-for-vitest') {
    if (!weakSecrets.has(data.JWT_SECRET) && !weakSecrets.has(jwtLower)) {
      issues.push({
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must not be a default placeholder value in production',
      });
    }
  }

  // ── CONTRACT_ID required in production ────────────────────────────────
  if (!data.CONTRACT_ID || data.CONTRACT_ID.trim().length === 0) {
    issues.push({
      path: ['CONTRACT_ID'],
      message: 'CONTRACT_ID is required in production — set the deployed Soroban contract address (starts with C, 56 chars)',
    });
  }

  // ── MAINNET consistency checks ────────────────────────────────────────
  if (data.STELLAR_NETWORK === 'MAINNET') {
    const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
    const MAINNET_HORIZON = 'https://horizon.stellar.org';

    if (data.NETWORK_PASSPHRASE !== MAINNET_PASSPHRASE) {
      issues.push({
        path: ['NETWORK_PASSPHRASE'],
        message: `STELLAR_NETWORK=MAINNET requires NETWORK_PASSPHRASE="${MAINNET_PASSPHRASE}" (got "${data.NETWORK_PASSPHRASE}")`,
      });
    }
    if (data.HORIZON_URL !== MAINNET_HORIZON) {
      if (data.HORIZON_URL.includes('testnet') || data.HORIZON_URL.includes('futurenet')) {
        issues.push({
          path: ['HORIZON_URL'],
          message: `STELLAR_NETWORK=MAINNET requires HORIZON_URL="${MAINNET_HORIZON}" (got "${data.HORIZON_URL}" — looks like testnet/futurenet)`,
        });
      } else {
        issues.push({
          path: ['HORIZON_URL'],
          message: `STELLAR_NETWORK=MAINNET requires HORIZON_URL="${MAINNET_HORIZON}" (got "${data.HORIZON_URL}")`,
        });
      }
    }
    const rpcLower = data.SOROBAN_RPC_URL.toLowerCase();
    if (rpcLower.includes('testnet') || rpcLower.includes('futurenet')) {
      issues.push({
        path: ['SOROBAN_RPC_URL'],
        message: `STELLAR_NETWORK=MAINNET requires a mainnet Soroban RPC URL (got "${data.SOROBAN_RPC_URL}" — contains testnet/futurenet)`,
      });
    } else if (!rpcLower.includes('mainnet') && data.SOROBAN_RPC_URL !== MAINNET_HORIZON) {
      issues.push({
        path: ['SOROBAN_RPC_URL'],
        message: `STELLAR_NETWORK=MAINNET requires a mainnet SOROBAN_RPC_URL containing "mainnet" (got "${data.SOROBAN_RPC_URL}")`,
      });
    }
  }

  for (const issue of issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: issue.path,
      message: issue.message,
    });
  }
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
