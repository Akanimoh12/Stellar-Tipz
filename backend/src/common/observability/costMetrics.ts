import { createCounter, createGauge } from './prometheus.js';
import { env } from '../../config/env.js';

export type CostService = 'ipfs' | 'soroban_rpc' | 'horizon';
const allowed = new Set<CostService>(['ipfs', 'soroban_rpc', 'horizon']);
const calls = createCounter({
  name: 'paid_service_requests_total',
  help: 'Paid service requests by service and result',
  labelNames: ['service', 'result'] as const,
});
const estimates = createCounter({
  name: 'estimated_variable_cost_usd_total',
  help: 'Estimated variable USD spend, not authoritative invoiced cost',
  labelNames: ['service'] as const,
});
const prices = createGauge({
  name: 'paid_service_unit_price_usd',
  help: 'Configured estimate per request in USD',
  labelNames: ['service'] as const,
});

export function recordPaidServiceCall(service: CostService, success: boolean, estimatedUsd?: number): void {
  const configured = { ipfs: env.COST_IPFS_REQUEST_USD, soroban_rpc: env.COST_SOROBAN_RPC_REQUEST_USD, horizon: env.COST_HORIZON_REQUEST_USD };
  const unitUsd = estimatedUsd ?? configured[service];
  if (!allowed.has(service) || !Number.isFinite(unitUsd) || unitUsd < 0)
    throw new Error('Invalid cost input');
  calls.inc({ service, result: success ? 'success' : 'failure' });
  prices.set({ service }, unitUsd);
  if (unitUsd > 0) estimates.inc({ service }, unitUsd);
}

export function costRatios(usd: number, activeUsers: number, tips: number) {
  if (![usd, activeUsers, tips].every(Number.isFinite) || usd < 0 || activeUsers < 0 || tips < 0)
    throw new Error('Invalid cost ratio input');
  return { perActiveUserUsd: activeUsers ? usd / activeUsers : null, perTipUsd: tips ? usd / tips : null };
}
