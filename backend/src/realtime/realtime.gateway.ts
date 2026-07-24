import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "@/config/env.js";
import { logger } from "@/common/utils/logger.js";
import { registerClosable } from "@/common/utils/lifecycle.js";
import { socketAuthMiddleware } from "./realtime.auth.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "./realtime.types.js";

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Realtime gateway (#946): attaches Socket.IO to the given HTTP server.
 *
 * Auth (#947) is enforced via a handshake middleware before `connection`
 * fires, so every socket reaching the handler below is authenticated.
 */
export function initRealtime(httpServer: HttpServer): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN.split(","), credentials: true },
  });

  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    const { userId } = socket.data.auth;
    logger.info({ userId, socketId: socket.id }, "Socket connected");

    socket.emit("connected", { userId });

    socket.on("disconnect", (reason) => {
      logger.info({ userId, socketId: socket.id, reason }, "Socket disconnected");
    });
  });

  registerClosable({
    name: "Socket.IO",
    close: async () => {
      await io.close();
    },
  });

  return io;
}
