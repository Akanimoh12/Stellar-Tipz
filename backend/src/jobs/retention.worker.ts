import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { prisma, prismaIncludingDeleted } from '../db/prisma.js';
import { redis } from '../db/redis.js';
import { recordRetentionPruned } from '../common/observability/metrics.js';
import { logger } from '../common/utils/logger.js';
import { attachDeadLetterHandler } from './deadLetter.js';
import { getRetentionQueue, RETENTION_QUEUE } from './retention.queue.js';
import { scheduleRepeatable } from './scheduler.js';

export const RETENTION_DAYS = {
  notification: 90,
  authChallenge: 1,
  webhookDelivery: 90,
  analyticsDaily: 730,
  eventLog: 365,
} as const;

export interface RetentionRunResult {
  pruned: Record<string, number>;
  archivedEventLogs: number;
}

function cutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function deleteInBatches<T extends { id: string }>(
  model: { findMany: Function; deleteMany: Function },
  where: Record<string, unknown>,
  batchSize: number,
): Promise<number> {
  let total = 0;
  while (true) {
    const rows = (await model.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    })) as T[];
    if (rows.length === 0) return total;

    const result = await model.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    total += result.count;
    if (rows.length < batchSize) return total;
  }
}

async function archiveAndDeleteEventLogs(olderThan: Date, batchSize: number): Promise<number> {
  let total = 0;
  while (true) {
    const rows = await prisma.eventLog.findMany({
      where: { createdAt: { lt: olderThan } },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    if (rows.length === 0) return total;

    await prisma.$transaction(async (tx) => {
      await tx.eventLogArchive.createMany({
        data: rows.map((row) => ({
          sourceId: row.id,
          topic: row.topic,
          ledger: row.ledger,
          txHash: row.txHash,
          data: row.data,
          createdAt: row.createdAt,
        })),
        skipDuplicates: true,
      });
      await tx.eventLog.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    });
    total += rows.length;
    if (rows.length < batchSize) return total;
  }
}

export async function runRetentionPrune(
  now = new Date(),
  batchSize = config.retention.batchSize,
): Promise<RetentionRunResult> {
  const pruned: Record<string, number> = {};
  const jobs = [
    ['Notification', prismaIncludingDeleted.notification, { createdAt: { lt: cutoff(now, RETENTION_DAYS.notification) } }],
    ['AuthChallenge', prisma.authChallenge, { expiresAt: { lt: now } }],
    ['WebhookDelivery', prisma.webhookDelivery, { createdAt: { lt: cutoff(now, RETENTION_DAYS.webhookDelivery) } }],
    ['AnalyticsDaily', prisma.analyticsDaily, { date: { lt: cutoff(now, RETENTION_DAYS.analyticsDaily) } }],
  ] as const;

  for (const [name, model, where] of jobs) {
    const count = await deleteInBatches(model, where, batchSize);
    pruned[name] = count;
    recordRetentionPruned(name, count);
  }

  const archivedEventLogs = await archiveAndDeleteEventLogs(cutoff(now, RETENTION_DAYS.eventLog), batchSize);
  pruned.EventLog = archivedEventLogs;
  recordRetentionPruned('EventLog', archivedEventLogs);

  return { pruned, archivedEventLogs };
}

export function createRetentionWorker(): Worker {
  const worker = new Worker(
    RETENTION_QUEUE,
    async () => {
      const result = await runRetentionPrune();
      logger.info(result, 'Data retention prune complete');
    },
    { connection: redis as any },
  );
  worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id }, 'Data retention job failed'));
  attachDeadLetterHandler(worker, RETENTION_QUEUE);
  return worker;
}

export async function scheduleRetentionPrune(): Promise<void> {
  await scheduleRepeatable({
    queue: getRetentionQueue(),
    name: 'prune',
    pattern: config.retention.pruneCron,
  });
}