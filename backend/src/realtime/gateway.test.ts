import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config/index.js';
import { initRealtime, emitBalanceUpdated, emitTipCreated, emitNotificationCreated } from './gateway.js';
import type { TipResponseDto } from '../modules/tips/tips.dto.js';

function makeToken(payload: { userId: string; stellarAddress: string }): string {
  return jwt.sign(
    { ...payload, role: 'user', scopes: [] },
    config.auth.jwtSecret,
    { expiresIn: '15m' },
  );
}

describe('balance.updated (issue #951)', () => {
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
    clientSocket?.close();
    httpServer.close();
  });

  it('delivers balance.updated only to the balance owner, after they subscribe', async () => {
    const userId = 'user-1';
    const token = makeToken({ userId, stellarAddress: 'GOWNER' });

    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()));
    clientSocket.emit('subscribe:notifications', userId);
    // Give the server a tick to process the join before we emit.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const payload = new Promise((resolve) => clientSocket.on('balance.updated', resolve));

    emitBalanceUpdated({
      userId,
      stellarAddress: 'GOWNER',
      totalReceived: '5000000',
      totalWithdrawn: '1000000',
      withdrawableBalance: '4000000',
    });

    await expect(payload).resolves.toMatchObject({
      userId,
      withdrawableBalance: '4000000',
    });
  });

  it('rejects subscribing to another user\'s balance room', async () => {
    const token = makeToken({ userId: 'user-1', stellarAddress: 'GOWNER' });

    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()));

    const errorEvent = new Promise((resolve) => clientSocket.on('error', resolve));
    clientSocket.emit('subscribe:notifications', 'someone-elses-id');

    await expect(errorEvent).resolves.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a connection with no auth token', async () => {
    clientSocket = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
    });

    const err = await new Promise<Error>((resolve) => {
      clientSocket.on('connect_error', resolve);
    });

    expect(err.message).toMatch(/token/i);
  });
});

describe('room broadcasts (issue #957)', () => {
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
    clientSocket?.close();
    httpServer.close();
  });

  it('delivers tip.created only to sockets subscribed to the creator room', async () => {
    const token = makeToken({ userId: 'user-1', stellarAddress: 'GOWNER' });
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()));
    clientSocket.emit('subscribe:creator', 'GCREATOR');
    await new Promise((resolve) => setTimeout(resolve, 50));

    const payload = new Promise((resolve) => clientSocket.on('tip.created', resolve));

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
    };
    emitTipCreated(tip);

    await expect(payload).resolves.toMatchObject({ id: 'tip-1', toAddress: 'GCREATOR' });
  });

  it('does not deliver tip.created to a socket subscribed to a different creator room', async () => {
    const token = makeToken({ userId: 'user-1', stellarAddress: 'GOWNER' });
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()));
    clientSocket.emit('subscribe:creator', 'GOTHERCREATOR');
    await new Promise((resolve) => setTimeout(resolve, 50));

    let received = false;
    clientSocket.on('tip.created', () => {
      received = true;
    });

    emitTipCreated({
      id: 'tip-2',
      txHash: 'tx-2',
      ledger: 101,
      fromAddress: 'GTIPPER',
      toAddress: 'GCREATOR',
      amountStroops: '1000000',
      status: 'CONFIRMED',
      message: null,
      createdAt: new Date().toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toBe(false);
  });

  it('delivers notification.created only to the notified user\'s room', async () => {
    const userId = 'user-1';
    const token = makeToken({ userId, stellarAddress: 'GOWNER' });
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()));
    clientSocket.emit('subscribe:notifications', userId);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const payload = new Promise((resolve) => clientSocket.on('notification.created', resolve));

    emitNotificationCreated({
      id: 'notif-1',
      userId,
      type: 'subscription_charged',
      payload: { amountStroops: '500' },
      createdAt: new Date().toISOString(),
    });

    await expect(payload).resolves.toMatchObject({ id: 'notif-1', userId, type: 'subscription_charged' });
  });
});
