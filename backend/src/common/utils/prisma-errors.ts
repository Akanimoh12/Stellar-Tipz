import { Prisma } from '@prisma/client';
import { ConflictError } from '../errors/AppError.js';

/**
 * Type guard to check if an error is a Prisma known request error.
 */
export function isPrismaError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError;
}

/**
 * Check if a Prisma error is a unique constraint violation (P2002).
 *
 * This error code indicates that a unique constraint was violated, typically
 * due to a concurrent insert race or a duplicate value being inserted.
 *
 * @param err - The error to check
 * @returns true if the error is a P2002 unique constraint violation
 */
export function isUniqueConstraintViolation(err: unknown): boolean {
  return isPrismaError(err) && err.code === 'P2002';
}

/**
 * Handle P2002 unique constraint violations by throwing a ConflictError (409).
 * Use this for operations where duplicate entries are not allowed and should
 * result in a clean 409 response to the client.
 *
 * For idempotent operations (where duplicates should return the existing record),
 * catch P2002 and query for the existing record instead of throwing.
 *
 * @param err - The error to check and potentially rethrow
 * @param message - Optional custom conflict message (defaults to generic message)
 * @throws ConflictError if the error is a P2002 unique constraint violation
 * @throws The original error if it's not a P2002
 *
 * @example
 * ```typescript
 * try {
 *   const refund = await prisma.refund.create({ data: { tipId: tip.id, ... } });
 *   return refund;
 * } catch (err) {
 *   handleUniqueConstraintViolation(err, 'A refund has already been requested for this tip');
 * }
 * ```
 */
export function handleUniqueConstraintViolation(
  err: unknown,
  message = 'A record with these values already exists',
): never {
  if (isUniqueConstraintViolation(err)) {
    throw new ConflictError(message);
  }
  throw err;
}

/**
 * Extract the target field(s) from a P2002 unique constraint violation error.
 * This is useful for providing more specific error messages to users.
 *
 * @param err - The Prisma error
 * @returns Array of field names that caused the constraint violation, or undefined
 *
 * @example
 * ```typescript
 * catch (err) {
 *   if (isUniqueConstraintViolation(err)) {
 *     const fields = getUniqueConstraintFields(err);
 *     console.log(`Duplicate ${fields?.join(', ')}`);
 *   }
 * }
 * ```
 */
export function getUniqueConstraintFields(err: unknown): string[] | undefined {
  if (!isPrismaError(err) || err.code !== 'P2002') {
    return undefined;
  }
  // Prisma includes the target fields in the meta property
  const meta = err.meta as { target?: string[] } | undefined;
  return meta?.target;
}
