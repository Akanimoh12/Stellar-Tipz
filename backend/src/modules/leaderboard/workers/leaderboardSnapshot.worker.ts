/**
 * Leaderboard snapshot consistency verification worker.
 *
 * This job compares off-chain leaderboard snapshots against on-chain leaderboard state
 * to detect data divergence. On-chain is authoritative; off-chain snapshots are performance
 * caches that must be reconcilable to on-chain truth.
 *
 * Issue #1268
 */

import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../common/utils/logger.js";

// ── Configuration ─────────────────────────────────────────────────────────────

/** Tolerance for tip amount differences (in stroops) before alerting */
const AMOUNT_TOLERANCE_STROOPS = 100n; // 0.00001 XLM

/** Tolerance for rank position differences before alerting */
const RANK_TOLERANCE = 2;

/** Maximum divergence percentage before critical alert */
const MAX_DIVERGENCE_PERCENTAGE = 0.05; // 5%

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnChainEntry {
  address: string;
  username: string;
  amount: bigint;
  rank: number;
}

interface OffChainEntry {
  userId: string;
  stellarAddress: string;
  username: string | null;
  totalTips: bigint;
  rank: number;
}

interface DivergenceReport {
  period: string;
  totalEntries: number;
  divergentEntries: number;
  divergencePercentage: number;
  divergences: DivergenceDetail[];
  severity: "low" | "medium" | "critical";
}

interface DivergenceDetail {
  stellarAddress: string;
  username: string | null;
  onChainRank: number | null;
  offChainRank: number | null;
  onChainAmount: bigint | null;
  offChainAmount: bigint;
  amountDifference: bigint;
  rankDifference: number;
  issue: string;
}

// ── On-chain data fetching (mock - would connect to Soroban RPC) ───────────────

/**
 * Fetches leaderboard data from on-chain contract.
 * 
 * TODO: Replace with actual Soroban RPC call to contract's get_leaderboard function.
 * This is a mock implementation for structure.
 */
async function fetchOnChainLeaderboard(period: string): Promise<OnChainEntry[]> {
  // Mock implementation - in production, this would call the Soroban contract
  // Example:
  // const contract = new Contract(address, rpc);
  // const result = await contract.get_leaderboard(period, 50);
  
  logger.warn("Using mock on-chain data - implement Soroban RPC call");
  
  // Return empty for now - this would be replaced with actual contract call
  return [];
}

// ── Off-chain data fetching ────────────────────────────────────────────────────

/**
 * Fetches leaderboard snapshot data from off-chain database.
 */
async function fetchOffChainSnapshot(period: string): Promise<OffChainEntry[]> {
  const snapshots = await prisma.leaderboardSnapshot.findMany({
    where: { period: period as any },
    orderBy: { rank: "asc" },
    include: {
      user: {
        select: {
          id: true,
          stellarAddress: true,
          username: true,
        },
      },
    },
  });

  return snapshots.map((s) => ({
    userId: s.user.id,
    stellarAddress: s.user.stellarAddress,
    username: s.user.username,
    totalTips: s.totalTips,
    rank: s.rank,
  }));
}

// ── Comparison logic ──────────────────────────────────────────────────────────

/**
 * Compares on-chain and off-chain leaderboard entries and reports divergences.
 */
function compareLeaderboards(
  onChain: OnChainEntry[],
  offChain: OffChainEntry[],
): DivergenceReport {
  const divergences: DivergenceDetail[] = [];
  
  // Create maps for easy lookup
  const onChainMap = new Map(onChain.map((e) => [e.address, e]));
  const offChainMap = new Map(offChain.map((e) => [e.stellarAddress, e]));

  // Check all addresses present in either source
  const allAddresses = new Set([
    ...onChain.map((e) => e.address),
    ...offChain.map((e) => e.stellarAddress),
  ]);

  for (const address of allAddresses) {
    const onChainEntry = onChainMap.get(address);
    const offChainEntry = offChainMap.get(address);

    if (!onChainEntry && offChainEntry) {
      // Entry exists off-chain but not on-chain
      divergences.push({
        stellarAddress: address,
        username: offChainEntry.username,
        onChainRank: null,
        offChainRank: offChainEntry.rank,
        onChainAmount: null,
        offChainAmount: offChainEntry.totalTips,
        amountDifference: offChainEntry.totalTips,
        rankDifference: offChainEntry.rank,
        issue: "Entry exists off-chain but missing on-chain",
      });
    } else if (onChainEntry && !offChainEntry) {
      // Entry exists on-chain but not off-chain
      divergences.push({
        stellarAddress: address,
        username: onChainEntry.username,
        onChainRank: onChainEntry.rank,
        offChainRank: null,
        onChainAmount: onChainEntry.amount,
        offChainAmount: 0n,
        amountDifference: onChainEntry.amount,
        rankDifference: onChainEntry.rank,
        issue: "Entry exists on-chain but missing off-chain snapshot",
      });
    } else if (onChainEntry && offChainEntry) {
      // Both exist - check for differences
      const amountDiff = onChainEntry.amount - offChainEntry.totalTips;
      const rankDiff = Math.abs(onChainEntry.rank - offChainEntry.rank);

      if (amountDiff > AMOUNT_TOLERANCE_STROOPS || rankDiff > RANK_TOLERANCE) {
        divergences.push({
          stellarAddress: address,
          username: offChainEntry.username || onChainEntry.username,
          onChainRank: onChainEntry.rank,
          offChainRank: offChainEntry.rank,
          onChainAmount: onChainEntry.amount,
          offChainAmount: offChainEntry.totalTips,
          amountDifference: amountDiff,
          rankDifference: rankDiff,
          issue: `Amount diff: ${amountDiff} stroops, Rank diff: ${rankDiff}`,
        });
      }
    }
  }

  const totalEntries = Math.max(onChain.length, offChain.length);
  const divergencePercentage = totalEntries > 0 
    ? (divergences.length / totalEntries) * 100 
    : 0;

  // Determine severity
  let severity: "low" | "medium" | "critical" = "low";
  if (divergencePercentage > MAX_DIVERGENCE_PERCENTAGE * 100) {
    severity = "critical";
  } else if (divergencePercentage > MAX_DIVERGENCE_PERCENTAGE * 50) {
    severity = "medium";
  }

  return {
    period: "WEEKLY", // Would be parameterized
    totalEntries,
    divergentEntries: divergences.length,
    divergencePercentage,
    divergences,
    severity,
  };
}

// ── Main verification job ─────────────────────────────────────────────────────

/**
 * Main job that verifies leaderboard snapshot consistency.
 * 
 * This should be scheduled to run periodically (e.g., every 15 minutes).
 * In production, use a job scheduler like node-cron or Bull.
 */
export async function verifyLeaderboardConsistency(): Promise<DivergenceReport> {
  logger.info("Starting leaderboard snapshot consistency verification");

  try {
    // Verify all periods
    const periods = ["WEEKLY", "MONTHLY", "ALL_TIME"];
    const reports: DivergenceReport[] = [];

    for (const period of periods) {
      logger.info({ period }, "Verifying leaderboard period");

      const [onChain, offChain] = await Promise.all([
        fetchOnChainLeaderboard(period),
        fetchOffChainSnapshot(period),
      ]);

      const report = compareLeaderboards(onChain, offChain);
      reports.push(report);

      // Log based on severity
      if (report.severity === "critical") {
        logger.error(
          {
            period,
            divergentEntries: report.divergentEntries,
            divergencePercentage: report.divergencePercentage,
            divergences: report.divergences.slice(0, 5), // Log first 5
          },
          "CRITICAL: Leaderboard snapshot divergence detected",
        );
      } else if (report.severity === "medium") {
        logger.warn(
          {
            period,
            divergentEntries: report.divergentEntries,
            divergencePercentage: report.divergencePercentage,
          },
          "Medium severity leaderboard divergence detected",
        );
      } else if (report.divergentEntries > 0) {
        logger.info(
          {
            period,
            divergentEntries: report.divergentEntries,
            divergencePercentage: report.divergencePercentage,
          },
          "Minor leaderboard divergence detected",
        );
      } else {
        logger.info({ period }, "Leaderboard snapshot is consistent");
      }
    }

    // Return summary report (using WEEKLY as representative)
    return reports[0];
  } catch (error) {
    logger.error({ error }, "Leaderboard consistency verification failed");
    throw error;
  }
}

/**
 * Manual trigger for immediate verification (useful for testing).
 */
export async function triggerManualVerification(): Promise<DivergenceReport[]> {
  logger.info("Manual leaderboard verification triggered");
  
  const periods = ["WEEKLY", "MONTHLY", "ALL_TIME"];
  const reports: DivergenceReport[] = [];

  for (const period of periods) {
    const [onChain, offChain] = await Promise.all([
      fetchOnChainLeaderboard(period),
      fetchOffChainSnapshot(period),
    ]);

    reports.push(compareLeaderboards(onChain, offChain));
  }

  return reports;
}
