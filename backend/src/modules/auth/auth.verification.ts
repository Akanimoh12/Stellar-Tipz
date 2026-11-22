/**
 * Domain verification replay prevention - Issue #1601
 * Prevents domain verification proofs from being reused across profiles or after deregistration
 * Added as backend/src/modules/auth/auth.verification.ts
 */

import { prisma } from "../../db/prisma.js";
import { redis } from "../../db/redis.js";
import { createHash } from "crypto";
import { TrustFlowError } from "../../common/errors/AppError.js";
import { logger } from "../../common/utils/logger.js";

export interface DomainVerificationProof {
  domain: string;
  proof: string;
  timestamp: number;
  signature: string;
  verifiedAt: Date;
}

/**
 * Stores a domain verification proof with uniqueness constraints to prevent replay attacks.
 * A proof can only be verified once, cannot be transferred between profiles,
 * and becomes invalid if the profile is deregistered.
 */
export async function storeDomainVerificationProof(
  userId: string,
  domain: string,
  proof: string,
  signature: string,
): Promise<DomainVerificationProof> {
  // Create a unique key for this proof to detect reuse
  const proofHash = createHash("sha256")
    .update(`${domain}:${proof}`)
    .digest("hex");

  // Check if this proof has already been used
  const existingProof = await prisma.domainVerification.findUnique({
    where: { proofHash },
  });

  if (existingProof) {
    // Proof already used - prevent replay across profiles
    if (existingProof.userId !== userId) {
      logger.warn(
        { domain, userId, existingUserId: existingProof.userId },
        "Domain verification replay attempt across different users",
      );
      throw new TrustFlowError(
        "This domain proof has already been used by another user. Domain verification proofs cannot be transferred.",
        "DOMAIN_VERIFICATION_REPLAY",
      );
    }
    // Same user attempting to verify same domain again - this is a reuse
    logger.warn({ domain, userId }, "Domain verification proof reuse attempted");
    throw new TrustFlowError(
      "Domain verification proof has already been used. Generate a new proof.",
      "PROOF_ALREADY_USED",
    );
  }

  // Store the verification with the proof hash
  const verification = await prisma.domainVerification.create({
    data: {
      userId,
      domain,
      proof,
      proofHash,
      signature,
      verifiedAt: new Date(),
      revokedAt: null,
    },
  });

  // Also store in Redis cache with TTL for quick replay detection
  const cacheKey = `domain_verification:${proofHash}`;
  await redis.setex(cacheKey, 365 * 24 * 60 * 60, userId); // Cache for 1 year

  logger.info({ domain, userId }, "Domain verified successfully");

  return {
    domain,
    proof,
    timestamp: verification.verifiedAt.getTime(),
    signature,
    verifiedAt: verification.verifiedAt,
  };
}

/**
 * Validates that a domain verification proof hasn't been replayed or transferred.
 * Called before accepting a verification claim.
 */
export async function validateDomainVerificationProof(
  userId: string,
  domain: string,
  proof: string,
): Promise<{ valid: boolean; reason?: string }> {
  const proofHash = createHash("sha256")
    .update(`${domain}:${proof}`)
    .digest("hex");

  // Check Redis cache first (fast path for common case)
  const cachedUserId = await redis.get(`domain_verification:${proofHash}`);
  if (cachedUserId) {
    if (cachedUserId !== userId) {
      logger.warn(
        { domain, userId, cachedUserId },
        "Replay attempt: proof from different user",
      );
      return {
        valid: false,
        reason: "Domain proof was already verified by another user",
      };
    }
    logger.debug({ domain, userId }, "Replay attempt: proof already used by same user");
    return {
      valid: false,
      reason: "Domain proof has already been used",
    };
  }

  // Check database for existing verification
  const existing = await prisma.domainVerification.findUnique({
    where: { proofHash },
  });

  if (existing) {
    if (existing.userId !== userId) {
      logger.warn(
        { domain, userId, existingUserId: existing.userId },
        "Cross-user domain verification replay detected",
      );
      return {
        valid: false,
        reason: "Domain proof was already verified by another user",
      };
    }

    // Check if user still exists and hasn't been deleted
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      logger.info(
        { domain, userId },
        "Domain verification invalidated: user deregistered",
      );
      return {
        valid: false,
        reason: "User no longer exists; domain verifications are invalidated",
      };
    }

    logger.debug({ domain, userId }, "Proof already used by same active user");
    return {
      valid: false,
      reason: "Domain proof has already been used",
    };
  }

  // Proof is valid and hasn't been used before
  return { valid: true };
}

/**
 * Revokes all domain verifications for a user when they deregister.
 * This prevents orphaned verified domains from being reassigned.
 * Called during account deregistration flow.
 */
export async function revokeDomainVerificationsOnDeregister(userId: string): Promise<void> {
  const verifications = await prisma.domainVerification.findMany({
    where: { userId },
  });

  if (verifications.length === 0) {
    return;
  }

  for (const verification of verifications) {
    // Mark as revoked in database
    await prisma.domainVerification.update({
      where: { id: verification.id },
      data: { revokedAt: new Date() },
    });

    // Remove from Redis cache to prevent future reuse detection misses
    const cacheKey = `domain_verification:${verification.proofHash}`;
    await redis.del(cacheKey);
  }

  logger.info(
    { userId, count: verifications.length },
    "Domain verifications revoked on account deregistration",
  );
}

/**
 * Gets all verified domains for a user (including revoked ones for audit).
 * Includes both active and revoked verifications for audit trails.
 */
export async function getUserVerifiedDomains(userId: string): Promise<DomainVerificationProof[]> {
  const verifications = await prisma.domainVerification.findMany({
    where: { userId },
    orderBy: { verifiedAt: "desc" },
  });

  return verifications.map((v) => ({
    domain: v.domain,
    proof: v.proof,
    timestamp: v.verifiedAt.getTime(),
    signature: v.signature,
    verifiedAt: v.verifiedAt,
  }));
}

/**
 * Checks if a domain is currently verified for a user (excluding revoked verifications).
 */
export async function isDomainVerifiedForUser(userId: string, domain: string): Promise<boolean> {
  const verification = await prisma.domainVerification.findFirst({
    where: {
      userId,
      domain,
      revokedAt: null, // Only count active verifications
    },
  });

  return verification !== null;
}
