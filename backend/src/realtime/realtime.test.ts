/**
 * Tests for #946 (Socket.IO gateway init) and #947 (JWT socket auth handshake).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import jwt from "jsonwebtoken";

vi.mock("@/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4000,
    CORS_ORIGIN: "http://localhost:5173",
    JWT_SECRET: "test-secret-key-for-vitest",
    JWT_EXPIRES_IN: "15m",
    LOG_LEVEL: "silent",
  },
}));

vi.mock("@/db/prisma.js", () => ({
  prisma: {},
}));

import { initRealtime } from "./realtime.gateway.js";
import { socketAuthMiddleware } from "./realtime.auth.js";

const TEST_SECRET = "test-secret-key-for-vitest";

function makeToken(payload: object): string {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: "15m" });
}

// ── #947 socketAuthMiddleware (unit) ──────────────────────────────────────────

describe("socketAuthMiddleware (issue #947)", () => {
  it("rejects a connection with no token", () => {
    const next = vi.fn();
    const socket = { handshake: { auth: {} }, data: {} } as never;

    socketAuthMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("rejects a connection with an invalid token", () => {
    const next = vi.fn();
    const socket = {
      handshake: { auth: { token: "not-a-real-token" } },
      data: {},
    } as never;

    socketAuthMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("accepts a valid token and attaches the payload to socket.data.auth", () => {
    const next = vi.fn();
    const token = makeToken({
      userId: "user_01",
      stellarAddress: "GABC",
      role: "user",
      scopes: [],
    });
    const socket = { handshake: { auth: { token } }, data: {} } as never as {
      data: { auth?: { userId: string } };
    };

    socketAuthMiddleware(socket as never, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.auth?.userId).toBe("user_01");
  });
});

// ── #946 initRealtime (integration) ───────────────────────────────────────────

describe("initRealtime (issue #946)", () => {
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

  it("accepts an authenticated client and emits connected", async () => {
    const token = makeToken({
      userId: "user_02",
      stellarAddress: "GDEF",
      role: "user",
      scopes: [],
    });

    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ["websocket"],
    });

    const payload = await new Promise<{ userId: string }>((resolve, reject) => {
      clientSocket.on("connected", resolve);
      clientSocket.on("connect_error", reject);
    });

    expect(payload.userId).toBe("user_02");
  });

  it("rejects a client with no token", async () => {
    clientSocket = ioClient(`http://localhost:${port}`, {
      transports: ["websocket"],
    });

    const err = await new Promise<Error>((resolve) => {
      clientSocket.on("connect_error", resolve);
    });

    expect(err.message).toMatch(/token/i);
  });
});
