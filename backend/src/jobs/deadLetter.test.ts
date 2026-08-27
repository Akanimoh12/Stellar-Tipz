import { describe, expect, it, vi, beforeEach } from 'vitest';
import { recordDeadLetter, attachDeadLetterHandler, listDeadLetterJobs } from './deadLetter.js';

const { mockCreate, mockFindMany } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    deadLetterJob: {
      create: mockCreate,
      findMany: mockFindMany,
    },
  },
}));

vi.mock('../common/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe('recordDeadLetter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists the job under the given queue', async () => {
    const job = { id: 'job-1', name: 'refresh', data: { handle: 'a' }, attemptsMade: 5 } as any;

    await recordDeadLetter('x-metrics-refresh', job, new Error('boom'));

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        queue: 'x-metrics-refresh',
        jobId: 'job-1',
        jobName: 'refresh',
        data: { handle: 'a' },
        failedReason: 'boom',
        attemptsMade: 5,
      },
    });
  });
});

describe('attachDeadLetterHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({});
  });

  it('records the job once attempts are exhausted', async () => {
    let failedHandler: ((job: any, err: Error) => void) | undefined;
    const worker = {
      on: vi.fn((event: string, handler: any) => {
        if (event === 'failed') failedHandler = handler;
      }),
    } as any;

    attachDeadLetterHandler(worker, 'x-metrics-refresh');

    const job = { id: 'job-1', name: 'refresh', data: {}, attemptsMade: 3, opts: { attempts: 3 } };
    failedHandler?.(job, new Error('boom'));
    await Promise.resolve();
    await Promise.resolve();

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('does not record the job while retries remain', async () => {
    let failedHandler: ((job: any, err: Error) => void) | undefined;
    const worker = {
      on: vi.fn((event: string, handler: any) => {
        if (event === 'failed') failedHandler = handler;
      }),
    } as any;

    attachDeadLetterHandler(worker, 'x-metrics-refresh');

    const job = { id: 'job-1', name: 'refresh', data: {}, attemptsMade: 1, opts: { attempts: 3 } };
    failedHandler?.(job, new Error('boom'));
    await Promise.resolve();

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('ignores failures with no job instance', () => {
    let failedHandler: ((job: any, err: Error) => void) | undefined;
    const worker = {
      on: vi.fn((event: string, handler: any) => {
        if (event === 'failed') failedHandler = handler;
      }),
    } as any;

    attachDeadLetterHandler(worker, 'x-metrics-refresh');

    expect(() => failedHandler?.(undefined, new Error('boom'))).not.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('listDeadLetterJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists jobs ordered by most recent failure, optionally filtered by queue', async () => {
    mockFindMany.mockResolvedValue([]);

    await listDeadLetterJobs({ queue: 'x-metrics-refresh', limit: 10 });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { queue: 'x-metrics-refresh' },
      orderBy: { failedAt: 'desc' },
      take: 10,
    });
  });

  it('defaults to no queue filter and a limit of 50', async () => {
    mockFindMany.mockResolvedValue([]);

    await listDeadLetterJobs();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { failedAt: 'desc' },
      take: 50,
    });
  });
});
