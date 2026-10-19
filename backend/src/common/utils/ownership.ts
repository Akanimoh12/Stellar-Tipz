import { ForbiddenError } from '../errors/AppError.js';

/** Ensures a resource belongs to the authenticated actor. */
export function assertOwnership(
  ownerId: string,
  actorId: string,
  message = 'You do not have access to this resource',
): void {
  if (ownerId !== actorId) {
    throw new ForbiddenError(message);
  }
}
