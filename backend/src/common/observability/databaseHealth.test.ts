import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db/prisma.js', () => ({ prisma: { $queryRaw: query } }));
vi.mock('../utils/logger.js', () => ({logger:{warn:vi.fn()}}));
import { collectDatabaseHealth } from './databaseHealth.js';
import { registry } from './prometheus.js';
describe('database health #1369', () => {
  beforeEach(() => {query.mockReset(); registry.resetMetrics();});
  it('measures pool-related connections, locks, table bloat and vacuum age', async () => {
    query.mockResolvedValueOnce([{state:'active',count:3n}])
      .mockResolvedValueOnce([{count:2n}])
      .mockResolvedValueOnce([{table_name:'Tip',size:2048n,indexes:256n,live:8n,dead:2n,last_vacuum:new Date('2026-10-18T00:00:00Z')}])
      .mockResolvedValueOnce([{bytes:64n}])
      .mockResolvedValueOnce([{seconds:1.5}]);
    expect(await collectDatabaseHealth(new Date('2026-10-19T00:00:00Z'))).toBe(true);
    const body=await registry.metrics();
    expect(body).toContain('tipz_db_connections{state="active"} 3');
    expect(body).toContain('tipz_db_dead_tuple_ratio{table="Tip"} 0.2');
    expect(body).toContain('tipz_db_monitor_collection_success 1');
  });
  it('marks unavailable DB samples', async () => {
    query.mockRejectedValue(new Error('unreachable'));
    expect(await collectDatabaseHealth()).toBe(false);
    expect(await registry.metrics()).toContain('tipz_db_monitor_collection_success 0');
  });
});
