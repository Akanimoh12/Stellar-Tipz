import type { NextFunction, Request, Response } from 'express';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '../../common/errors/AppError.js';
import { requireRole } from '../auth/auth.middleware.js';
import { ADMIN_ROLE, auditAdminAction, resolveAdminActor } from './admin.middleware.js';

const { mockAuditLogCreate } = vi.hoisted(() => ({
  mockAuditLogCreate: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: { auditLog: { create: mockAuditLogCreate }, $disconnect: vi.fn() },
}));

type AuthLike = { userId: string; stellarAddress: string; role: string; scopes: string[] };

function authPayload(role = ADMIN_ROLE, userId = 'admin-1'): AuthLike {
  return { userId, stellarAddress: 'G'.repeat(56), role, scopes: [] };
}

/** A minimal Request stand-in carrying only what the middleware reads. */
function fakeRequest(overrides: Partial<Request> = {}): Request {
  return { method: 'GET', originalUrl: '/api/v1/admin/stats', ...overrides } as Request;
}

/** A Response stand-in that emits `finish` on demand, like a real one. */
function fakeResponse(statusCode = 200): Response & { finish: () => void } {
  const res = new EventEmitter() as Response & { finish: () => void };
  res.statusCode = statusCode;
  res.finish = () => res.emit('finish');
  return res;
}

/** Flushes the microtask queue so fire-and-forget audit writes settle. */
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
  mockAuditLogCreate.mockResolvedValue({
    id: 'log-1',
    actor: 'admin-1',
    action: 'admin.stats.read',
    target: null,
    metadata: {},
    createdAt: new Date('2024-01-01T00:00:00Z'),
  });
});

describe('requireRole', () => {
  it('calls next() when the role matches', () => {
    const req = fakeRequest({ auth: authPayload(ADMIN_ROLE) });
    const next = vi.fn() as unknown as NextFunction;

    requireRole(ADMIN_ROLE)(req, fakeResponse(), next);

    expect(next).toHaveBeenCalledOnce();
    expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]).toHaveLength(0);
  });

  it('rejects an unauthenticated request with 401', () => {
    const req = fakeRequest();

    expect(() => requireRole(ADMIN_ROLE)(req, fakeResponse(), vi.fn())).toThrow(
      UnauthorizedError,
    );
  });

  it('rejects a non-admin role with 403', () => {
    const req = fakeRequest({ auth: authPayload('user') });

    try {
      requireRole(ADMIN_ROLE)(req, fakeResponse(), vi.fn());
      expect.unreachable('expected a ForbiddenError');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).statusCode).toBe(403);
    }
  });

  it('is case-sensitive, so "Admin" does not satisfy "admin"', () => {
    const req = fakeRequest({ auth: authPayload('Admin') });

    expect(() => requireRole(ADMIN_ROLE)(req, fakeResponse(), vi.fn())).toThrow(
      ForbiddenError,
    );
  });

  it('refuses to build a guard for an empty role', () => {
    expect(() => requireRole('')).toThrow('Invalid role parameter');
  });
});

describe('resolveAdminActor', () => {
  it('reads the actor id from req.auth.userId', () => {
    expect(resolveAdminActor(fakeRequest({ auth: authPayload() }))).toBe('admin-1');
  });

  it('falls back to req.user.id', () => {
    const req = fakeRequest({
      user: { id: 'admin-2', stellarAddress: 'G'.repeat(56), username: null },
    });

    expect(resolveAdminActor(req)).toBe('admin-2');
  });

  it('throws Unauthorized when neither is set', () => {
    expect(() => resolveAdminActor(fakeRequest())).toThrow(UnauthorizedError);
  });
});

describe('auditAdminAction', () => {
  it('records the request once the response succeeds', async () => {
    const req = fakeRequest({ auth: authPayload() });
    const res = fakeResponse(200);
    const next = vi.fn();

    auditAdminAction('admin.stats.read')(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    // Nothing is written until the response is actually flushed.
    expect(mockAuditLogCreate).not.toHaveBeenCalled();

    res.finish();
    await flush();

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        actor: 'admin-1',
        action: 'admin.stats.read',
        target: null,
        metadata: {
          method: 'GET',
          path: '/api/v1/admin/stats',
          statusCode: 200,
        },
      },
    });
  });

  it('skips failed requests', async () => {
    const req = fakeRequest({ auth: authPayload('user') });
    const res = fakeResponse(403);

    auditAdminAction('admin.stats.read')(req, res, vi.fn() as unknown as NextFunction);
    res.finish();
    await flush();

    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('skips requests with no resolvable actor', async () => {
    const res = fakeResponse(200);

    auditAdminAction('admin.stats.read')(
      fakeRequest(),
      res,
      vi.fn() as unknown as NextFunction,
    );
    res.finish();
    await flush();

    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('swallows audit write failures so the response is never affected', async () => {
    mockAuditLogCreate.mockRejectedValue(new Error('db down'));
    const req = fakeRequest({ auth: authPayload() });
    const res = fakeResponse(200);

    auditAdminAction('admin.stats.read')(req, res, vi.fn() as unknown as NextFunction);
    res.finish();

    await expect(flush()).resolves.toBeUndefined();
    expect(mockAuditLogCreate).toHaveBeenCalledOnce();
  });
});
