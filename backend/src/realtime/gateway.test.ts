import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config/index.js';
import { initRealtime, emitBalanceUpdated } from './gateway.js';

function makeToken(payload: { sub: string; stellarAddress: string }): string {
  return jwt.sign(payload, config.auth.jwtSecret, { expiresIn: '15m' });
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
    const token = makeToken({ sub: userId, stellarAddress: 'GOWNER' });

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
    const token = makeToken({ sub: 'user-1', stellarAddress: 'GOWNER' });

    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => clientSocket.on('connect', () => resolve()));

    const errorEvent = new Promise((resolve) => clientSocket.on('error', resolve));
    clientSocket.emit('subscribe:notifications', 'someone-elses-id');

    await expect(errorEvent).resolves.toMatchObject({ message: 'Forbidden' });
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
