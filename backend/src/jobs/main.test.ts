import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockRegisterClosable, mockCloseAll, mockPrismaDisconnect, mockRedisQuit, mockScheduleRepeatable } = vi.hoisted(() => ({
  mockRegisterClosable: vi.fn(),
  mockCloseAll: vi.fn(),
  mockPrismaDisconnect: vi.fn(),
  mockRedisQuit: vi.fn(),
  mockScheduleRepeatable: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../common/utils/lifecycle.js', () => ({
  registerClosable: mockRegisterClosable,
  closeAll: mockCloseAll,
}));

vi.mock('../db/prisma.js', () => ({
  prisma: { $disconnect: mockPrismaDisconnect },
}));

vi.mock('../db/redis.js', () => ({
  redis: { quit: mockRedisQuit },
}));

vi.mock('../config/index.js', () => ({
  config: {
    credit: { recomputeCron: '0 */6 * * *' },
    analytics: { dailyCron: '5 0 * * *' },
  },
}));

vi.mock('./scheduler.js', () => ({
  scheduleRepeatable: mockScheduleRepeatable,
}));

vi.mock('../common/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerOn = vi.fn();

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    name: 'mock-queue',
    add: vi.fn(),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: mockWorkerClose,
    on: mockWorkerOn,
  })),
}));

describe('bootstrapJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkerClose.mockResolvedValue(undefined);
  });

  it('registers Prisma and Redis as closable resources', async () => {
    const { bootstrapJobs } = await import('./main.js');
    await bootstrapJobs();

    const closableNames = mockRegisterClosable.mock.calls.map((c: any[]) => c[0].name);
    expect(closableNames).toContain('Prisma');
    expect(closableNames).toContain('Redis');
  });

  it('registers credit and analytics workers as closable', async () => {
    const { bootstrapJobs } = await import('./main.js');
    await bootstrapJobs();

    const closableNames = mockRegisterClosable.mock.calls.map((c: any[]) => c[0].name);
    expect(closableNames).toContain('CreditRecomputeWorker');
    expect(closableNames).toContain('AnalyticsDailyWorker');
  });

  it('schedules both credit recompute and analytics daily jobs', async () => {
    const { bootstrapJobs } = await import('./main.js');
    await bootstrapJobs();

    expect(mockScheduleRepeatable).toHaveBeenCalledTimes(2);
  });
});
