import { beforeEach, describe, expect, it, vi } from 'vitest';
const { xrange, evalScript } = vi.hoisted(() => ({ xrange: vi.fn(), evalScript: vi.fn() }));
vi.mock('../db/redis.js', () => ({ redis: { xrange, eval: evalScript } }));
import { catchUp, catchupRequestSchema, publishRoomEvent } from './catchup.js';

beforeEach(() => vi.clearAllMocks());
describe('reconnect catch-up', () => {
  it('returns only missed events in original room order', async () => {
    xrange.mockResolvedValue(
      ['100-0', '100-1', '101-0'].map((id) => [
        id,
        ['event', 'tip.created', 'payload', JSON.stringify({ id })],
      ]),
    );
    expect(await catchUp('creator:GABC', '100-0')).toEqual({
      refreshRequired: false,
      events: [
        { id: '100-1', room: 'creator:GABC', event: 'tip.created', payload: { id: '100-1' } },
        { id: '101-0', room: 'creator:GABC', event: 'tip.created', payload: { id: '101-0' } },
      ],
    });
    expect((await catchUp('creator:GABC', '101-0')).events).toEqual([]);
  });
  it.each([[], [['200-0', ['event', 'tip.created', 'payload', '{}']]]])(
    'requires a full refresh for expired, trimmed or unknown cursors',
    async (...rows) => {
      xrange.mockResolvedValue(rows.length === 1 && Array.isArray(rows[0]) ? rows[0] : rows);
      expect(await catchUp('user:alice', '100-0')).toEqual({ events: [], refreshRequired: true });
    },
  );
  it('validates room names and cursor syntax', () => {
    expect(catchupRequestSchema.safeParse({ room: 'user:alice', lastSeenId: '1-0' }).success).toBe(
      true,
    );
    expect(catchupRequestSchema.safeParse({ room: '*', lastSeenId: '-' }).success).toBe(false);
  });
  it('atomically bounds, expires and publishes each event', async () => {
    await publishRoomEvent('user:alice', 'notification.created', { id: 'n1' });
    const args = evalScript.mock.calls[0];
    expect(args[0]).toContain("'MAXLEN', '='");
    expect(args[0]).toContain("'EXPIRE'");
    expect(args[0]).toContain("'PUBLISH'");
    expect(args.slice(1)).toEqual([
      1,
      'realtime:recent:user:alice',
      100,
      3600,
      'notification.created',
      '{"id":"n1"}',
      'realtime:room-events',
      'user:alice',
    ]);
  });
});
