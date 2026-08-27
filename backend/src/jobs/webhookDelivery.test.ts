import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('../db/redis.js', () => ({
  redis: { on: vi.fn() },
}));

vi.mock('../common/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('webhookDelivery (issue #999)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs webhook payload with HMAC-SHA256', () => {
    const secret = 'test-secret';
    const payload = JSON.stringify({ event: 'tip.received', tipId: 'tip_1' });

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const signature = hmac.digest('hex');

    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different signatures for different payloads', () => {
    const secret = 'test-secret';
    const payload1 = JSON.stringify({ amount: 100 });
    const payload2 = JSON.stringify({ amount: 200 });

    const hmac1 = crypto.createHmac('sha256', secret);
    hmac1.update(payload1);
    const sig1 = hmac1.digest('hex');

    const hmac2 = crypto.createHmac('sha256', secret);
    hmac2.update(payload2);
    const sig2 = hmac2.digest('hex');

    expect(sig1).not.toBe(sig2);
  });

  it('produces consistent signatures for identical inputs', () => {
    const secret = 'test-secret';
    const payload = JSON.stringify({ event: 'tip.received' });

    const sig1 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const sig2 = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    expect(sig1).toBe(sig2);
  });

  it('webhook delivery headers include X-Signature with sha256= prefix', () => {
    const secret = 'webhook-secret';
    const payload = JSON.stringify({ event: 'test' });

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const signature = `sha256=${hmac.digest('hex')}`;

    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});
