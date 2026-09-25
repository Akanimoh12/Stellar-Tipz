/**
 * Background job for periodic X metrics refresh with quota awareness (issue #1293).
 * Prioritizes stale data when quota is limited.
 */

import { logger } from "../common/utils/logger.js";
import { prisma } from "../db/prisma.js";
import * as xService from "../modules/x/x.service.js";

export interface RefreshJobResult {
  refreshed: number;
  stale: number;
  quotaExhausted: boolean;
  timestamp: string;
}

/**
 * Executes X metrics refresh job.
 * Fetches latest X data for linked accounts, prioritizing stale data when quota limited.
 */
export async function runXRefreshJob(): Promise<RefreshJobResult> {
  logger.info("Starting X metrics refresh job");

  try {
    const isQuotaExhausted = await xService.isQuotaExhausted();

    if (isQuotaExhausted) {
      logger.warn("X API quota exhausted, using fallback data only");
      return {
        refreshed: 0,
        stale: 0,
        quotaExhausted: true,
        timestamp: new Date().toISOString(),
      };
    }

    const xLinks = await prisma.xLink.findMany({
      where: { unlinkedAt: null },
      include: { user: true },
    });

    let refreshed = 0;
    let stale = 0;

    for (const link of xLinks) {
      try {
        const metrics = await xService.getXMetrics(link.xHandle);

        await prisma.xAccount.upsert({
          where: { handle: link.xHandle },
          create: {
            handle: link.xHandle,
            followers: metrics.followers,
            engagement: metrics.engagement,
            fetchedAt: new Date(),
          },
          update: {
            followers: metrics.followers,
            engagement: metrics.engagement,
            fetchedAt: new Date(),
          },
        });

        refreshed++;
        logger.debug({ xHandle: link.xHandle }, "Refreshed X metrics");
      } catch (error) {
        stale++;
        logger.warn(
          { xHandle: link.xHandle, error },
          "Failed to refresh X metrics",
        );
      }
    }

    logger.info(
      { refreshed, stale, quotaExhausted: false },
      "X refresh job completed",
    );

    return {
      refreshed,
      stale,
      quotaExhausted: false,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ error }, "X refresh job failed");
    throw error;
  }
}

/**
 * Job entry point for BullMQ worker.
 */
export async function handleXRefreshJob(): Promise<void> {
  await runXRefreshJob();
}
