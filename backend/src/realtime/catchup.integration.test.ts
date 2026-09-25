import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { redis } from '../db/redis.js';
import { signAccessToken } from '../modules/auth/jwt.js';
import { initRealtime } from './gateway.js';
import { catchUp, publishRoomEvent, type RoomEvent } from './catchup.js';
import { closeAll } from '../common/utils/lifecycle.js';

describe('Redis and Socket.IO reconnect catch-up', () => {
  const userId = randomUUID();
  const room = `user:${userId}`;
  const http = createServer();
  let url: string;
  const sockets: Socket[] = [];
  beforeAll(async () => {
    initRealtime(http);
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await redis.del(`realtime:recent:${room}`);
    await closeAll();
    await redis.quit();
  });
  async function client(): Promise<Socket> {
    const token = signAccessToken({ userId, stellarAddress: 'GTEST', role: 'user', scopes: [] });
    const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    socket.emit('subscribe:notifications', userId);
    // Socket.IO processes the subscription before the following catch-up request.
    await socket.emitWithAck('realtime:catchup', { room, lastSeenId: '0-0' });
    return socket;
  }
  it('replays missed events in order, rejects other users and reports trimmed cursors', async () => {
    const firstClient = await client();
    const live = new Promise<RoomEvent>((resolve) => firstClient.once('realtime.event', resolve));
    await publishRoomEvent(room, 'notification.created', { sequence: 0 });
    const first = await live;
    firstClient.disconnect();
    await publishRoomEvent(room, 'notification.created', { sequence: 1 });
    await publishRoomEvent(room, 'notification.created', { sequence: 2 });
    const resumed = await client();
    const result = await resumed.emitWithAck('realtime:catchup', { room, lastSeenId: first.id });
    expect(result.refreshRequired).toBe(false);
    expect(result.events.map((event: RoomEvent) => event.payload)).toEqual([
      { sequence: 1 },
      { sequence: 2 },
    ]);
    expect(
      await resumed.emitWithAck('realtime:catchup', {
        room: 'user:someone-else',
        lastSeenId: first.id,
      }),
    ).toEqual({ events: [], refreshRequired: true, error: 'FORBIDDEN' });
    for (let i = 3; i < 104; i++)
      await publishRoomEvent(room, 'notification.created', { sequence: i });
    expect(await redis.xlen(`realtime:recent:${room}`)).toBe(100);
    expect(await redis.ttl(`realtime:recent:${room}`)).toBeGreaterThan(0);
    expect(await catchUp(room, first.id)).toEqual({ events: [], refreshRequired: true });
    const lastId = (await redis.xrevrange(`realtime:recent:${room}`, '+', '-', 'COUNT', 1))[0][0];
    await redis.del(`realtime:recent:${room}`);
    expect(await catchUp(room, lastId)).toEqual({ events: [], refreshRequired: true });
  });
});
