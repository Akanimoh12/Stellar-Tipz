import { Worker } from 'bullmq';
import { bullConnection } from '../db/redis.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { reconcileTreasury } from '../modules/treasury/treasury.service.js';
import { attachDeadLetterHandler } from './deadLetter.js';
import { getTreasuryMonitorQueue, TREASURY_MONITOR_QUEUE } from './treasuryMonitor.queue.js';
import { scheduleRepeatable } from './scheduler.js';
export function createTreasuryMonitorWorker(): Worker {
  const worker = new Worker(TREASURY_MONITOR_QUEUE, () => reconcileTreasury(), { connection: bullConnection });
  worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id }, 'Treasury monitor job failed'));
  attachDeadLetterHandler(worker, TREASURY_MONITOR_QUEUE); return worker;
}
export async function scheduleTreasuryMonitor(): Promise<void> { await scheduleRepeatable({ queue: getTreasuryMonitorQueue(), name: 'reconcile', pattern: config.treasury.monitorCron }); }
