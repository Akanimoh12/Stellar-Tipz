import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../logger';

describe('logger', () => {
  beforeEach(() => {
    // Reset to a permissive level so all log functions actually emit.
    logger.configure({ minLevel: 'debug', remoteEndpoint: '' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('log levels', () => {
    it('calls console.debug for debug logs', () => {
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      logger.debug('mod', 'hello');
      expect(spy).toHaveBeenCalled();
      const args = spy.mock.calls[0];
      expect(args[0]).toContain('[DEBUG]');
      expect(args[0]).toContain('[mod]');
      expect(args[1]).toBe('hello');
    });

    it('calls console.info for info logs', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      logger.info('mod', 'msg');
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain('[INFO]');
    });

    it('calls console.warn for warn logs', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      logger.warn('mod', 'msg');
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain('[WARN]');
    });

    it('calls console.error for error logs', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      logger.error('mod', 'msg');
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain('[ERROR]');
    });
  });

  describe('log level filtering', () => {
    it('suppresses debug logs when minLevel is info', () => {
      logger.configure({ minLevel: 'info' });
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      logger.debug('mod', 'should be suppressed');
      expect(spy).not.toHaveBeenCalled();
    });

    it('suppresses warn logs when minLevel is error', () => {
      logger.configure({ minLevel: 'error' });
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      logger.warn('mod', 'should be suppressed');
      expect(spy).not.toHaveBeenCalled();
    });

    it('allows error logs regardless of minLevel', () => {
      logger.configure({ minLevel: 'error' });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      logger.error('mod', 'should appear');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('context and error fields', () => {
    it('includes context object in console output', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const ctx = { userId: 'abc', action: 'tip_send' };
      logger.info('contract', 'msg', ctx);
      expect(spy.mock.calls[0]).toContain(ctx);
    });

    it('includes error object in console output', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const err = new Error('contract failed');
      logger.error('contract', 'send_tip failed', undefined, err);
      expect(spy.mock.calls[0]).toContain(err);
    });

    it('includes both context and error when both are provided', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const ctx = { amount: '10' };
      const err = new Error('rpc error');
      logger.error('rpc', 'tip failed', ctx, err);
      const args = spy.mock.calls[0];
      expect(args).toContain(ctx);
      expect(args).toContain(err);
    });
  });

  describe('timestamp', () => {
    it('includes an ISO timestamp in the prefix', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      logger.info('mod', 'msg');
      const prefix = spy.mock.calls[0][0] as string;
      expect(prefix).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('session ID', () => {
    it('getSessionId returns a non-empty string', () => {
      expect(typeof logger.getSessionId()).toBe('string');
      expect(logger.getSessionId().length).toBeGreaterThan(0);
    });

    it('returns the same session ID across calls', () => {
      expect(logger.getSessionId()).toBe(logger.getSessionId());
    });
  });

  describe('remote endpoint', () => {
    it('does not call fetch when remoteEndpoint is empty', () => {
      logger.configure({ remoteEndpoint: '' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 200 }),
      );
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      logger.info('mod', 'msg');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('calls fetch with the remote endpoint when configured', async () => {
      const endpoint = 'https://logs.example.com/ingest';
      logger.configure({ remoteEndpoint: endpoint });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 200 }),
      );
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      logger.warn('mod', 'wallet error');
      // Allow the async sendRemote to run.
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchSpy).toHaveBeenCalledWith(
        endpoint,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('does not throw when fetch rejects', async () => {
      logger.configure({ remoteEndpoint: 'https://logs.example.com/ingest' });
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      // Should not throw.
      expect(() => logger.error('mod', 'msg')).not.toThrow();
      await new Promise((r) => setTimeout(r, 0));
    });
  });
});
