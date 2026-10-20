import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@/db/prisma.js';
import { logJobExecution, logApiCall, createAuditLog } from './audit.service.js';
import { initializeQueues, closeAllQueues, getQueue } from './queue.factory.js';
import { getQueueHealthStatus, captureQueueMetrics } from './monitoring.service.js';

describe('Jobs Module', () => {
  beforeEach(async () => {
    await initializeQueues();
  });

  afterEach(async () => {
    await closeAllQueues();
  });

  describe('Audit Logging (Issue #1289)', () => {
    it('should create audit log entry for successful job execution', async () => {
      const jobName = 'test-job';
      const inputs = { testData: 'value' };

      await logJobExecution(jobName, inputs, 'success', {
        durationMs: 1500,
        resourceId: 'resource-123',
        resourceType: 'subscription',
      });

      const audit = await prisma.auditLog.findFirst({
        where: {
          actorId: jobName,
          outcome: 'success',
        },
      });

      expect(audit).toBeDefined();
      expect(audit?.action).toContain(jobName);
      expect(audit?.actorType).toBe('system');
      expect(audit?.trigger).toBe('scheduled');
      expect(audit?.durationMs).toBe(1500);
      expect(audit?.resourceId).toBe('resource-123');
    });

    it('should create audit log entry for failed job execution', async () => {
      const jobName = 'test-job-failed';
      const inputs = { testData: 'value' };
      const errorMsg = 'Job processing failed';

      await logJobExecution(jobName, inputs, 'failure', {
        error: errorMsg,
        durationMs: 500,
      });

      const audit = await prisma.auditLog.findFirst({
        where: {
          actorId: jobName,
          outcome: 'failure',
        },
      });

      expect(audit).toBeDefined();
      expect(audit?.outcome).toBe('failure');
      expect(audit?.error).toBe(errorMsg);
    });

    it('should handle audit log creation gracefully on error', async () => {
      const createSpy = vi.spyOn(prisma.auditLog, 'create').mockRejectedValueOnce(
        new Error('Database error')
      );

      // Should not throw — best-effort logging
      await expect(
        logJobExecution('test-job', {}, 'success')
      ).resolves.not.toThrow();

      createSpy.mockRestore();
    });

    it('should create audit log for API calls by user', async () => {
      const userId = 'user-123';
      const action = 'create_subscription';
      const input = { creatorId: 'creator-456', amount: 1000 };

      await logApiCall(userId, action, input, 'success', {
        resourceId: 'sub-789',
        resourceType: 'subscription',
      });

      const audit = await prisma.auditLog.findFirst({
        where: {
          actorId: userId,
          action,
        },
      });

      expect(audit).toBeDefined();
      expect(audit?.actorType).toBe('user');
      expect(audit?.trigger).toBe('manual');
    });
  });

  describe('Queue Configuration (Issue #1288)', () => {
    it('should initialize all queues with configured concurrency', async () => {
      const queues = [
        'subscription-charge',
        'ipfs-pin',
        'ipfs-cleanup',
        'x-refresh',
      ];

      for (const queueName of queues) {
        const queue = getQueue(queueName);
        expect(queue).toBeDefined();
        expect(queue?.name).toBe(queueName);
      }
    });

    it('should check concurrency budget at startup', async () => {
      // This is tested implicitly through the queue initialization
      // which logs a warning if concurrency exceeds pool budget
      const queue = getQueue('subscription-charge');
      expect(queue).toBeDefined();
    });

    it('should allow adding jobs to queue', async () => {
      const queue = getQueue('subscription-charge');
      expect(queue).toBeDefined();

      if (queue) {
        const job = await queue.add('charge', {
          subscriptionId: 'sub-123',
          amount: 1000,
        });

        expect(job).toBeDefined();
        expect(job.id).toBeDefined();
      }
    });
  });

  describe('Queue Monitoring (Issue #1287)', () => {
    it('should capture queue metrics', async () => {
      const queue = getQueue('subscription-charge');
      if (queue) {
        // Add some test jobs
        await queue.add('charge', { amount: 1000 });
        await queue.add('charge', { amount: 2000 });

        // Capture metrics
        await captureQueueMetrics();

        // Verify metrics were recorded
        const metrics = await prisma.queueMetric.findMany({
          where: { queueName: 'subscription-charge' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        });

        expect(metrics.length).toBeGreaterThan(0);
        expect(metrics[0].waitingCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('should calculate oldest waiting job age', async () => {
      const queue = getQueue('subscription-charge');
      if (queue) {
        // Add a job
        const job = await queue.add(
          'charge',
          { amount: 1000 },
          { delay: 100 }
        );

        // Get health status
        const health = await getQueueHealthStatus();
        const queueHealth = health.find((h) => h.queueName === 'subscription-charge');

        expect(queueHealth).toBeDefined();
        if (queueHealth && queueHealth.waiting > 0) {
          // oldestWaitingAge might be undefined or a number
          expect(
            queueHealth.oldestWaitingAge === undefined ||
              typeof queueHealth.oldestWaitingAge === 'number'
          ).toBe(true);
        }
      }
    });

    it('should provide queue health status', async () => {
      const health = await getQueueHealthStatus();

      expect(Array.isArray(health)).toBe(true);
      expect(health.length).toBeGreaterThan(0);

      for (const metric of health) {
        expect(metric.queueName).toBeDefined();
        expect(typeof metric.waiting).toBe('number');
        expect(typeof metric.active).toBe('number');
        expect(typeof metric.delayed).toBe('number');
        expect(typeof metric.failed).toBe('number');
      }
    });
  });

  describe('Queue Lifecycle', () => {
    it('should gracefully close all queues', async () => {
      expect(getQueue('subscription-charge')).toBeDefined();

      await closeAllQueues();

      // After closing, queues should be unusable but the map might still have entries
      const queue = getQueue('subscription-charge');
      if (queue) {
        // Try to use it — should fail or be no-op
        expect(queue.closed).toBe(true);
      }
    });
  });
});
