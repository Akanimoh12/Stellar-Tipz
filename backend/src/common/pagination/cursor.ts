import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { BadRequestError } from '../errors/AppError.js';

const cursorPayloadSchema = z.object({
  version: z.literal(1),
  scope: z.string().min(1),
  sortValue: z.string().datetime(),
  id: z.string().min(1),
});

type CursorPayload = z.infer<typeof cursorPayloadSchema>;

export type CursorPosition = {
  sortValue: Date;
  id: string;
};

const signingKey = createHash('sha256')
  .update('stellar-tipz:pagination-cursor:v1:')
  .update(env.JWT_SECRET)
  .digest();

function sign(encodedPayload: string): Buffer {
  return createHmac('sha256', signingKey).update(encodedPayload).digest();
}

function invalidCursor(): BadRequestError {
  return new BadRequestError('Invalid pagination cursor');
}

/** Produces a stable scope so cursors cannot be replayed with different filters or users. */
export function createCursorScope(
  resource: string,
  filters: Record<string, string | number | boolean | undefined> = {},
): string {
  const normalizedFilters = Object.entries(filters)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `${resource}:${JSON.stringify(normalizedFilters)}`;
}

/** Encodes and signs a timestamp plus deterministic ID tiebreaker as an opaque cursor. */
export function encodeCursor(position: CursorPosition, scope: string): string {
  const payload: CursorPayload = {
    version: 1,
    scope,
    sortValue: position.sortValue.toISOString(),
    id: position.id,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload).toString('base64url')}`;
}

/** Verifies and decodes a cursor, rejecting tampering, malformed data, and scope reuse. */
export function decodeCursor(cursor: string, expectedScope: string): CursorPosition {
  try {
    const parts = cursor.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw invalidCursor();

    const suppliedSignature = Buffer.from(parts[1], 'base64url');
    const expectedSignature = sign(parts[0]);
    if (
      suppliedSignature.toString('base64url') !== parts[1] ||
      suppliedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(suppliedSignature, expectedSignature)
    ) {
      throw invalidCursor();
    }

    const payload = cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')),
    );
    if (payload.scope !== expectedScope) throw invalidCursor();

    return { sortValue: new Date(payload.sortValue), id: payload.id };
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw invalidCursor();
  }
}

/** Builds the descending keyset boundary for a timestamp field and ID tiebreaker. */
export function descendingCursorCondition(
  sortField: string,
  cursor: string | undefined,
  scope: string,
): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  const position = decodeCursor(cursor, scope);

  return {
    OR: [
      { [sortField]: { lt: position.sortValue } },
      { [sortField]: position.sortValue, id: { lt: position.id } },
    ],
  };
}

/** Trims a limit+1 query and emits the next signed cursor, or null on the final page. */
export function toCursorPage<T extends { id: string }>(
  rows: T[],
  limit: number,
  scope: string,
  getSortValue: (row: T) => Date,
): { data: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];

  return {
    data,
    nextCursor:
      hasMore && last
        ? encodeCursor({ sortValue: getSortValue(last), id: last.id }, scope)
        : null,
  };
}
