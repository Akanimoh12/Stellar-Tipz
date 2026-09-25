import { prisma } from '@/db/prisma.js';
import { logger } from '@/common/utils/logger.js';
import { getQueue, getQueueConfigs } from './queue.factory.js';

export interface QueueDepthMetrics {
  queueName: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  oldestWaitingAge?: number;
}

export async function captureQueueMetrics(): Promise<void> {
  try {
    const configs = getQueueConfigs();

    for (const config of configs) {
      const queue = getQueue(config.name);
      if (!queue) {
        logger.warn({ queue: config.name }, 'Queue not initialized for metrics capture');
        continue;
      }

      const [waiting, active, delayed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getDelayedCount(),
        queue.getFailedCount(),
      ]);

      let oldestWaitingAge: number | undefined;
      if (waiting > 0) {
        const oldestJob = await queue.getOldestJob('wait');
        if (oldestJob) {
          oldestWaitingAge = Math.floor((Date.now() - oldestJob.timestamp) / 1000);
        }
      }

      await prisma.queueMetric.create({
        data: {
          queueName: config.name,
          waitingCount: waiting,
          activeCount: active,
          delayedCount: delayed,
          failedCount: failed,
          oldestWaitingAge,
        },
      });

      if (oldestWaitingAge && oldestWaitingAge > 300) {
        logger.warn(
          {
            queue: config.name,
            waiting,
            active,
            oldestWaitingAge,
          },
          'Queue depth alert: jobs waiting for >5 minutes'
        );
      }

      if (waiting > 100) {
        logger.warn(
          { queue: config.name, waiting },
          'Queue depth alert: >100 jobs waiting'
        );
      }
    }
  } catch (error) {
    logger.error({ error }, 'Failed to capture queue metrics');
  }
}

export async function getQueueHealthStatus(): Promise<QueueDepthMetrics[]> {
  const configs = getQueueConfigs();
  const metrics: QueueDepthMetrics[] = [];

  for (const config of configs) {
    const queue = getQueue(config.name);
    if (!queue) continue;

    const [waiting, active, delayed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount(),
      queue.getFailedCount(),
    ]);

    let oldestWaitingAge: number | undefined;
    if (waiting > 0) {
      const oldestJob = await queue.getOldestJob('wait');
      if (oldestJob) {
        oldestWaitingAge = Math.floor((Date.now() - oldestJob.timestamp) / 1000);
      }
    }

    metrics.push({
      queueName: config.name,
      waiting,
      active,
      delayed,
      failed,
      oldestWaitingAge,
    });
  }

  return metrics;
}

export async function getQueueMetricsHistory(
  queueName: string,
  hoursBack: number = 24
): Promise<any[]> {
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  return prisma.queueMetric.findMany({
    where: {
      queueName,
      createdAt: { gte: cutoffTime },
    },
    orderBy: { createdAt: 'asc' },
  });
}
