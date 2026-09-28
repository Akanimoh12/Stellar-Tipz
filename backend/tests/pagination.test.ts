import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '../src/common/errors/AppError.js';
import { deprecatedOffsetPagination } from '../src/common/middleware/deprecatedOffsetPagination.js';
import {
  createCursorScope,
  decodeCursor,
  encodeCursor,
  toCursorPage,
} from '../src/common/pagination/cursor.js';

vi.mock('../src/common/utils/logger.js', () => ({
  logger: { warn: vi.fn() },
}));

type Row = { id: string; createdAt: Date };

function newestFirst(rows: Row[]): Row[] {
  return [...rows].sort(
    (left, right) =>
      right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id),
  );
}

describe('signed cursor pagination', () => {
  const scope = createCursorScope('test-feed', { userId: 'user-1' });

  it('remains stable when a row is inserted between page requests', () => {
    const original = newestFirst([
      { id: 'id-1', createdAt: new Date('2026-08-26T00:00:01.000Z') },
      { id: 'id-2', createdAt: new Date('2026-08-26T00:00:02.000Z') },
      { id: 'id-3', createdAt: new Date('2026-08-26T00:00:03.000Z') },
      { id: 'id-4', createdAt: new Date('2026-08-26T00:00:04.000Z') },
    ]);
    const firstPage = toCursorPage(original.slice(0, 3), 2, scope, (row) => row.createdAt);
    const afterInsert = newestFirst([
      ...original,
      { id: 'id-5', createdAt: new Date('2026-08-26T00:00:05.000Z') },
    ]);
    const position = decodeCursor(firstPage.nextCursor!, scope);
    const remaining = afterInsert.filter(
      (row) =>
        row.createdAt < position.sortValue ||
        (row.createdAt.getTime() === position.sortValue.getTime() && row.id < position.id),
    );
    const secondPage = toCursorPage(remaining.slice(0, 3), 2, scope, (row) => row.createdAt);

    expect(firstPage.data.map((row) => row.id)).toEqual(['id-4', 'id-3']);
    expect(secondPage.data.map((row) => row.id)).toEqual(['id-2', 'id-1']);
    expect([...firstPage.data, ...secondPage.data].map((row) => row.id)).toEqual(
      original.map((row) => row.id),
    );

    // The former offset=2 query shifts after the insert and repeats id-3.
    expect(afterInsert.slice(2, 4).map((row) => row.id)).toEqual(['id-3', 'id-2']);
  });

  it('rejects malformed, tampered, and cross-scope cursors', () => {
    const cursor = encodeCursor(
      { sortValue: new Date('2026-08-26T00:00:00.000Z'), id: 'id-1' },
      scope,
    );
    const tampered = `${cursor.slice(0, -1)}${cursor.endsWith('a') ? 'b' : 'a'}`;

    expect(() => decodeCursor('not-a-cursor', scope)).toThrow(BadRequestError);
    expect(() => decodeCursor(tampered, scope)).toThrow(BadRequestError);
    expect(() => decodeCursor(cursor, createCursorScope('other-feed'))).toThrow(BadRequestError);
  });

  it('returns a null cursor on the final page', () => {
    const page = toCursorPage(
      [{ id: 'id-1', createdAt: new Date('2026-08-26T00:00:00.000Z') }],
      20,
      scope,
      (row) => row.createdAt,
    );

    expect(page.nextCursor).toBeNull();
  });

  it('continues accepting offset while returning deprecation metadata', async () => {
    const app = express();
    app.get('/items', deprecatedOffsetPagination, (_req, res) => res.json({ data: [] }));

    const response = await request(app).get('/items?limit=20&offset=40');

    expect(response.status).toBe(200);
    expect(response.headers.deprecation).toMatch(/^@\d+$/);
    expect(response.headers.sunset).toBe('Sun, 28 Feb 2027 00:00:00 GMT');
  });
});
