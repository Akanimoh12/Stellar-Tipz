import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import jwt from 'jsonwebtoken'
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../config/index.js'
import {
  initRealtime,
  emitBalanceUpdated,
  emitTipCreated,
  emitNotificationCreated,
  emitLeaderboardUpdated,
  scheduleTokenExpiry,
} from './gateway.js'
import type { TipResponseDto } from '../modules/tips/tips.dto.js'

function makeToken(payload: { userId: string; stellarAddress: string }): string {
  return jwt.sign({ ...payload, role: 'user', scopes: [] }, config.auth.jwtSecret, {
    expiresIn: '15m',
  })
}

describe('realtime authentication hardening (issue #1282)', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let clientSocket: ClientSocket;

  beforeEach(async () => {
    httpServer = createServer();
    initRealtime(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(() => {
    vi.useRealTimers();
    clientSocket?.close();
    httpServer.close();
  });

  it('authenticates a handshake token from the auth payload', async () => {
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token: makeToken({ userId: 'auth-user', stellarAddress: 'GAUTH' }) },
      transports: ['websocket'],
    });

    const connected = await new Promise<{ userId: string }>((resolve, reject) => {
      clientSocket.on('connected', resolve);
      clientSocket.on('connect_error', reject);
    });

    expect(connected).toEqual({ userId: 'auth-user' });
  });

  it('does not accept a token from the query string', async () => {
    clientSocket = ioClient(`http://localhost:${port}`, {
      query: { token: makeToken({ userId: 'query-user', stellarAddress: 'GQUERY' }) },
      transports: ['websocket'],
    });

    const error = await new Promise<Error>((resolve) => {
      clientSocket.on('connect_error', resolve);
    });

    expect(error.message).toBe('Authentication token is required');
  });

  it('rejects an invalid auth-payload token', async () => {
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token: 'invalid-token' },
      transports: ['websocket'],
    });

    const error = await new Promise<Error>((resolve) => {
      clientSocket.on('connect_error', resolve);
    });

    expect(error.message).toBe('Invalid or expired token');
  });

  it('emits a distinguishable reason and disconnects when a live token expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const socket = {
      id: 'expiring-socket',
      data: {
        auth: {
          userId: 'expiring-user',
          exp: Date.now() / 1_000 + 1,
        },
      },
      emit: vi.fn(),
      disconnect: vi.fn(),
      once: vi.fn(),
    };

    scheduleTokenExpiry(socket as never);
    vi.advanceTimersByTime(999);

    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(socket.emit).toHaveBeenCalledWith('auth.expired', {
      code: 'AUTH_TOKEN_EXPIRED',
      message: 'Access token expired',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('cancels the token-expiry timer when the socket disconnects first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    let onDisconnect: (() => void) | undefined;

    const socket = {
      id: 'closed-socket',
      data: {
        auth: {
          userId: 'closed-user',
          exp: Date.now() / 1_000 + 1,
        },
      },
      emit: vi.fn(),
      disconnect: vi.fn(),
      once: vi.fn((event: string, handler: () => void) => {
        if (event === 'disconnect') onDisconnect = handler;
      }),
    };

    scheduleTokenExpiry(socket as never);
    onDisconnect?.();
    vi.advanceTimersByTime(1_000);

    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});

describe('balance.updated (issue #951)', () => {
  let httpServer: ReturnType<typeof createServer>
  let port: number
  let clientSocket: ClientSocket

  beforeEach(async () => {
    httpServer = createServer()
    initRealtime(httpServer)
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    port = (httpServer.address() as AddressInfo).port
  })

  afterEach(() => {
    clientSocket?.close()
    httpServer.close()
  })

  it('delivers balance.updated only to the balance owner, after they subscribe', async () => {
    const userId = 'user-1'
    const token = makeToken({ userId, stellarAddress: 'GOWNER' })

    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()))
    clientSocket.emit('subscribe:notifications', userId)
    // Give the server a tick to process the join before we emit.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const payload = new Promise((resolve) => clientSocket.on('balance.updated', resolve))

    emitBalanceUpdated({
      userId,
      stellarAddress: 'GOWNER',
      totalReceived: '5000000',
      totalWithdrawn: '1000000',
      withdrawableBalance: '4000000',
    })

    await expect(payload).resolves.toMatchObject({
      userId,
      withdrawableBalance: '4000000',
    })
  })

  it("rejects subscribing to another user's balance room", async () => {
    const token = makeToken({ userId: 'user-1', stellarAddress: 'GOWNER' })

    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()))

    const errorEvent = new Promise((resolve) => clientSocket.on('error', resolve))
    clientSocket.emit('subscribe:notifications', 'someone-elses-id')

    await expect(errorEvent).resolves.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects a connection with no auth token', async () => {
    clientSocket = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
    })

    const err = await new Promise<Error>((resolve) => {
      clientSocket.on('connect_error', resolve)
    })

    expect(err.message).toMatch(/token/i)
  })
})

describe('room broadcasts (issue #957)', () => {
  let httpServer: ReturnType<typeof createServer>
  let port: number
  let clientSocket: ClientSocket

  beforeEach(async () => {
    httpServer = createServer()
    initRealtime(httpServer)
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    port = (httpServer.address() as AddressInfo).port
  })

  afterEach(() => {
    clientSocket?.close()
    httpServer.close()
  })

  it('delivers tip.created only to the authenticated creator room', async () => {
    const token = makeToken({ userId: 'user-1', stellarAddress: 'GCREATOR' })
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()))
    clientSocket.emit('subscribe:creator', 'GCREATOR')
    await new Promise((resolve) => setTimeout(resolve, 50))

    const payload = new Promise((resolve) => clientSocket.on('tip.created', resolve))

    const tip: TipResponseDto = {
      id: 'tip-1',
      txHash: 'tx-1',
      ledger: 100,
      fromAddress: 'GTIPPER',
      toAddress: 'GCREATOR',
      amountStroops: '5000000',
      status: 'CONFIRMED',
      message: null,
      createdAt: new Date().toISOString(),
    }
    emitTipCreated(tip)

    await expect(payload).resolves.toMatchObject({ id: 'tip-1', toAddress: 'GCREATOR' })
  })

  it('rejects a cross-user creator room join', async () => {
    const token = makeToken({ userId: 'user-1', stellarAddress: 'GOWNER' })
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()))
    const errorEvent = new Promise((resolve) => clientSocket.on('error', resolve))
    clientSocket.emit('subscribe:creator', 'GOTHERCREATOR')

    await expect(errorEvent).resolves.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('allows authenticated users to join the explicitly public leaderboard room', async () => {
    const token = makeToken({ userId: 'user-1', stellarAddress: 'GOWNER' })
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()))
    clientSocket.emit('subscribe:leaderboard')
    await new Promise((resolve) => setTimeout(resolve, 50))

    const payload = new Promise((resolve) => clientSocket.on('leaderboard.updated', resolve))
    emitLeaderboardUpdated({
      window: 'all',
      entry: {
        rank: 1,
        userId: 'leader-1',
        stellarAddress: 'GLEADER',
        totalTips: '1000000',
      },
    })

    await expect(payload).resolves.toMatchObject({
      window: 'all',
      entry: { rank: 1, userId: 'leader-1' },
    })
  })

  it("delivers notification.created only to the notified user's room", async () => {
    const userId = 'user-1'
    const token = makeToken({ userId, stellarAddress: 'GOWNER' })
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()))
    clientSocket.emit('subscribe:notifications', userId)
    await new Promise((resolve) => setTimeout(resolve, 50))

    const payload = new Promise((resolve) => clientSocket.on('notification.created', resolve))

    emitNotificationCreated({
      id: 'notif-1',
      userId,
      type: 'subscription_charged',
      payload: { amountStroops: '500' },
      createdAt: new Date().toISOString(),
    })

    await expect(payload).resolves.toMatchObject({
      id: 'notif-1',
      userId,
      type: 'subscription_charged',
    })
  })
})
