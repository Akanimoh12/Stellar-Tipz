import type { Queue } from 'bullmq';
import { z } from 'zod';
import { ConflictError, BadRequestError } from '../../common/errors/AppError.js';
import { createAuditLog } from '../jobs/audit.service.js';
import {
  getCreditRecomputeQueue,
  getAnalyticsDailyQueue,
  getSubscriptionChargeQueue,
  getLeaderboardSnapshotQueue,
  getXMetricsRefreshQueue,
  getDiscoveryQueue,
  getPlatformStatsQueue,
  getPayoutQueue,
  getAuthChallengeCleanupQueue,
  getRetentionQueue,
} from '../../jobs/index.js';

export const MANUAL_JOB_NAMES = [
  'credit-recompute',
  'analytics-daily',
  'subscription-charge',
  'leaderboard-snapshot',
  'x-metrics-refresh',
  'discovery',
  'platform-stats',
  'payout',
  'auth-challenge-cleanup',
  'retention',
] as const;

export type ManualJobName = (typeof MANUAL_JOB_NAMES)[number];

interface ManualJobDefinition {
  queue: () => Queue;
  jobName: string;
}

const analyticsDailyParamsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD').optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.date) return;
  const parsed = new Date(`${value.date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['date'], message: 'date must be a valid calendar date' });
  }
});
const emptyParamsSchema = z.object({}).strict();

const JOB_PARAM_SCHEMAS: Record<ManualJobName, z.ZodType<Record<string, unknown>>> = {
  'credit-recompute': emptyParamsSchema,
  'analytics-daily': analyticsDailyParamsSchema,
  'subscription-charge': emptyParamsSchema,
  'leaderboard-snapshot': emptyParamsSchema,
  'x-metrics-refresh': emptyParamsSchema,
  discovery: emptyParamsSchema,
  'platform-stats': emptyParamsSchema,
  payout: emptyParamsSchema,
  'auth-challenge-cleanup': emptyParamsSchema,
  retention: emptyParamsSchema,
};

export function validateManualJobParams(
  name: ManualJobName,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const result = JOB_PARAM_SCHEMAS[name].safeParse(params);
  if (!result.success) {
    throw new BadRequestError('Invalid manual job parameters', result.error.issues);
  }
  return result.data;
}

const JOBS: Record<ManualJobName, ManualJobDefinition> = {
  'credit-recompute': { queue: getCreditRecomputeQueue, jobName: 'recompute' },
  'analytics-daily': { queue: getAnalyticsDailyQueue, jobName: 'rollup' },
  'subscription-charge': { queue: getSubscriptionChargeQueue, jobName: 'charge' },
  'leaderboard-snapshot': { queue: getLeaderboardSnapshotQueue, jobName: 'snapshot' },
  'x-metrics-refresh': { queue: getXMetricsRefreshQueue, jobName: 'refresh' },
  discovery: { queue: getDiscoveryQueue, jobName: 'refresh' },
  'platform-stats': { queue: getPlatformStatsQueue, jobName: 'refresh' },
  payout: { queue: getPayoutQueue, jobName: 'sweep' },
  'auth-challenge-cleanup': { queue: getAuthChallengeCleanupQueue, jobName: 'cleanup' },
  retention: { queue: getRetentionQueue, jobName: 'prune' },
};

export interface ManualJobTriggerResult {
  queue: string;
  jobName: string;
  jobId: string;
}

/**
 * Shared overlap guard for manual triggers. Scheduled and manual runs use the
 * same queue/job name, so active/waiting work is treated as the lock.
 */
export async function enqueueManualJob(
  queue: Queue,
  jobName: string,
  data: Record<string, unknown>,
): Promise<ManualJobTriggerResult> {
  const inFlight = await queue.getJobs(['active', 'waiting'], 0, 100, false);
  if (inFlight.some((job) => job.name === jobName)) {
    throw new ConflictError(`Job ${queue.name}/${jobName} is already running or queued`);
  }

  const lockId = `manual:${queue.name}:${jobName}`;
  const existing = await queue.getJob(lockId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'active' || state === 'waiting') {
      throw new ConflictError(`Job ${queue.name}/${jobName} is already running or queued`);
    }
    await existing.remove().catch(() => undefined);
  }

  const job = await queue.add(jobName, data, {
    jobId: lockId,
    removeOnComplete: true,
    removeOnFail: true,
  });

  return { queue: queue.name, jobName, jobId: String(job.id) };
}

export async function triggerManualJob(
  name: ManualJobName,
  actorId: string,
  params: Record<string, unknown> = {},
): Promise<ManualJobTriggerResult> {
  const definition = JOBS[name];
  if (!definition) throw new BadRequestError('Unknown scheduled job');
  const validatedParams = validateManualJobParams(name, params);

  const startedAt = Date.now();
  try {
    const result = await enqueueManualJob(definition.queue(), definition.jobName, validatedParams);
    await createAuditLog({
      action: `job_execution:${name}`,
      actorType: 'user',
      actorId,
      trigger: 'manual',
      input: params,
      outcome: 'success',
      durationMs: Date.now() - startedAt,
      resourceId: result.jobId,
      resourceType: 'job',
    });
    return result;
  } catch (error) {
    await createAuditLog({
      action: `job_execution:${name}`,
      actorType: 'user',
      actorId,
      trigger: 'manual',
      input: params,
      outcome: 'failure',
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
      resourceType: 'job',
    });
    throw error;
  }
}
