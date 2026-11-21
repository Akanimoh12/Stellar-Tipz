import { describe, expect, it, vi } from 'vitest';
import { ProviderPool, parseProviderUrls } from './providerPool.js';

describe('provider failover', () => {
  it('deduplicates endpoints in priority order', () => {
    expect(parseProviderUrls('https://primary.example', 'https://backup.example,https://primary.example')).toEqual([
      'https://primary.example', 'https://backup.example',
    ]);
    expect(() => parseProviderUrls('https://primary.example', 'ftp://invalid.example')).toThrow();
  });

  it('uses the primary when healthy', async () => {
    const pool = new ProviderPool('soroban', ['primary', 'backup'], 1, 1000, async () => 100);
    const operation = vi.fn().mockResolvedValue('ok');
    expect(await pool.call(operation)).toBe('ok');
    expect(operation).toHaveBeenCalledWith('primary');
  });

  it('fails over when primary fails and keeps using backup', async () => {
    const pool = new ProviderPool('soroban', ['primary', 'backup'], 1, 1000, async () => 100);
    const operation = vi.fn(async (url: string) => {
      if (url === 'primary') throw new Error('outage');
      return 'ok';
    });
    expect(await pool.call(operation)).toBe('ok');
    operation.mockClear();
    expect(await pool.call(operation)).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledWith('backup');
  });

  it('returns to the primary after a successful recovery probe', async () => {
    let recover = false;
    const pool = new ProviderPool('horizon', ['primary', 'backup'], 1, 0,
      async (url) => url === 'primary' && !recover ? null : 100, 1);
    const operation = vi.fn(async (url: string) => {
      if (url === 'primary' && !recover) throw new Error('down');
      return url;
    });
    expect(await pool.call(operation)).toBe('backup');
    recover = true;
    await pool.checkHealth(Date.now() + 1000);
    expect(await pool.call(operation)).toBe('primary');
  });

  it('rejects when every provider fails', async () => {
    const pool = new ProviderPool('soroban', ['primary', 'backup'], 1, 1000, async () => 100);
    await expect(pool.call(async () => { throw new Error('all down'); })).rejects.toThrow('all down');
  });

  it('skips stale ledger providers', async () => {
    const pool = new ProviderPool('soroban', ['primary', 'backup'], 1, 1000,
      async (url) => url === 'primary' ? 100 : 90);
    await expect(pool.call(async () => { throw new Error('primary down'); })).rejects.toThrow();
  });
});
