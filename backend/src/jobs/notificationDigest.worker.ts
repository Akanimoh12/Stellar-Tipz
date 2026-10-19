import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { redis } from '../db/redis.js';
import { registerClosable } from '../common/utils/lifecycle.js';
import { logger } from '../common/utils/logger.js';
import { flushNotificationBatches } from '../modules/notifications/batching.js';
import { attachDeadLetterHandler } from './deadLetter.js';

/** Start a restart-safe digest sweep; the database owns pending batch state. */
export async function startNotificationDigests(): Promise<void> {
  const connection = redis as unknown as ConnectionOptions;
  const queue = new Queue('notification-digest', { connection });
  const worker = new Worker('notification-digest', () => flushNotificationBatches(), { connection });
  worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id }, 'Digest sweep failed'));
  attachDeadLetterHandler(worker, 'notification-digest');
  registerClosable({
    name: 'Notification digests',
    close: async () => {
      await worker.close();
      await queue.close();
    },
  });
  await queue.add(
    'flush',
    {},
    { repeat: { every: 10_000 }, removeOnComplete: 10, removeOnFail: 100 },
  );
}
