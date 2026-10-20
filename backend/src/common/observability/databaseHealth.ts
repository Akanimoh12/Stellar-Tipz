import { prisma } from '../../db/prisma.js';
import { createGauge } from './prometheus.js';
import { logger } from '../utils/logger.js';

const connections = createGauge({ name:'db_connections',help:'Database-wide sessions by state',labelNames:['state'] as const });
const locks = createGauge({ name:'db_lock_waiting_sessions',help:'Sessions blocked on locks' });
const tableBytes = createGauge({ name:'db_table_bytes',help:'Total table bytes',labelNames:['table'] as const });
const indexBytes = createGauge({ name:'db_index_bytes',help:'Index bytes',labelNames:['table'] as const });
const bloat = createGauge({ name:'db_dead_tuple_ratio',help:'Estimated dead tuple ratio',labelNames:['table'] as const });
const vacuum = createGauge({ name:'db_last_vacuum_age_seconds',help:'Seconds since last vacuum; -1 if unknown',labelNames:['table'] as const });
const unused = createGauge({ name:'db_unused_index_bytes',help:'Unused non-unique, non-PK index bytes (since stats reset)' });
const success = createGauge({ name:'db_monitor_collection_success',help:'Latest PostgreSQL statistics sampling success' });
const topQuery = createGauge({ name:'db_top_query_total_exec_seconds',help:'Top pg_stat_statements cumulative execution seconds, ranked without SQL text',labelNames:['rank'] as const });
type Sessions = {state:string; count:bigint};
type Tables = {table_name:string; size:bigint; indexes:bigint; live:bigint; dead:bigint; last_vacuum:Date|null};
export async function collectDatabaseHealth(now = new Date()): Promise<boolean> {
  try {
    const [states, waiters, tables, unusedIndexes] = await Promise.all([
      prisma.$queryRaw<Sessions[]>`SELECT COALESCE(state, 'unknown') AS state, COUNT(*)::bigint AS count FROM pg_stat_activity WHERE datname=current_database() GROUP BY COALESCE(state, 'unknown')`,
      prisma.$queryRaw<Array<{count:bigint}>>`SELECT COUNT(*)::bigint AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`,
      prisma.$queryRaw<Tables[]>`SELECT relname AS table_name, pg_total_relation_size(relid)::bigint AS size, pg_indexes_size(relid)::bigint AS indexes, n_live_tup::bigint AS live, n_dead_tup::bigint AS dead, GREATEST(last_vacuum,last_autovacuum) AS last_vacuum FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 50`,
      prisma.$queryRaw<Array<{bytes:bigint}>>`SELECT COALESCE(SUM(pg_relation_size(s.indexrelid)),0)::bigint AS bytes FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid=s.indexrelid WHERE s.idx_scan=0 AND NOT i.indisprimary AND NOT i.indisunique`,
    ]);
    connections.reset();
    for (const row of states) connections.set({state:['active','idle','idle in transaction'].includes(row.state) ? row.state : 'other'}, Number(row.count));
    locks.set(Number(waiters[0]?.count ?? 0));
    tableBytes.reset(); indexBytes.reset(); bloat.reset(); vacuum.reset();
    for (const row of tables) {
      const labels={table:row.table_name};
      tableBytes.set(labels,Number(row.size)); indexBytes.set(labels,Number(row.indexes));
      const live=Number(row.live), dead=Number(row.dead);
      bloat.set(labels,live+dead ? dead/(live+dead) : 0);
      vacuum.set(labels,row.last_vacuum ? Math.max(0,(now.getTime()-new Date(row.last_vacuum).getTime())/1000) : -1);
    }
    unused.set(Number(unusedIndexes[0]?.bytes ?? 0));
    success.set(1);
    try {
      const rows=await prisma.$queryRaw<Array<{seconds:number}>>`SELECT total_exec_time/1000.0 AS seconds FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 5`;
      topQuery.reset(); rows.forEach((row,i)=>topQuery.set({rank:String(i+1)},Number(row.seconds)));
    } catch { /* extension may be unavailable; DB basics still collected */ }
    return true;
  } catch (error) {
    success.set(0);
    logger.warn({error},'Database stats collection failed');
    return false;
  }
}
