import { beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

// Integration test environment configuration
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://tipz_test:tipz_test@localhost:5433/tipz_test';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.JWT_SECRET = 'integration-test-secret-key';
process.env.JWT_EXPIRES_IN = '15m';
process.env.REFRESH_TOKEN_EXPIRES_IN = '7d';
process.env.AUTH_CHALLENGE_TTL_SECONDS = '300';
process.env.STELLAR_NETWORK = 'TESTNET';
process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
process.env.HORIZON_URL = 'https://horizon-testnet.stellar.org';
process.env.NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
process.env.CONTRACT_ID = 'CA3D5KRXK7XK7Q5V5Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z7O4X7';
process.env.LOG_LEVEL = 'silent';
process.env.PORT = '4001';
process.env.API_BASE_PATH = '/api/v1';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.INDEXER_POLL_INTERVAL_MS = '5000';
process.env.REALTIME_REDIS_ADAPTER_ENABLED = 'false';

const prisma = new PrismaClient();

/**
 * Run Prisma migrations before all integration tests.
 * This verifies that migrations are valid and brings the test DB to the latest schema.
 */
beforeAll(async () => {
  console.log('🔧 Running Prisma migrations for integration tests...');
  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: 'inherit',
    });
    console.log('✅ Migrations applied successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }

  // Verify connection
  await prisma.$connect();
  console.log('✅ Database connection established');
}, 60000); // 60s timeout for migrations

/**
 * Clean up all tables before each test to ensure isolation.
 * Uses transaction-based truncation for speed.
 */
beforeEach(async () => {
  await prisma.$transaction([
    // Delete in dependency-safe order (children first)
    prisma.webhookDelivery.deleteMany(),
    prisma.webhookSubscription.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.deadLetterJob.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.tip.deleteMany(),
    prisma.withdrawal.deleteMany(),
    prisma.payoutSchedule.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.authChallenge.deleteMany(),
    prisma.apiKey.deleteMany(),
    prisma.goal.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.streak.deleteMany(),
    prisma.leaderboardSnapshot.deleteMany(),
    prisma.creditScoreHistory.deleteMany(),
    prisma.creditScore.deleteMany(),
    prisma.xAccount.deleteMany(),
    prisma.eventLog.deleteMany(),
    prisma.indexerCursor.deleteMany(),
    prisma.user.deleteMany(),
  ]);
});

/**
 * Disconnect Prisma after all tests complete.
 */
afterAll(async () => {
  await prisma.$disconnect();
  console.log('✅ Database connection closed');
});

export { prisma };
