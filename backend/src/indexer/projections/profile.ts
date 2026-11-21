import { prisma } from '../../db/prisma.js';
import { invalidateCreatorSearch } from '../../modules/search/search.cache.js';
import { observeRegistration } from '../../common/observability/businessMetrics.js';
import type { DecodedEvent } from '../sorobanClient.js';
import { addressArg, ensureUserId, tupleArgs, warnUnparseable } from './helpers.js';

/**
 * Project a `("profile", "register")` event — data `(owner, username)` — into the
 * User table. Upsert on the unique `stellarAddress`, so replays are no-ops.
 */
export async function projectProfileRegistered(event: DecodedEvent, isNewEvent = true): Promise<void> {
  const [owner, username] = tupleArgs(event.value);
  if (typeof owner !== 'string') {
    observeRegistration('indexer', 'unparseable');
    return warnUnparseable(event, 'profile_register');
  }
  const name = typeof username === 'string' && username.length > 0 ? username : null;

  const previous = await prisma.user.findUnique({
    where: { stellarAddress: owner },
    select: { username: true, displayName: true },
  });
  await prisma.user.upsert({
    where: { stellarAddress: owner },
    create: { stellarAddress: owner, username: name },
    update: name === null ? {} : { username: name },
  });
  // A newly registered creator must be findable immediately, not after the
  // search cache TTL (issue #1267).
  await invalidateCreatorSearch([previous?.username, previous?.displayName, name]);
  if (isNewEvent) observeRegistration('indexer', 'success');
}

/**
 * Project a `("profile", "updated")` event — data `(owner,)`. The event carries
 * only the owner address (the mutated fields live in contract storage), so the
 * projection just ensures the off-chain User row exists for that address.
 */
export async function projectProfileUpdated(event: DecodedEvent): Promise<void> {
  const owner = addressArg(event.value);
  if (owner === null) {
    return warnUnparseable(event, 'profile_updated');
  }
  await ensureUserId(owner);
}
