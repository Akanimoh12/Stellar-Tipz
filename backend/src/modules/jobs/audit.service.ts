import { prisma } from '@/db/prisma.js';
import { logger } from '@/common/utils/logger.js';

export interface AuditLogInput {
  action: string;
  actorType: 'user' | 'system';
  actorId: string;
  trigger?: 'manual' | 'scheduled' | 'triggered';
  input: Record<string, any>;
  outcome: 'success' | 'failure';
  error?: string | null;
  durationMs?: number;
  resourceId?: string;
  resourceType?: string;
}

export async function createAuditLog(data: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: data.action,
        actorType: data.actorType,
        actorId: data.actorId,
        trigger: data.trigger || 'manual',
        input: data.input,
        outcome: data.outcome,
        error: data.error || null,
        durationMs: data.durationMs,
        resourceId: data.resourceId,
        resourceType: data.resourceType,
      },
    });
  } catch (error) {
    logger.error(
      {
        error,
        action: data.action,
        actor: `${data.actorType}:${data.actorId}`,
      },
      'Failed to write audit log (best-effort, continuing)'
    );
  }
}

export async function logJobExecution(
  jobName: string,
  inputs: Record<string, any>,
  outcome: 'success' | 'failure',
  options?: {
    error?: string;
    durationMs?: number;
    resourceId?: string;
    resourceType?: string;
  }
): Promise<void> {
  await createAuditLog({
    action: `job_execution:${jobName}`,
    actorType: 'system',
    actorId: jobName,
    trigger: 'scheduled',
    input: inputs,
    outcome,
    error: options?.error,
    durationMs: options?.durationMs,
    resourceId: options?.resourceId,
    resourceType: options?.resourceType,
  });
}

export async function logApiCall(
  userId: string,
  action: string,
  input: Record<string, any>,
  outcome: 'success' | 'failure',
  options?: {
    error?: string;
    resourceId?: string;
    resourceType?: string;
  }
): Promise<void> {
  await createAuditLog({
    action,
    actorType: 'user',
    actorId: userId,
    trigger: 'manual',
    input,
    outcome,
    error: options?.error,
    resourceId: options?.resourceId,
    resourceType: options?.resourceType,
  });
}
