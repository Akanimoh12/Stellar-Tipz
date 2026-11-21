import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  throttleEventPerConnection,
  getConnectionMetrics,
  broadcastWithBackpressure,
} from './backpressure.js';

vi.mock('../config/env.js', () => ({
  env: {
    SOCKET_IO_MAX_BUFFER_SIZE: 1048576,
    SOCKET_IO_CONNECTION_TIMEOUT_MS: 30000,
  },
}));

vi.mock('../common/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('realtime backpressure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConnectionMetrics', () => {
    it('returns empty metrics when no connections active', () => {
      const metrics = getConnectionMetrics();
      expect(metrics.totalConnections).toBe(0);
      expect(metrics.highPressureConnections).toBe(0);
      expect(metrics.averageBufferSize).toBe(0);
    });
  });

  describe('throttleEventPerConnection', () => {
    it('emits event when socket has no metrics tracking yet', () => {
      const mockSocket = {
        id: 'socket-1',
        emit: vi.fn(),
      } as any;

      const result = throttleEventPerConnection(mockSocket, 'test-event', { data: 123 });
      expect(result).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('test-event', { data: 123 });
    });
  });

  describe('broadcastWithBackpressure', () => {
    it('broadcasts to all sockets matching filter', () => {
      const socketA = { id: 's1', emit: vi.fn() };
      const socketB = { id: 's2', emit: vi.fn() };

      const mockIo = {
        sockets: {
          sockets: new Map([
            ['s1', socketA],
            ['s2', socketB],
          ]),
        },
      } as any;

      broadcastWithBackpressure(mockIo, 'announcement', { msg: 'hello' });
      expect(socketA.emit).toHaveBeenCalledWith('announcement', { msg: 'hello' });
      expect(socketB.emit).toHaveBeenCalledWith('announcement', { msg: 'hello' });
    });
  });
});
