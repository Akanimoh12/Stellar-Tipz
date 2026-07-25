import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { env } from '../config/env.js';
import { initRealtime } from './gateway.js';
import { socketAuth } from './auth.js';
import { connectionLimiter, eventLimiter, SlidingWindowLimiter } from './rateLimit.js';

function makeToken(overrides: Partial<Record<string, unknown>> = {}): string {
  return jwt.sign(
    { userId: 'user-1', stellarAddress: 'GABC', role: 'user', scopes: [], ...overrides },
    env.JWT_SECRET,
    { expiresIn: '1h' },
  );
}

describe('socketAuth', () => {
  it('rejects a connection with no token', () => {
    const next = vi.fn();
    const socket = { id: 's1', handshake: { auth: {} }, data: {} } as never;

    socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rejects a connection with an invalid token', () => {
    const next = vi.fn();
    const socket = {
      id: 's2',
      handshake: { auth: { token: 'not-a-real-token' } },
      data: {},
    } as never;

    socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('accepts a valid token and attaches the payload to socket.data.auth', () => {
    const next = vi.fn();
    const token = makeToken({ userId: 'user-42' });
    const socket = { id: 's3', handshake: { auth: { token } }, data: {} } as never as {
      data: { auth?: { userId: string } };
    };

    socketAuth(socket as never, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.auth?.userId).toBe('user-42');
  });
});

describe('SlidingWindowLimiter', () => {
  it('allows up to `max` hits per window and rejects the next one', () => {
    const limiter = new SlidingWindowLimiter(2, 10_000);

    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('a')).toBe(false);
  });

  it('tracks separate keys independently', () => {
    const limiter = new SlidingWindowLimiter(1, 10_000);

    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('b')).toBe(true);
  });

  it('resets once the window elapses', () => {
    vi.useFakeTimers();
    const limiter = new SlidingWindowLimiter(1, 1_000);

    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('a')).toBe(false);

    vi.advanceTimersByTime(1_001);
    expect(limiter.consume('a')).toBe(true);

    vi.useRealTimers();
  });
});

describe('initRealtime', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let clientSocket: ClientSocket;

  beforeEach(async () => {
    connectionLimiter.sweep();
    eventLimiter.sweep();
    httpServer = createServer();
    initRealtime(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(() => {
    clientSocket?.close();
    httpServer.close();
  });

  it('accepts an authenticated client and emits connected', async () => {
    const token = makeToken({ userId: 'user-conn' });

    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    });

    const payload = await new Promise<{ userId: string }>((resolve, reject) => {
      clientSocket.on('connected', resolve);
      clientSocket.on('connect_error', reject);
    });

    expect(payload.userId).toBe('user-conn');
  });

  it('rejects a client with no token', async () => {
    clientSocket = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
    });

    const err = await new Promise<Error>((resolve) => {
      clientSocket.on('connect_error', resolve);
    });

    expect(err.message).toMatch(/token/i);
  });

  it('joins a creator room on subscribe:creator', async () => {
    const token = makeToken({ userId: 'user-sub' });
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => clientSocket.on('connected', () => resolve()));

    // No server ack for subscribe — this just verifies the handler doesn't error.
    let errored = false;
    clientSocket.on('error', () => {
      errored = true;
    });
    clientSocket.emit('subscribe:creator', 'GCREATOR');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(errored).toBe(false);
  });

  it('rejects subscribing to another user\'s notifications room', async () => {
    const token = makeToken({ userId: 'user-a' });
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => clientSocket.on('connected', () => resolve()));

    const err = await new Promise<{ code: string }>((resolve) => {
      clientSocket.on('error', resolve);
      clientSocket.emit('subscribe:notifications', 'user-b');
    });

    expect(err.code).toBe('FORBIDDEN');
  });
});
