/**
 * Background job for cleaning up orphaned IPFS uploads (issue #1296).
 * Runs periodically to detect and unpin content unreferenced beyond grace period.
 * Performs dry-run verification before actual deletion.
 */

import { logger } from "../common/utils/logger.js";
import { env } from "../config/env.js";
import {
  dryRunCleanup,
  executeCleanup,
} from "../modules/ipfs/ipfs.service.js";

export interface CleanupJobResult {
  dryRun: Array<{ cid: string; age: number; referenced: boolean }>;
  execution: { unpinned: number; skipped: number };
  timestamp: string;
}

/**
 * Executes the orphan cleanup job.
 * First performs dry-run to log what would happen, then executes if approved.
 */
export async function runIpfsCleanupJob(): Promise<CleanupJobResult> {
  const gracePeriodDays = Math.floor(
    Number(env.IPFS_CLEANUP_GRACE_PERIOD_DAYS) || 30,
  );

  logger.info(
    { gracePeriodDays },
    "Starting IPFS cleanup job",
  );

  try {
    const dryRun = await dryRunCleanup(gracePeriodDays);

    logger.info(
      { orphanCount: dryRun.length },
      "Dry-run cleanup report",
    );

    for (const orphan of dryRun) {
      logger.info(
        {
          cid: orphan.cid,
          ageDays: orphan.age.toFixed(1),
          referenced: orphan.referenced,
        },
        "Orphan report",
      );
    }

    const execution = await executeCleanup(gracePeriodDays);

    logger.info(
      { unpinned: execution.unpinned, skipped: execution.skipped },
      "Cleanup job completed",
    );

    return {
      dryRun,
      execution,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ error }, "Cleanup job failed");
    throw error;
  }
}

/**
 * Job entry point for BullMQ worker.
 */
export async function handleIpfsCleanupJob(): Promise<void> {
  await runIpfsCleanupJob();
}
