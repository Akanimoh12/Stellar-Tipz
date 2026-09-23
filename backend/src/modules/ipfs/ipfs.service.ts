import { config } from "../../config/index.js";
import { logger } from "../../common/utils/logger.js";
import { prisma } from "../../db/prisma.js";
import { redis } from "../../db/redis.js";
import {
  BadRequestError,
} from "../../common/errors/AppError.js";
import type {
  UploadMetadata,
  PinResult,
  VerifyPinResult,
  GatewayConfig,
} from "./ipfs.types.js";
import { UploadStatus } from "./ipfs.types.js";

const IPFS_QUEUE_KEY = "ipfs:retry-queue";
const IPFS_VERIFICATION_QUEUE_KEY = "ipfs:verification-queue";

const GATEWAYS: GatewayConfig[] = [
  { url: config.ipfs.gatewayUrl, priority: 1, timeout: 5000 },
  { url: "https://gateway.pinata.cloud/ipfs/", priority: 2, timeout: 5000 },
  { url: "https://cloudflare-ipfs.com/ipfs/", priority: 3, timeout: 5000 },
];

/**
 * Pins content to IPFS via configured API and verifies the pin.
 * On failure, queues for retry rather than failing immediately.
 */
export async function pinToIpfs(
  cid: string,
  metadata: UploadMetadata,
): Promise<PinResult> {
  if (!cid || !cid.match(/^Qm[a-zA-Z0-9]{44}$|^baf.+$/)) {
    throw new BadRequestError("Invalid IPFS CID format");
  }

  logger.info({ cid, userId: metadata.userId }, "Pinning to IPFS");

  if (!config.ipfs.apiUrl) {
    logger.warn(
      { cid },
      "IPFS_API_URL not configured, skipping pin operation",
    );
    return { success: true, cid, message: "Pinning skipped (not configured)" };
  }

  try {
    const response = await fetch(`${config.ipfs.apiUrl}/pinning/pinByHash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashToPin: cid }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 429;
      logger.warn(
        { cid, status: response.status, retryable },
        "Pin request failed",
      );

      if (retryable) {
        await queueRetryPin(cid, metadata);
      }

      return {
        success: false,
        cid,
        message: `Pin failed: ${response.statusText}`,
        retryable,
      };
    }

    await verifyPin(cid);

    logger.info({ cid }, "Content pinned successfully");
    return { success: true, cid };
  } catch (error) {
    logger.error({ cid, error }, "Pin operation error");
    await queueRetryPin(cid, metadata);
    return {
      success: false,
      cid,
      message: error instanceof Error ? error.message : "Unknown error",
      retryable: true,
    };
  }
}

/**
 * Unpins content from IPFS.
 */
export async function unpinFromIpfs(cid: string): Promise<void> {
  if (!config.ipfs.apiUrl) {
    logger.warn({ cid }, "IPFS_API_URL not configured, skipping unpin");
    return;
  }

  try {
    const response = await fetch(
      `${config.ipfs.apiUrl}/pinning/unpin?arg=${cid}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      logger.error(
        { cid, status: response.status },
        "Unpin request failed",
      );
      throw new Error(`Unpin failed: ${response.statusText}`);
    }

    logger.info({ cid }, "Content unpinned successfully");
  } catch (error) {
    logger.error({ cid, error }, "Unpin operation error");
    throw error;
  }
}

/**
 * Verifies that a pin exists on IPFS by attempting to fetch the content.
 */
export async function verifyPin(cid: string): Promise<VerifyPinResult> {
  const gateways = GATEWAYS.sort((a, b) => a.priority - b.priority);

  for (const gateway of gateways) {
    try {
      const url = `${gateway.url}${cid}`;
      const response = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(gateway.timeout),
      });

      if (response.ok || response.status === 301) {
        logger.info({ cid, gateway: gateway.url }, "Pin verified");
        return { exists: true, cid, gateway: gateway.url };
      }
    } catch (error) {
      logger.debug(
        { cid, gateway: gateway.url, error },
        "Gateway verification failed, trying next",
      );
      continue;
    }
  }

  logger.warn(
    { cid },
    "Pin verification failed on all gateways",
  );
  return { exists: false, cid };
}

/**
 * Gets a gateway URL for reading content, with fallback.
 */
export function getIpfsGateway(cid: string, preferredIndex = 0): string {
  const gateway =
    GATEWAYS[Math.min(preferredIndex, GATEWAYS.length - 1)];
  return `${gateway.url}${cid}`;
}

/**
 * Queues a failed pin attempt for retry.
 */
async function queueRetryPin(
  cid: string,
  metadata: UploadMetadata,
): Promise<void> {
  try {
    await redis.lpush(IPFS_QUEUE_KEY, JSON.stringify({ cid, metadata }));
    logger.info({ cid }, "Queued pin for retry");
  } catch (error) {
    logger.error({ cid, error }, "Failed to queue pin retry");
  }
}

/**
 * Processes retries for failed pins from the queue.
 */
export async function processRetryQueue(): Promise<void> {
  let count = 0;
  while (true) {
    const item = await redis.rpop(IPFS_QUEUE_KEY);
    if (!item) break;

    try {
      const { cid, metadata } = JSON.parse(item);
      logger.info({ cid }, "Retrying pin from queue");
      await pinToIpfs(cid, metadata);
      count++;
    } catch (error) {
      logger.error({ error }, "Retry pin failed, discarding");
    }
  }
  if (count > 0) {
    logger.info({ count }, "Processed retried pins");
  }
}

/**
 * Finds all orphaned uploads (no referencing entity) beyond grace period.
 */
export async function findOrphanedUploads(
  gracePeriodDays: number,
): Promise<Array<{ id: string; cid: string; createdAt: Date }>> {
  const cutoffDate = new Date(
    Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000,
  );

  const orphans = await prisma.upload.findMany({
    where: {
      entityId: null,
      status: UploadStatus.PINNED,
      createdAt: { lt: cutoffDate },
      deletedAt: null,
    },
    select: {
      id: true,
      cid: true,
      createdAt: true,
    },
  });

  return orphans;
}

/**
 * Performs a dry-run of cleanup (reports what would be unpinned).
 */
export async function dryRunCleanup(
  gracePeriodDays: number,
): Promise<
  Array<{ cid: string; age: number; referenced: boolean }>
> {
  const orphans = await findOrphanedUploads(gracePeriodDays);
  const dryRunResults = [];

  for (const orphan of orphans) {
    const ageMs = Date.now() - orphan.createdAt.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    const hasReferences = await prisma.upload.findFirst({
      where: {
        cid: orphan.cid,
        entityId: { not: null },
      },
    });

    dryRunResults.push({
      cid: orphan.cid,
      age: ageDays,
      referenced: !!hasReferences,
    });
  }

  return dryRunResults;
}

/**
 * Executes cleanup: unpins orphaned uploads after verifying no references.
 */
export async function executeCleanup(
  gracePeriodDays: number,
): Promise<{ unpinned: number; skipped: number }> {
  const orphans = await findOrphanedUploads(gracePeriodDays);
  let unpinned = 0;
  let skipped = 0;

  for (const orphan of orphans) {
    const hasReferences = await prisma.upload.findFirst({
      where: {
        cid: orphan.cid,
        entityId: { not: null },
        deletedAt: null,
      },
    });

    if (hasReferences) {
      logger.warn(
        { cid: orphan.cid },
        "Skipping cleanup: content is referenced",
      );
      skipped++;
      continue;
    }

    try {
      await unpinFromIpfs(orphan.cid);
      await prisma.upload.update({
        where: { id: orphan.id },
        data: { status: UploadStatus.UNPINNED, deletedAt: new Date() },
      });
      logger.info({ cid: orphan.cid }, "Cleaned up orphaned upload");
      unpinned++;
    } catch (error) {
      logger.error({ cid: orphan.cid, error }, "Cleanup failed");
    }
  }

  return { unpinned, skipped };
}

/**
 * Periodic verification job: checks all pinned content still exists.
 */
export async function verifyAllPins(): Promise<{
  verified: number;
  failed: number;
}> {
  const pinnedUploads = await prisma.upload.findMany({
    where: {
      status: UploadStatus.PINNED,
      deletedAt: null,
    },
    select: {
      id: true,
      cid: true,
    },
  });

  let verified = 0;
  let failed = 0;

  for (const upload of pinnedUploads) {
    const result = await verifyPin(upload.cid);

    if (result.exists) {
      verified++;
    } else {
      failed++;
      logger.warn(
        { cid: upload.cid },
        "Pin verification failed, queuing for retry",
      );
      await redis.lpush(
        IPFS_VERIFICATION_QUEUE_KEY,
        JSON.stringify({ cid: upload.cid }),
      );
    }
  }

  logger.info({ verified, failed }, "Pin verification job completed");
  return { verified, failed };
}
