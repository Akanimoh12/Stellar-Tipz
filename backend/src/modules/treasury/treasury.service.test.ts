import { describe, expect, it, vi } from 'vitest';
import { reconcileTreasury } from './treasury.service.js';

const deps = (actual: bigint, prior: bigint | null, events: unknown[]) => ({
  events: vi.fn().mockResolvedValue(events.map((data) => ({ data }))),
  latest: vi.fn().mockResolvedValue(prior === null ? null : { actualBalanceStroops: prior }),
  getBalance: vi.fn().mockResolvedValue(actual),
  createSnapshot: vi.fn().mockResolvedValue({}),
});

describe('treasury reconciliation (#1359)', () => {
  it('computes expected balance from fee_collected events', async () => {
    const mock = deps(300n, null, [['withdrawal', 'GACTOR', '1000', '100'], ['refund', 'GACTOR', '500', '50']]);
    const result = await reconcileTreasury(mock, { address: 'GTEST', openingBalanceStroops: '0' });
    expect(result).toEqual({ status: 'mismatch', discrepancyStroops: 150n, unexpectedOutflowStroops: 0n });
  });
  it('alerts through the result status when the actual treasury balance decreases', async () => {
    const mock = deps(100n, 200n, []);
    await expect(reconcileTreasury(mock, { address: 'GTEST', openingBalanceStroops: '0' })).resolves.toMatchObject({ status: 'unexpected_outflow', unexpectedOutflowStroops: 100n });
    expect(mock.createSnapshot).toHaveBeenCalledWith(expect.objectContaining({ status: 'unexpected_outflow' }));
  });
});
