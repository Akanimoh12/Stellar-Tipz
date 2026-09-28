/**
 * Background job for verifying IPFS pin durability (issue #1295).
 * Runs periodically to check that pinned content still exists.
 * Queues missing content for re-pinning.
 */

import { logger } from "../common/utils/logger.js";
import { verifyAllPins } from "../modules/ipfs/ipfs.service.js";

export interface VerifyJobResult {
  verified: number;
  failed: number;
  timestamp: string;
}

/**
 * Executes the IPFS pin verification job.
 * Checks all pinned uploads still exist on IPFS network.
 */
export async function runIpfsVerifyJob(): Promise<VerifyJobResult> {
  logger.info("Starting IPFS verification job");

  try {
    const result = await verifyAllPins();

    logger.info(
      { verified: result.verified, failed: result.failed },
      "IPFS verification job completed",
    );

    if (result.failed > 0) {
      logger.warn(
        { failed: result.failed },
        "Some pins failed verification and were queued for retry",
      );
    }

    return {
      verified: result.verified,
      failed: result.failed,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ error }, "IPFS verification job failed");
    throw error;
  }
}

/**
 * Job entry point for BullMQ worker.
 */
export async function handleIpfsVerifyJob(): Promise<void> {
  await runIpfsVerifyJob();
}
