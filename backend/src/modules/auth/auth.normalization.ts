/**
 * Username normalization utilities - Issue #1599
 * Added to backend/src/modules/auth/auth.utils.ts
 */

import { prisma } from "../../db/prisma.js";
import { BadRequestError, ConflictError } from "../../common/errors/AppError.js";

/**
 * Normalizes usernames by:
 * - Converting to lowercase
 * - Removing accents and diacritics
 * - Allowing only alphanumeric characters, hyphens, and underscores
 * Prevents look-alike usernames by homograph attacks (e.g. а vs a with Cyrillic)
 */
export function normalizeUsername(username: string): string {
  // Convert to lowercase
  let normalized = username.toLowerCase().trim();

  // Remove accents and diacritics using Unicode normalization
  normalized = normalized.normalize('NFKD')
    .replace(/[̀-ͯ]/g, ''); // Remove combining diacritical marks

  // Remove any characters that are not alphanumeric, hyphen, or underscore
  normalized = normalized.replace(/[^a-z0-9_-]/g, '');

  return normalized;
}

/**
 * Validates that a username is not a look-alike/homograph of an existing username.
 * Uses normalized comparison to prevent unicode spoofing.
 */
export async function checkUsernameLookAlike(username: string): Promise<boolean> {
  const normalized = normalizeUsername(username);

  // Find any user with a username that normalizes to the same value
  const existing = await prisma.user.findFirst({
    where: {
      username: {
        equals: normalized,
        mode: 'insensitive',
      },
      deletedAt: null,
    },
  });

  return existing !== null;
}

/**
 * Enhanced username validation combining length, format, and look-alike checks.
 * Called during registration and username updates.
 */
export async function validateAndNormalizeUsername(username: string): Promise<string> {
  const normalized = normalizeUsername(username);

  if (normalized.length < 3) {
    throw new BadRequestError('Username must be at least 3 characters after normalization');
  }

  if (normalized.length > 50) {
    throw new BadRequestError('Username must not exceed 50 characters');
  }

  // Check for look-alike usernames
  const isLookAlike = await checkUsernameLookAlike(normalized);
  if (isLookAlike) {
    throw new ConflictError('Username is unavailable or too similar to an existing user');
  }

  return normalized;
}
