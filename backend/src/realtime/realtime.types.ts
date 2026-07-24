import type { AuthPayload } from "@/modules/auth/auth.types.js";

/**
 * Events the server may emit to a connected client.
 */
export interface ServerToClientEvents {
  connected: (payload: { userId: string }) => void;
  error: (payload: { message: string }) => void;
}

/**
 * Events a client may emit to the server.
 */
export interface ClientToServerEvents {
  ping: (ack: (payload: { pong: true }) => void) => void;
}

/**
 * Events emitted between server instances (unused for now, required by the
 * Socket.IO generic signature).
 */
export type InterServerEvents = Record<string, never>;

/**
 * Per-connection data attached during the auth handshake.
 */
export interface SocketData {
  auth: AuthPayload;
}
