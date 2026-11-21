import { Worker } from 'bullmq';
import { bullConnection } from '../db/redis.js';
import { logger } from '../common/utils/logger.js';
import { attachDeadLetterHandler } from './deadLetter.js';
import { scheduleRepeatable } from './scheduler.js';
import { runDailyFinancialReconciliation } from '../modules/reconciliation/financialReconciliation.js';
import { FINANCIAL_RECONCILIATION_QUEUE, getFinancialReconciliationQueue } from './financialReconciliation.queue.js';

export function createFinancialReconciliationWorker(): Worker {
  const worker = new Worker(FINANCIAL_RECONCILIATION_QUEUE, async () => {
    // Reconcile the previous full UTC day after the indexer has had a grace period.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const report = await runDailyFinancialReconciliation(yesterday);
    if (report.status !== 'reconciled') {
      logger.error({ day: yesterday, status: report.status, discrepancies: report.discrepancies.length }, 'Financial report requires review');
    }
  }, { connection: bullConnection });
  worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id }, 'Financial reconciliation job failed'));
  attachDeadLetterHandler(worker, FINANCIAL_RECONCILIATION_QUEUE);
  return worker;
}

export async function scheduleFinancialReconciliation(): Promise<void> {
  await scheduleRepeatable({ queue: getFinancialReconciliationQueue(), name: 'daily', pattern: '30 1 * * *' });
}
