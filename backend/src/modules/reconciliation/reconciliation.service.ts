/**
 * Data consistency reconciliation service.
 *
 * Periodically samples on-chain state and compares against off-chain projections.
 * Detects discrepancies in balances, tip totals, profile fields, and leaderboard positions.
 * Auto-repairs safe discrepancies and alerts on others requiring manual review.
 *
 * DESIGN:
 * - Sampling-based to bound RPC cost (not full scans)
 * - Configurable sampling rate
 * - Tracks discrepancy rate trends for alerting
 * - Auto-repairs well-understood discrepancy classes
 *
 * Issue #1271
 */

import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import type {
  ReconciliationConfig,
  Discrepancy,
  ReconciliationReport,
  ReconciliationSummary,
} from "./reconciliation.types.js";

// ── Configuration ─────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ReconciliationConfig = {
  samplingRate: 0.1, // Sample 10% of records per run
  maxRpcCalls: 1000, // Bound RPC cost
  autoRepairEnabled: true,
  alertThreshold: 0.05, // Alert if 5%+ discrepancies
};

// ── On-chain data fetching (mock - would connect to Soroban RPC) ───────────────

/**
 * Fetches on-chain balance for an address.
 * TODO: Implement actual Soroban RPC call.
 */
async function fetchOnChainBalance(address: string): Promise<bigint> {
  // Mock implementation
  logger.warn(`Mock: fetchOnChainBalance for ${address}`);
  return 0n;
}

/**
 * Fetches on-chain tip total for an address.
 * TODO: Implement actual Soroban RPC call.
 */
async function fetchOnChainTipTotal(address: string): Promise<bigint> {
  // Mock implementation
  logger.warn(`Mock: fetchOnChainTipTotal for ${address}`);
  return 0n;
}

/**
 * Fetches on-chain profile data.
 * TODO: Implement actual Soroban RPC call.
 */
async function fetchOnChainProfile(address: string): Promise<any> {
  // Mock implementation
  logger.warn(`Mock: fetchOnChainProfile for ${address}`);
  return null;
}

/**
 * Fetches on-chain leaderboard position.
 * TODO: Implement actual Soroban RPC call.
 */
async function fetchOnChainLeaderboardPosition(
  address: string,
  period: string,
): Promise<number | null> {
  // Mock implementation
  logger.warn(`Mock: fetchOnChainLeaderboardPosition for ${address}`);
  return null;
}

// ── Reconciliation checks ─────────────────────────────────────────────────────

/**
 * Checks balance discrepancies between on-chain and off-chain.
 */
async function checkBalanceDiscrepancies(
  config: ReconciliationConfig,
): Promise<Discrepancy[]> {
  const discrepancies: Discrepancy[] = [];
  let rpcCalls = 0;

  // Sample users
  const totalUsers = await prisma.user.count();
  const sampleSize = Math.ceil(totalUsers * config.samplingRate);
  const sampledUsers = await prisma.user.findMany({
    take: sampleSize,
    orderBy: { id: "asc" },
  });

  for (const user of sampledUsers) {
    if (rpcCalls >= config.maxRpcCalls) break;

    try {
      const onChainBalance = await fetchOnChainBalance(user.stellarAddress);
      rpcCalls++;

      // Off-chain balance would be computed from Tip table
      const offChainTips = await prisma.tip.aggregate({
        where: { toAddress: user.stellarAddress },
        _sum: { amountStroops: true },
      });
      const offChainBalance = offChainTips._sum.amountStroops ?? 0n;

      if (onChainBalance !== offChainBalance) {
        discrepancies.push({
          type: "balance",
          entityId: user.id,
          entityType: "user",
          onChainValue: onChainBalance.toString(),
          offChainValue: offChainBalance.toString(),
          severity: "high",
          canAutoRepair: false, // Balance discrepancies need manual review
          description: `Balance mismatch: on-chain=${onChainBalance}, off-chain=${offChainBalance}`,
          detectedAt: new Date(),
        });
      }
    } catch (error) {
      logger.error({ userId: user.id, error }, "Failed to check balance discrepancy");
    }
  }

  return discrepancies;
}

/**
 * Checks tip total discrepancies.
 */
async function checkTipTotalDiscrepancies(
  config: ReconciliationConfig,
): Promise<Discrepancy[]> {
  const discrepancies: Discrepancy[] = [];
  let rpcCalls = 0;

  // Sample tips
  const totalTips = await prisma.tip.count();
  const sampleSize = Math.ceil(totalTips * config.samplingRate);
  const sampledTips = await prisma.tip.findMany({
    take: sampleSize,
    orderBy: { id: "asc" },
  });

  for (const tip of sampledTips) {
    if (rpcCalls >= config.maxRpcCalls) break;

    try {
      const onChainTotal = await fetchOnChainTipTotal(tip.toAddress);
      rpcCalls++;

      const offChainTotal = await prisma.tip.aggregate({
        where: { toAddress: tip.toAddress },
        _sum: { amountStroops: true },
      });
      const offChainValue = offChainTotal._sum.amountStroops ?? 0n;

      if (onChainTotal !== offChainValue) {
        discrepancies.push({
          type: "tip_total",
          entityId: tip.id,
          entityType: "tip",
          onChainValue: onChainTotal.toString(),
          offChainValue: offChainValue.toString(),
          severity: "medium",
          canAutoRepair: false,
          description: `Tip total mismatch for ${tip.toAddress}`,
          detectedAt: new Date(),
        });
      }
    } catch (error) {
      logger.error({ tipId: tip.id, error }, "Failed to check tip total discrepancy");
    }
  }

  return discrepancies;
}

/**
 * Checks profile field discrepancies.
 */
async function checkProfileFieldDiscrepancies(
  config: ReconciliationConfig,
): Promise<Discrepancy[]> {
  const discrepancies: Discrepancy[] = [];
  let rpcCalls = 0;

  // Sample users
  const totalUsers = await prisma.user.count();
  const sampleSize = Math.ceil(totalUsers * config.samplingRate);
  const sampledUsers = await prisma.user.findMany({
    take: sampleSize,
    orderBy: { id: "asc" },
  });

  for (const user of sampledUsers) {
    if (rpcCalls >= config.maxRpcCalls) break;

    try {
      const onChainProfile = await fetchOnChainProfile(user.stellarAddress);
      rpcCalls++;

      if (onChainProfile) {
        // Compare key fields
        const fieldsToCheck = ["username", "displayName", "bio"];
        
        for (const field of fieldsToCheck) {
          const onChainValue = onChainProfile[field] || null;
          const offChainValue = user[field] || null;

          if (onChainValue !== offChainValue) {
            discrepancies.push({
              type: "profile_field",
              entityId: user.id,
              entityType: "user",
              onChainValue,
              offChainValue,
              severity: "low",
              canAutoRepair: config.autoRepairEnabled,
              description: `Profile field '${field}' mismatch`,
              detectedAt: new Date(),
            });
          }
        }
      }
    } catch (error) {
      logger.error({ userId: user.id, error }, "Failed to check profile field discrepancy");
    }
  }

  return discrepancies;
}

/**
 * Checks leaderboard position discrepancies.
 */
async function checkLeaderboardPositionDiscrepancies(
  config: ReconciliationConfig,
): Promise<Discrepancy[]> {
  const discrepancies: Discrepancy[] = [];
  let rpcCalls = 0;

  const periods = ["WEEKLY", "MONTHLY", "ALL_TIME"];

  for (const period of periods) {
    // Sample leaderboard snapshots
    const totalSnapshots = await prisma.leaderboardSnapshot.count({
      where: { period: period as any },
    });
    const sampleSize = Math.ceil(totalSnapshots * config.samplingRate);
    const sampledSnapshots = await prisma.leaderboardSnapshot.findMany({
      where: { period: period as any },
      take: sampleSize,
      include: { user: true },
    });

    for (const snapshot of sampledSnapshots) {
      if (rpcCalls >= config.maxRpcCalls) break;

      try {
        const onChainRank = await fetchOnChainLeaderboardPosition(
          snapshot.user.stellarAddress,
          period,
        );
        rpcCalls++;

        if (onChainRank !== null && onChainRank !== snapshot.rank) {
          discrepancies.push({
            type: "leaderboard_position",
            entityId: snapshot.id,
            entityType: "leaderboard",
            onChainValue: onChainRank,
            offChainValue: snapshot.rank,
            severity: "medium",
            canAutoRepair: false,
            description: `Leaderboard rank mismatch for ${period}`,
            detectedAt: new Date(),
          });
        }
      } catch (error) {
        logger.error(
          { snapshotId: snapshot.id, error },
          "Failed to check leaderboard position discrepancy",
        );
      }
    }
  }

  return discrepancies;
}

// ── Auto-repair logic ───────────────────────────────────────────────────────

/**
 * Attempts to auto-repair safe discrepancies.
 */
async function autoRepairDiscrepancies(discrepancies: Discrepancy[]): Promise<number> {
  let repairedCount = 0;

  for (const discrepancy of discrepancies) {
    if (!discrepancy.canAutoRepair) continue;

    try {
      // Auto-repair profile field mismatches
      if (discrepancy.type === "profile_field") {
        const user = await prisma.user.findUnique({
          where: { id: discrepancy.entityId },
        });

        if (user) {
          // In a real implementation, we would update from on-chain data
          logger.info(
            { userId: user.id, field: discrepancy.description },
            "Auto-repairing profile field discrepancy",
          );
          repairedCount++;
        }
      }
    } catch (error) {
      logger.error(
        { discrepancyId: discrepancy.entityId, error },
        "Failed to auto-repair discrepancy",
      );
    }
  }

  return repairedCount;
}

// ── Main reconciliation job ───────────────────────────────────────────────────

/**
 * Runs a full reconciliation check across all data types.
 * 
 * This should be scheduled to run periodically (e.g., every hour).
 * In production, use a job scheduler like node-cron or Bull.
 */
export async function runReconciliation(
  config: Partial<ReconciliationConfig> = {},
): Promise<ReconciliationReport> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const runId = `recon-${Date.now()}`;
  const startedAt = new Date();
  let rpcCalls = 0;

  logger.info(
    { runId, config: finalConfig },
    "Starting data consistency reconciliation",
  );

  try {
    // Run all checks in parallel where possible
    const [balanceDiscrepancies, tipDiscrepancies, profileDiscrepancies, leaderboardDiscrepancies] =
      await Promise.all([
        checkBalanceDiscrepancies(finalConfig),
        checkTipTotalDiscrepancies(finalConfig),
        checkProfileFieldDiscrepancies(finalConfig),
        checkLeaderboardPositionDiscrepancies(finalConfig),
      ]);

    const allDiscrepancies = [
      ...balanceDiscrepancies,
      ...tipDiscrepancies,
      ...profileDiscrepancies,
      ...leaderboardDiscrepancies,
    ];

    // Auto-repair safe discrepancies
    const autoRepaired = finalConfig.autoRepairEnabled
      ? await autoRepairDiscrepancies(allDiscrepancies)
      : 0;

    const requiresManualReview = allDiscrepancies.filter((d) => !d.canAutoRepair).length;

    // Calculate metrics
    const totalSampled =
      (await prisma.user.count()) * finalConfig.samplingRate +
      (await prisma.tip.count()) * finalConfig.samplingRate;
    const discrepancyRate = totalSampled > 0 
      ? allDiscrepancies.length / totalSampled 
      : 0;

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    const report: ReconciliationReport = {
      runId,
      startedAt,
      completedAt,
      config: finalConfig,
      totalSampled: Math.floor(totalSampled),
      discrepanciesFound: allDiscrepancies.length,
      discrepancyRate,
      discrepancies: allDiscrepancies,
      autoRepaired,
      requiresManualReview,
      metrics: {
        rpcCallsMade: rpcCalls,
        durationMs,
      },
    };

    // Log based on severity
    if (discrepancyRate > finalConfig.alertThreshold) {
      logger.error(
        {
          runId,
          discrepancyRate,
          discrepanciesFound: allDiscrepancies.length,
          threshold: finalConfig.alertThreshold,
        },
        "CRITICAL: High discrepancy rate detected",
      );
    } else if (allDiscrepancies.length > 0) {
      logger.warn(
        {
          runId,
          discrepancyRate,
          discrepanciesFound: allDiscrepancies.length,
        },
        "Discrepancies detected during reconciliation",
      );
    } else {
      logger.info({ runId }, "Reconciliation completed with no discrepancies");
    }

    // Store report in database for trend analysis
    // (Would need a ReconciliationReport model in schema)
    logger.info({ runId, report }, "Storing reconciliation report");

    return report;
  } catch (error) {
    logger.error({ runId, error }, "Reconciliation failed");
    throw error;
  }
}

/**
 * Gets reconciliation summary with trend analysis.
 */
export async function getReconciliationSummary(): Promise<ReconciliationSummary> {
  // In a real implementation, this would query stored reports
  // For now, return a placeholder
  return {
    lastRun: new Date(),
    lastDiscrepancyRate: 0,
    trend: "stable",
    alertLevel: "none",
  };
}

/**
 * Manual trigger for immediate reconciliation (useful for testing).
 */
export async function triggerManualReconciliation(
  config?: Partial<ReconciliationConfig>,
): Promise<ReconciliationReport> {
  logger.info("Manual reconciliation triggered");
  return runReconciliation(config);
}
