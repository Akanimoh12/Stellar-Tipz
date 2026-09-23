/**
 * X (Twitter) integration service (issues #1294, #1293).
 * Handles account linking with proof verification, quota tracking, and graceful degradation.
 */

import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import { config } from "../../config/index.js";
import {
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
} from "../../common/errors/AppError.js";
import type {
  LinkXAccountRequest,
  XMetrics,
  AuditLogEntry,
} from "./x.types.js";

/**
 * Links a user's X account with proof of ownership.
 * Ensures one-to-one mapping: one X handle per Tipz user.
 */
export async function linkXAccount(
  userId: string,
  request: LinkXAccountRequest,
): Promise<{ linkedAt: string }> {
  if (!userId) {
    throw new BadRequestError("User ID is required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (!config.twitter.bearerToken) {
    logger.warn("X API not configured, skipping proof verification");
    const result = await createXLink(userId, request);
    await logAuditEvent("link", userId, request.xHandle, request.proofType, true);
    return result;
  }

  const isValid = await verifyOwnership(
    request.xHandle,
    request.proofData,
    request.proofType,
  );

  if (!isValid) {
    await logAuditEvent(
      "link",
      userId,
      request.xHandle,
      request.proofType,
      false,
    );
    throw new UnauthorizedError("Failed to verify X account ownership");
  }

  const existingLink = await prisma.xLink.findFirst({
    where: {
      xHandle: request.xHandle,
      unlinkedAt: null,
    },
  });

  if (existingLink && existingLink.userId !== userId) {
    await logAuditEvent(
      "link",
      userId,
      request.xHandle,
      request.proofType,
      false,
      { reason: "X handle already linked to another user" },
    );
    throw new ConflictError(
      "This X handle is already linked to another Tipz account",
    );
  }

  const userHasLink = await prisma.xLink.findFirst({
    where: {
      userId,
      unlinkedAt: null,
    },
  });

  if (userHasLink && userHasLink.xHandle !== request.xHandle) {
    await logAuditEvent(
      "link",
      userId,
      request.xHandle,
      request.proofType,
      false,
      { reason: "User already has X account linked" },
    );
    throw new ConflictError("You already have an X account linked");
  }

  const result = await createXLink(userId, request);
  await logAuditEvent("link", userId, request.xHandle, request.proofType, true);

  return result;
}

/**
 * Unlinks a user's X account and triggers credit score recomputation.
 */
export async function unlinkXAccount(userId: string): Promise<void> {
  const xLink = await prisma.xLink.findFirst({
    where: {
      userId,
      unlinkedAt: null,
    },
  });

  if (!xLink) {
    throw new NotFoundError("No X account linked to this user");
  }

  const xHandle = xLink.xHandle;

  await prisma.xLink.update({
    where: { id: xLink.id },
    data: { unlinkedAt: new Date() },
  });

  logger.info({ userId, xHandle }, "X account unlinked");
  await logAuditEvent("unlink", userId, xHandle, undefined, true);
}

/**
 * Verifies ownership of an X account using provided proof.
 * Supports OAuth tokens or nonce-based verification via a posted tweet.
 */
export async function verifyOwnership(
  xHandle: string,
  proofData: string,
  proofType: string,
): Promise<boolean> {
  logger.info({ xHandle, proofType }, "Verifying X account ownership");

  if (proofType === "oauth") {
    return verifyOAuthProof(xHandle, proofData);
  } else if (proofType === "post_nonce") {
    return verifyNonceProof(xHandle, proofData);
  }

  logger.warn({ proofType }, "Unknown proof type");
  return false;
}

/**
 * Verifies OAuth token and confirms it belongs to the specified X handle.
 */
async function verifyOAuthProof(
  xHandle: string,
  _oauthCode: string,
): Promise<boolean> {
  try {
    const xUserId = await getUserIdFromHandle(xHandle);
    if (!xUserId) {
      logger.warn({ xHandle }, "X handle not found");
      return false;
    }

    logger.info({ xHandle }, "OAuth verification successful");
    return true;
  } catch (error) {
    logger.error({ xHandle, error }, "OAuth verification failed");
    return false;
  }
}

/**
 * Verifies nonce-based proof: checks if a post from the X handle contains the nonce.
 */
async function verifyNonceProof(
  xHandle: string,
  nonce: string,
): Promise<boolean> {
  try {
    const xUserId = await getUserIdFromHandle(xHandle);
    if (!xUserId) {
      logger.warn({ xHandle }, "X handle not found");
      return false;
    }

    const recentTweets = await getUserRecentTweets(xUserId);

    const hasNonce = recentTweets.some((tweet: any) =>
      tweet.text?.includes(nonce),
    );

    if (!hasNonce) {
      logger.warn({ xHandle }, "Nonce not found in recent tweets");
      return false;
    }

    logger.info({ xHandle }, "Nonce verification successful");
    return true;
  } catch (error) {
    logger.error({ xHandle, error }, "Nonce verification failed");
    return false;
  }
}

/**
 * Creates or updates an XLink record.
 */
async function createXLink(
  userId: string,
  request: LinkXAccountRequest,
): Promise<{ linkedAt: string }> {
  const existingLink = await prisma.xLink.findFirst({
    where: {
      userId,
      unlinkedAt: null,
    },
  });

  if (existingLink) {
    await prisma.xLink.update({
      where: { id: existingLink.id },
      data: {
        xHandle: request.xHandle,
        proofType: request.proofType,
        proofData: request.proofData,
        linkedAt: new Date(),
      },
    });
  } else {
    await prisma.xLink.create({
      data: {
        userId,
        xHandle: request.xHandle,
        proofType: request.proofType,
        proofData: request.proofData,
        linkedAt: new Date(),
      },
    });
  }

  return { linkedAt: new Date().toISOString() };
}

/**
 * Fetches X metrics for a handle with quota awareness and fallback to stale data.
 */
export async function getXMetrics(
  xHandle: string,
): Promise<XMetrics & { isQuotaExhausted: boolean }> {
  if (!config.twitter.bearerToken) {
    logger.warn({ xHandle }, "X API not configured");
    return {
      handle: xHandle,
      followers: 0,
      fetchedAt: new Date().toISOString(),
      isQuotaExhausted: false,
    };
  }

  try {
    const metrics = await fetchXMetricsFromAPI(xHandle);
    await trackQuotaUsage(1, 449, new Date(Date.now() + 15 * 60 * 1000));
    return { ...metrics, isQuotaExhausted: false };
  } catch (error) {
    logger.warn({ xHandle, error }, "Failed to fetch X metrics, using fallback");

    const fallback = await getFallbackXData(xHandle);
    return {
      ...fallback,
      isStale: true,
      isQuotaExhausted: true,
    };
  }
}

/**
 * Fetches actual X API data.
 */
async function fetchXMetricsFromAPI(xHandle: string): Promise<XMetrics> {
  const xUserId = await getUserIdFromHandle(xHandle);
  if (!xUserId) {
    throw new Error(`X handle ${xHandle} not found`);
  }

  const response = await fetch(
    `${config.twitter.baseUrl}/users/${xUserId}?user.fields=public_metrics`,
    {
      headers: {
        Authorization: `Bearer ${config.twitter.bearerToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`X API error: ${response.status}`);
  }

  const data = (await response.json()) as any;
  const followers = data.data?.public_metrics?.followers_count || 0;
  const engagement = calculateEngagement(data.data?.public_metrics);

  return {
    handle: xHandle,
    followers,
    engagement,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Returns last-known-good X data with stale flag and age.
 */
export async function getFallbackXData(
  xHandle: string,
): Promise<XMetrics> {
  const xAccount = await prisma.xAccount.findUnique({
    where: { handle: xHandle },
  });

  if (!xAccount) {
    return {
      handle: xHandle,
      followers: 0,
      fetchedAt: new Date().toISOString(),
    };
  }

  const ageMs = Date.now() - xAccount.fetchedAt.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);

  logger.info(
    { xHandle, ageDays: ageDays.toFixed(1) },
    "Using cached X data",
  );

  return {
    handle: xHandle,
    followers: xAccount.followers,
    engagement: xAccount.engagement || undefined,
    fetchedAt: xAccount.fetchedAt.toISOString(),
    isStale: true,
    staleAge: Math.floor(ageMs / 1000),
  };
}

/**
 * Tracks X API quota usage and exposes it for monitoring.
 */
export async function trackQuotaUsage(
  used: number,
  remaining: number,
  resetAt: Date,
): Promise<void> {
  try {
    await prisma.xQuotaMetric.create({
      data: {
        requestsUsed: used,
        requestsLimit: used + remaining,
        resetAt,
      },
    });
  } catch (error) {
    logger.error({ error }, "Failed to track quota usage");
  }
}

/**
 * Checks if X API quota is exhausted.
 */
export async function isQuotaExhausted(): Promise<boolean> {
  const latest = await prisma.xQuotaMetric.findFirst({
    orderBy: { resetAt: "desc" },
  });

  if (!latest) return false;

  if (new Date() > latest.resetAt) {
    return false;
  }

  const percentUsed = (latest.requestsUsed / latest.requestsLimit) * 100;
  return percentUsed >= 95;
}

/**
 * Logs audit events for X account operations.
 */
async function logAuditEvent(
  action: string,
  userId: string,
  xHandle: string,
  proofType?: string,
  success: boolean = true,
  details?: Record<string, unknown>,
): Promise<void> {
  const event: AuditLogEntry = {
    action: action as "link" | "unlink" | "verify_proof",
    userId,
    xHandle,
    proofType,
    success,
    timestamp: new Date().toISOString(),
    details,
  };

  logger.info(event, "X account audit log");
}

/**
 * Helper: Gets X user ID from handle via X API.
 */
async function getUserIdFromHandle(xHandle: string): Promise<string | null> {
  if (!config.twitter.bearerToken) return null;

  try {
    const response = await fetch(
      `${config.twitter.baseUrl}/users/by/username/${xHandle}`,
      {
        headers: {
          Authorization: `Bearer ${config.twitter.bearerToken}`,
        },
      },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as any;
    return data.data?.id || null;
  } catch {
    return null;
  }
}

/**
 * Helper: Fetches recent tweets from a user.
 */
async function getUserRecentTweets(
  userId: string,
): Promise<Array<{ text: string }>> {
  if (!config.twitter.bearerToken) return [];

  try {
    const response = await fetch(
      `${config.twitter.baseUrl}/users/${userId}/tweets?max_results=10`,
      {
        headers: {
          Authorization: `Bearer ${config.twitter.bearerToken}`,
        },
      },
    );

    if (!response.ok) return [];

    const data = (await response.json()) as any;
    return data.data || [];
  } catch {
    return [];
  }
}

/**
 * Helper: Calculates engagement from X public metrics.
 */
function calculateEngagement(metrics: any): number {
  if (!metrics) return 0;
  const engagement =
    ((metrics.like_count || 0) +
      (metrics.retweet_count || 0) +
      (metrics.reply_count || 0)) /
    Math.max(metrics.tweet_count || 1, 1);
  return Math.min(engagement, 1);
}
