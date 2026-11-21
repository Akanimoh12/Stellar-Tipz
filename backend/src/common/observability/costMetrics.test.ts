import { beforeEach, describe, expect, it } from 'vitest';
import { recordPaidServiceCall, costRatios } from './costMetrics.js';
import { registry } from './prometheus.js';
describe('cost observability #1368', () => {
  beforeEach(() => registry.resetMetrics());
  it('meters request volume and estimated spend', async () => {
    recordPaidServiceCall('ipfs', true, 0.02);
    recordPaidServiceCall('ipfs', false, 0.02);
    const metrics = await registry.metrics();
    expect(metrics).toContain('tipz_estimated_variable_cost_usd_total{service="ipfs"} 0.04');
    expect(metrics).toContain('tipz_paid_service_requests_total{service="ipfs",result="failure"} 1');
  });
  it('refuses invalid prices and protects zero denominators', () => {
    expect(() => recordPaidServiceCall('ipfs', true, -1)).toThrow();
    expect(costRatios(10, 0, 2)).toEqual({ perActiveUserUsd: null, perTipUsd: 5 });
  });
});
