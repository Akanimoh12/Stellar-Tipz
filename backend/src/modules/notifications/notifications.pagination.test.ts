import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindMany } = vi.hoisted(() => ({ mockFindMany: vi.fn() }));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    notification: { findMany: mockFindMany },
  },
}));

vi.mock('../../realtime/index.js', () => ({
  emitNotificationCreated: vi.fn(),
}));

import { createCursorScope, decodeCursor } from '../../common/pagination/cursor.js';
import { listNotifications } from './notifications.service.js';

function notification(id: string, createdAt: string) {
  return {
    id,
    type: 'tip_received',
    payload: {},
    readAt: null,
    createdAt: new Date(createdAt),
  };
}

describe('notification cursor pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an opaque cursor and applies its timestamp/id boundary', async () => {
    const rows = [
      notification('notification-3', '2026-08-26T00:00:03.000Z'),
      notification('notification-2', '2026-08-26T00:00:02.000Z'),
      notification('notification-1', '2026-08-26T00:00:01.000Z'),
    ];
    mockFindMany.mockResolvedValueOnce(rows);

    const firstPage = await listNotifications('user-1', false, 2);
    const scope = createCursorScope('notifications', { userId: 'user-1', unreadOnly: false });
    expect(firstPage.data.map((row) => row.id)).toEqual(['notification-3', 'notification-2']);
    expect(decodeCursor(firstPage.nextCursor!, scope)).toEqual({
      sortValue: rows[1].createdAt,
      id: 'notification-2',
    });

    mockFindMany.mockResolvedValueOnce([rows[2]]);
    const lastPage = await listNotifications('user-1', false, 2, firstPage.nextCursor!);

    expect(lastPage.nextCursor).toBeNull();
    expect(mockFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          AND: [
            { userId: 'user-1', deletedAt: null },
            {
              OR: [
                { createdAt: { lt: rows[1].createdAt } },
                { createdAt: rows[1].createdAt, id: { lt: 'notification-2' } },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
      }),
    );
  });

  it('rejects an invalid cursor before querying the database', async () => {
    await expect(listNotifications('user-1', false, 20, 'not-a-signed-cursor')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid pagination cursor',
    });
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
