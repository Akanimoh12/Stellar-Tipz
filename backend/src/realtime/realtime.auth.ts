import type { Socket, ExtendedError } from "socket.io";
import { verifyAccessToken } from "@/modules/auth/auth.service.js";
import type { SocketData } from "./realtime.types.js";

/**
 * Socket.IO middleware (#947): authenticates a connecting socket using the
 * same JWT access token issued by the REST auth module.
 *
 * The client must send the token as `socket.handshake.auth.token`, e.g.:
 *   io(url, { auth: { token: accessToken } })
 *
 * On success, the decoded payload is attached to `socket.data.auth`.
 * On failure, the connection is rejected before `connection` fires.
 */
export function socketAuthMiddleware(
  socket: Socket<object, object, object, SocketData>,
  next: (err?: ExtendedError) => void,
): void {
  const token = socket.handshake.auth?.["token"] as string | undefined;

  if (!token) {
    next(new Error("Missing authentication token"));
    return;
  }

  try {
    socket.data.auth = verifyAccessToken(token);
    next();
  } catch {
    next(new Error("Invalid or expired authentication token"));
  }
}
