import { describe, expect, it, vi, beforeEach } from 'vitest';
import { scheduleRepeatable } from './scheduler.js';

describe('scheduleRepeatable', () => {
  const mockAdd = vi.fn();
  const mockGetRepeatableJobs = vi.fn();

  const queue = {
    name: 'test-queue',
    add: mockAdd,
    getRepeatableJobs: mockGetRepeatableJobs,
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a repeatable job when not already scheduled', async () => {
    mockGetRepeatableJobs.mockResolvedValue([]);

    await scheduleRepeatable({ queue, name: 'my-job', pattern: '*/5 * * * *' });

    expect(mockAdd).toHaveBeenCalledWith('my-job', {}, { repeat: { pattern: '*/5 * * * *' } });
  });

  it('skips if same name and pattern already exists', async () => {
    mockGetRepeatableJobs.mockResolvedValue([
      { name: 'my-job', pattern: '*/5 * * * *' },
    ]);

    await scheduleRepeatable({ queue, name: 'my-job', pattern: '*/5 * * * *' });

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('adds if same name exists with a different pattern', async () => {
    mockGetRepeatableJobs.mockResolvedValue([
      { name: 'my-job', pattern: '0 * * * *' },
    ]);

    await scheduleRepeatable({ queue, name: 'my-job', pattern: '*/5 * * * *' });

    expect(mockAdd).toHaveBeenCalledWith('my-job', {}, { repeat: { pattern: '*/5 * * * *' } });
  });

  it('adds if same pattern exists with a different name', async () => {
    mockGetRepeatableJobs.mockResolvedValue([
      { name: 'other-job', pattern: '*/5 * * * *' },
    ]);

    await scheduleRepeatable({ queue, name: 'my-job', pattern: '*/5 * * * *' });

    expect(mockAdd).toHaveBeenCalledWith('my-job', {}, { repeat: { pattern: '*/5 * * * *' } });
  });
});
