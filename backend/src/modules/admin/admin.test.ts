import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../common/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { listUsers, suspendUser } from './admin.service.js';
import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../common/errors/AppError.js';

const fakeUsers = [
  {
    id: 'user_01',
    username: 'alice',
    displayName: 'Alice',
    stellarAddress: 'GAAA...',
    role: 'user',
    createdAt: new Date('2026-07-01'),
    deletedAt: null,
  },
  {
    id: 'user_02',
    username: 'bob',
    displayName: 'Bob',
    stellarAddress: 'GBBB...',
    role: 'admin',
    createdAt: new Date('2026-07-02'),
    deletedAt: null,
  },
];

describe('listUsers (issue #1041)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated users ordered by createdAt desc', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce(fakeUsers as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(2 as never);

    const result = await listUsers({ page: 1, limit: 20 });

    expect(result.entries).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.entries[0].username).toBe('alice');
  });

  it('filters by role when provided', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([fakeUsers[1]] as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(1 as never);

    await listUsers({ page: 1, limit: 20, role: 'admin' });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: 'admin' }),
      }),
    );
  });

  it('calculates skip correctly for pagination', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(0 as never);

    await listUsers({ page: 3, limit: 10 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
      }),
    );
  });
});

describe('suspendUser (issue #1041)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('soft-deletes a user by setting deletedAt', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(fakeUsers[0] as never);

    await suspendUser('user_01', 'spam');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_01' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('throws NotFoundError when user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    await expect(suspendUser('nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when user is already suspended', async () => {
    const deletedUser = { ...fakeUsers[0], deletedAt: new Date() };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(deletedUser as never);

    await expect(suspendUser('user_01')).rejects.toThrow(NotFoundError);
  });

  it('accepts optional reason but does not require it', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(fakeUsers[0] as never);

    await suspendUser('user_01');

    expect(prisma.user.update).toHaveBeenCalled();
  });
});
