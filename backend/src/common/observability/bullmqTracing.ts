import { Queue, Job, Worker } from 'bullmq';
import { context, propagation, trace, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';
import { SEMATTRS_MESSAGING_SYSTEM, SEMATTRS_MESSAGING_DESTINATION, SEMATTRS_MESSAGING_OPERATION, SEMATTRS_MESSAGING_MESSAGE_ID } from '@opentelemetry/semantic-conventions';
import { getTracer, extractContext, injectContext, createTraceCarrier, withSpan, isTracingActive, getTraceId } from './tracing.js';

const BULLMQ_SYSTEM = 'bullmq';

/**
 * Type for traced add function
 */
export type TracedAddFn<T extends Record<string, unknown>> = (
  name: string,
  data: T,
  opts?: any,
) => Promise<Job<T>>;

/**
 * Type for traced addBulk function
 */
export type TracedAddBulkFn<T extends Record<string, unknown>> = (
  jobs: Array<{ name: string; data: T; opts?: any }>,
) => Promise<Job<T>[]>;

/**
 * Trace context key for storing in job data
 */
export const TRACE_CONTEXT_KEY = '__otel_trace_context';

/**
 * Injects the current trace context into a job payload.
 * Call this before adding a job to a queue to propagate traces across the queue boundary.
 */
export function injectTraceContextIntoJob<T extends Record<string, unknown>>(jobData: T): T {
  if (!isTracingActive()) {
    return jobData;
  }

  const carrier = createTraceCarrier();
  return {
    ...jobData,
    [TRACE_CONTEXT_KEY]: carrier,
  } as T & { [TRACE_CONTEXT_KEY]: Record<string, string> };
}

/**
 * Extracts trace context from a job payload and returns a context object.
 * Call this at the start of a job processor to continue the trace.
 */
export function extractTraceContextFromJob(job: Job): context.Context {
  const carrier = (job.data as Record<string, unknown>)?.[TRACE_CONTEXT_KEY] as Record<string, string> | undefined;
  if (!carrier) {
    return context.active();
  }
  return extractContext(carrier);
}

/**
 * Creates a span for a job processing operation.
 * Extracts trace context from the job and creates a child span.
 */
export async function withJobSpan<T>(
  queueName: string,
  job: Job,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  if (!isTracingActive()) {
    // Create a minimal span-like object for non-tracing environments
    return fn({} as Span);
  }

  const tracer = getTracer();
  if (!tracer) {
    return fn({} as Span);
  }

  // Extract parent context from job
  const parentContext = extractTraceContextFromJob(job);

  return context.with(parentContext, async () => {
    const span = tracer.startSpan(`queue.process.${queueName}`, {
      attributes: {
        [SEMATTRS_MESSAGING_SYSTEM]: BULLMQ_SYSTEM,
        [SEMATTRS_MESSAGING_DESTINATION]: queueName,
        [SEMATTRS_MESSAGING_OPERATION]: 'process',
        [SEMATTRS_MESSAGING_MESSAGE_ID]: job.id ?? 'unknown',
        'job.name': job.name,
        'job.attemptsMade': job.attemptsMade,
      },
    }, parentContext);

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Wraps a job processor function with tracing.
 * Usage: worker = new Worker(queueName, withTracing(processor), options)
 */
export function withTracing<T extends Job>(
  queueName: string,
  processor: (job: T) => Promise<void>,
): (job: T) => Promise<void> {
  return async (job: T) => {
    await withJobSpan(queueName, job, async () => {
      await processor(job);
    });
  };
}

/**
 * Creates a traced version of Queue.add that injects trace context.
 */
export function createTracedAdd<T extends Record<string, unknown>>(
  queue: Queue,
): (name: string, data: T, opts?: any) => Promise<Job<T>> {
  return async (name: string, data: T, opts?: any) => {
    const tracedData = injectTraceContextIntoJob(data);
    return queue.add(name, tracedData, opts);
  };
}

/**
 * Creates a traced version of Queue.addBulk that injects trace context into each job.
 */
export function createTracedAddBulk<T extends Record<string, unknown>>(
  queue: Queue,
): (jobs: Array<{ name: string; data: T; opts?: any }>) => Promise<Job<T>[]> {
  return async (jobs) => {
    const tracedJobs = jobs.map((j) => ({
      ...j,
      data: injectTraceContextIntoJob(j.data),
    }));
    return queue.addBulk(tracedJobs);
  };
}

/**
 * Adds trace context to a job being added via the Queue API.
 * Convenience function for one-off job additions.
 */
export async function addJobWithTrace<T extends Record<string, unknown>>(
  queue: Queue,
  name: string,
  data: T,
  opts?: any,
): Promise<Job<T>> {
  const tracedData = injectTraceContextIntoJob(data);
  return queue.add(name, tracedData, opts);
}

/**
 * Gets the current trace ID for inclusion in job metadata/logs.
 */
export function getCurrentTraceIdForJob(): string | undefined {
  return getTraceId();
}