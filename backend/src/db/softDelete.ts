import type { Prisma } from '@prisma/client';

export const SOFT_DELETE_MODELS = new Set([
  'User',
  'ApiKey',
  'Notification',
  'Goal',
  'Subscription',
  'WebhookSubscription',
]);

const READ_ACTIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Excludes logically deleted rows from ordinary Prisma reads.
 * The audit client in prisma.ts is the explicit opt-in for deleted rows.
 */
export function softDeleteMiddleware(
  params: Prisma.MiddlewareParams,
  next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
): Promise<unknown> {
  if (!params.model || !SOFT_DELETE_MODELS.has(params.model) || !READ_ACTIONS.has(params.action)) {
    return next(params);
  }

  if (params.action === 'findUnique' || params.action === 'findUniqueOrThrow') {
    params.action = params.action === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
  }

  params.args ??= {};
  params.args.where = {
    AND: [params.args.where ?? {}, { deletedAt: null }],
  };

  return next(params);
}