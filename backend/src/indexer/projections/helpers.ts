/**
 * Shared parsing and identity helpers used by the per-topic projection modules.
 */
import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import { recordUnknownEvent } from '../../common/observability/metrics.js';
import type { DecodedEvent } from '../sorobanClient.js';

/** A per-topic projection. `isNewEvent` is false when the event is a replay. */
export type ProjectionHandler = (event: DecodedEvent, isNewEvent: boolean) => Promise<void>;

export function toBigInt(value: unknown): bigint | null {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
    if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  } catch {
    /* fall through */
  }
  return null;
}

/** Convert Soroban numeric values to a JS number, treating invalid values as null. */
export function toNumber(value: unknown): number | null {
  try {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string' && /^\d+$/.test(value)) return parseInt(value, 10);
  } catch {
    /* fall through */
  }
  return null;
}

/** Deterministic off-chain identifier for a creator's single goal. */
export function goalId(userId: string): string {
  return `goal_${userId}`;
}

/** Deterministic off-chain identifier for a (tipper, creator) subscription. */
export function subscriptionId(tipperId: string, creatorId: string): string {
  return `sub_${tipperId}_${creatorId}`;
}

/**
 * Resolve a Stellar address to a User id, creating a minimal User row if none
 * exists yet. Idempotent: the upsert keys on the unique `stellarAddress`.
 */
export async function ensureUserId(address: string): Promise<string> {
  const user = await prisma.user.upsert({
    where: { stellarAddress: address },
    create: { stellarAddress: address },
    update: {},
    select: { id: true },
  });
  return user.id;
}

/** Normalise an event value into its positional argument tuple. */
export function tupleArgs(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Extract a single address argument, accepting either a bare value (single-field
 * events publish the address directly) or a one-element tuple.
 */
export function addressArg(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

/** Convert an on-chain unix-seconds timestamp to a Date, treating 0/invalid as none. */
export function toTimestamp(value: unknown): Date | null {
  const seconds = toBigInt(value);
  if (seconds === null || seconds === 0n) return null;
  return new Date(Number(seconds) * 1000);
}

/** Coerce an on-chain `interval_days` value to a positive integer day count. */
export function toIntervalDays(value: unknown): number {
  const days = toBigInt(value);
  return days !== null && days > 0n ? Number(days) : 30;
}

/** Map a day interval onto the closest supported SubscriptionInterval. */
export function intervalFromDays(days: number): 'DAILY' | 'WEEKLY' | 'MONTHLY' {
  if (days <= 1) return 'DAILY';
  if (days <= 7) return 'WEEKLY';
  return 'MONTHLY';
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function warnUnparseable(event: DecodedEvent, topic: string): void {
  logger.warn({ txHash: event.txHash, topic }, 'Skipping event with unparseable payload');
  recordUnknownEvent();
}

/** Subscription events use a leading schema version; accept legacy tuples too. */
export function subscriptionArgs(value: unknown): unknown[] {
  const args = tupleArgs(value);
  return args[0] === 1 || args[0] === '1' ? args.slice(1) : args;
}
