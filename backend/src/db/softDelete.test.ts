import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { softDeleteMiddleware } from './softDelete.js';

describe('softDeleteMiddleware', () => {
  it('excludes deleted rows from ordinary reads', async () => {
    const next = vi.fn().mockResolvedValue([]);
    const params = {
      model: 'User',
      action: 'findMany',
      args: { where: { role: 'user' } },
    } as unknown as Prisma.MiddlewareParams;

    await softDeleteMiddleware(params, next);

    expect(params.args.where).toEqual({
      AND: [{ role: 'user' }, { deletedAt: null }],
    });
    expect(next).toHaveBeenCalledWith(params);
  });

  it('converts unique reads so the default filter can be applied', async () => {
    const next = vi.fn().mockResolvedValue(null);
    const params = {
      model: 'User',
      action: 'findUnique',
      args: { where: { id: 'user-1' } },
    } as unknown as Prisma.MiddlewareParams;

    await softDeleteMiddleware(params, next);

    expect(params.action).toBe('findFirst');
    expect(params.args.where).toEqual({
      AND: [{ id: 'user-1' }, { deletedAt: null }],
    });
  });

  it('leaves the explicit audit client path unfiltered', async () => {
    const next = vi.fn().mockResolvedValue(null);
    const params = {
      model: 'User',
      action: 'findMany',
      args: { where: { deletedAt: { not: null } } },
    } as unknown as Prisma.MiddlewareParams;

    await next(params);

    expect(params.args.where).toEqual({ deletedAt: { not: null } });
  });
});