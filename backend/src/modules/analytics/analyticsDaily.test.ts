import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getUtcDayBoundaries,
  computeDailyRollup,
  recomputeDaysForLateData,
  detectAndBackfillMissingDays,
  runCronDailyRollup,
} from './analyticsDaily.worker.js';

interface MockTipRecord {
  id: string;
  amountStroops: bigint;
  fromAddress: string;
  toAddress: string;
  senderId?: string;
  recipientId?: string;
  createdAt: Date;
  status: string;
}

interface MockDailyRecord {
  date?: Date;
  totalTips?: number;
  totalStroops?: bigint;
  uniqueTippers?: number;
  uniqueCreators?: number;
  activeUsers?: number;
}

describe('Analytics Daily Rollup Worker (#1264)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  let mockTipsDb: MockTipRecord[];
  let mockDailyDb: Map<string, MockDailyRecord>;

  beforeEach(() => {
    mockTipsDb = [];
    mockDailyDb = new Map();

    mockPrisma = {
      tip: {
        findMany: vi.fn().mockImplementation(async ({ where }: { where?: { createdAt?: { gte?: Date; lte?: Date }; status?: { not?: string } } }) => {
          return mockTipsDb.filter((tip) => {
            const createdAt = new Date(tip.createdAt).getTime();
            const gte = where?.createdAt?.gte ? new Date(where.createdAt.gte).getTime() : -Infinity;
            const lte = where?.createdAt?.lte ? new Date(where.createdAt.lte).getTime() : Infinity;
            const statusMatch = where?.status?.not ? tip.status !== where.status.not : true;
            return createdAt >= gte && createdAt <= lte && statusMatch;
          });
        }),
      },
      analyticsDaily: {
        upsert: vi.fn().mockImplementation(async ({ where, create, update }: { where: { date: Date }; create: MockDailyRecord; update: MockDailyRecord }) => {
          const key = new Date(where.date).toISOString();
          const existing = mockDailyDb.get(key);
          const data = existing ? { ...existing, ...update } : { ...create };
          mockDailyDb.set(key, data);
          return data;
        }),
        findMany: vi.fn().mockImplementation(async ({ where }: { where?: { date?: { gte?: Date; lte?: Date } } }) => {
          const gte = where?.date?.gte ? new Date(where.date.gte).getTime() : -Infinity;
          const lte = where?.date?.lte ? new Date(where.date.lte).getTime() : Infinity;
          const records: { date: Date }[] = [];
          for (const [k] of mockDailyDb.entries()) {
            const time = new Date(k).getTime();
            if (time >= gte && time <= lte) {
              records.push({ date: new Date(k) });
            }
          }
          return records;
        }),
      },
    };
  });

  describe('1. UTC Day Boundaries', () => {
    it('accurately resolves UTC boundaries regardless of local time', () => {
      const boundaries = getUtcDayBoundaries('2026-06-15T15:30:45.123+05:30');

      expect(boundaries.isoDateString).toBe('2026-06-15');
      expect(boundaries.startUtc.toISOString()).toBe('2026-06-15T00:00:00.000Z');
      expect(boundaries.endUtc.toISOString()).toBe('2026-06-15T23:59:59.999Z');
      expect(boundaries.midnightUtc.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    });

    it('handles leap years and month rollover boundaries in UTC', () => {
      const feb29 = getUtcDayBoundaries('2024-02-29T23:59:59.999Z');
      expect(feb29.isoDateString).toBe('2024-02-29');

      const dec31 = getUtcDayBoundaries('2025-12-31T23:59:59.999Z');
      expect(dec31.isoDateString).toBe('2025-12-31');
      expect(dec31.startUtc.toISOString()).toBe('2025-12-31T00:00:00.000Z');
    });
  });

  describe('2. Exact Day Boundary Tip Ingestion', () => {
    it('correctly includes tips at exact 00:00:00.000Z and 23:59:59.999Z', async () => {
      const targetDate = '2026-05-10';

      mockTipsDb.push(
        // Exactly at start of day
        {
          id: 'tip_start',
          amountStroops: 10000000n,
          fromAddress: 'G_ALICE',
          toAddress: 'G_BOB',
          createdAt: new Date('2026-05-10T00:00:00.000Z'),
          status: 'CONFIRMED',
        },
        // Midday tip
        {
          id: 'tip_mid',
          amountStroops: 20000000n,
          fromAddress: 'G_CHARLIE',
          toAddress: 'G_BOB',
          createdAt: new Date('2026-05-10T12:00:00.000Z'),
          status: 'CONFIRMED',
        },
        // Exactly at end of day
        {
          id: 'tip_end',
          amountStroops: 30000000n,
          fromAddress: 'G_ALICE',
          toAddress: 'G_DAVE',
          createdAt: new Date('2026-05-10T23:59:59.999Z'),
          status: 'CONFIRMED',
        },
        // Just 1 millisecond before next day — belongs to next day
        {
          id: 'tip_next_day',
          amountStroops: 50000000n,
          fromAddress: 'G_EVE',
          toAddress: 'G_BOB',
          createdAt: new Date('2026-05-11T00:00:00.000Z'),
          status: 'CONFIRMED',
        },
        // Just 1 millisecond before previous day
        {
          id: 'tip_prev_day',
          amountStroops: 90000000n,
          fromAddress: 'G_FRANK',
          toAddress: 'G_BOB',
          createdAt: new Date('2026-05-09T23:59:59.999Z'),
          status: 'CONFIRMED',
        },
      );

      const summary = await computeDailyRollup(targetDate, mockPrisma);

      expect(summary.totalTips).toBe(3);
      expect(summary.totalStroops).toBe(60000000n);
      expect(summary.uniqueTippers).toBe(2); // ALICE, CHARLIE
      expect(summary.uniqueCreators).toBe(2); // BOB, DAVE
      expect(summary.activeUsers).toBe(4); // ALICE, BOB, CHARLIE, DAVE

      const saved = mockDailyDb.get('2026-05-10T00:00:00.000Z');
      expect(saved).toBeDefined();
      expect(saved?.totalTips).toBe(3);
      expect(saved?.totalStroops).toBe(60000000n);
    });

    it('excludes FAILED tips from aggregation', async () => {
      mockTipsDb.push(
        {
          id: 'tip_ok',
          amountStroops: 1000n,
          fromAddress: 'G_A',
          toAddress: 'G_B',
          createdAt: new Date('2026-05-10T10:00:00Z'),
          status: 'CONFIRMED',
        },
        {
          id: 'tip_fail',
          amountStroops: 9999n,
          fromAddress: 'G_A',
          toAddress: 'G_B',
          createdAt: new Date('2026-05-10T11:00:00Z'),
          status: 'FAILED',
        },
      );

      const summary = await computeDailyRollup('2026-05-10', mockPrisma);
      expect(summary.totalTips).toBe(1);
      expect(summary.totalStroops).toBe(1000n);
    });
  });

  describe('3. Idempotency', () => {
    it('produces identical records on successive runs without duplicate records', async () => {
      mockTipsDb.push({
        id: 'tip_1',
        amountStroops: 5000000n,
        fromAddress: 'G_A',
        toAddress: 'G_B',
        createdAt: new Date('2026-07-01T14:00:00Z'),
        status: 'CONFIRMED',
      });

      const firstRun = await computeDailyRollup('2026-07-01', mockPrisma);
      const secondRun = await computeDailyRollup('2026-07-01', mockPrisma);
      const thirdRun = await computeDailyRollup('2026-07-01', mockPrisma);

      expect(firstRun).toEqual(secondRun);
      expect(secondRun).toEqual(thirdRun);
      expect(mockDailyDb.size).toBe(1);
      expect(mockDailyDb.get('2026-07-01T00:00:00.000Z')?.totalTips).toBe(1);
    });
  });

  describe('4. Late-Arriving Data Recomputation', () => {
    it('retroactively updates past rollups when indexer delivers delayed events', async () => {
      // 1. Initial rollup run for 2026-08-01 with 1 tip
      mockTipsDb.push({
        id: 'tip_on_time',
        amountStroops: 1000000n,
        fromAddress: 'G_A',
        toAddress: 'G_B',
        createdAt: new Date('2026-08-01T10:00:00Z'),
        status: 'CONFIRMED',
      });
      await computeDailyRollup('2026-08-01', mockPrisma);
      expect(mockDailyDb.get('2026-08-01T00:00:00.000Z')?.totalTips).toBe(1);

      // 2. Indexer lag delivers 2 late tips for 2026-08-01 and 1 tip for 2026-08-02
      const lateEvent1 = new Date('2026-08-01T23:50:00Z');
      const lateEvent2 = new Date('2026-08-01T23:55:00Z');
      const lateEvent3 = new Date('2026-08-02T01:10:00Z');

      mockTipsDb.push(
        {
          id: 'tip_late_1',
          amountStroops: 2000000n,
          fromAddress: 'G_C',
          toAddress: 'G_B',
          createdAt: lateEvent1,
          status: 'CONFIRMED',
        },
        {
          id: 'tip_late_2',
          amountStroops: 3000000n,
          fromAddress: 'G_D',
          toAddress: 'G_B',
          createdAt: lateEvent2,
          status: 'CONFIRMED',
        },
        {
          id: 'tip_late_3',
          amountStroops: 4000000n,
          fromAddress: 'G_E',
          toAddress: 'G_B',
          createdAt: lateEvent3,
          status: 'CONFIRMED',
        },
      );

      // Trigger recomputation for late arriving timestamps
      const recomputed = await recomputeDaysForLateData([lateEvent1, lateEvent2, lateEvent3], mockPrisma);

      expect(recomputed.length).toBe(2); // 2 unique days: 2026-08-01 and 2026-08-02

      const day1 = mockDailyDb.get('2026-08-01T00:00:00.000Z');
      expect(day1?.totalTips).toBe(3);
      expect(day1?.totalStroops).toBe(6000000n);

      const day2 = mockDailyDb.get('2026-08-02T00:00:00.000Z');
      expect(day2?.totalTips).toBe(1);
      expect(day2?.totalStroops).toBe(4000000n);
    });
  });

  describe('5. Missing Day Detection and Backfill', () => {
    it('detects unpopulated dates in a time window and backfills each missing day', async () => {
      // Pre-populate only Day 1 (2026-09-01) and Day 4 (2026-09-04)
      mockDailyDb.set('2026-09-01T00:00:00.000Z', { totalTips: 5 });
      mockDailyDb.set('2026-09-04T00:00:00.000Z', { totalTips: 2 });

      mockTipsDb.push(
        {
          id: 'tip_sep_2',
          amountStroops: 7000n,
          fromAddress: 'G_A',
          toAddress: 'G_B',
          createdAt: new Date('2026-09-02T08:00:00Z'),
          status: 'CONFIRMED',
        },
        {
          id: 'tip_sep_3',
          amountStroops: 8000n,
          fromAddress: 'G_C',
          toAddress: 'G_D',
          createdAt: new Date('2026-09-03T18:00:00Z'),
          status: 'CONFIRMED',
        },
      );

      const result = await detectAndBackfillMissingDays('2026-09-01', '2026-09-04', mockPrisma);

      expect(result.backfilledDays).toEqual(['2026-09-02', '2026-09-03']);
      expect(result.summaries.length).toBe(2);

      expect(mockDailyDb.get('2026-09-02T00:00:00.000Z')?.totalTips).toBe(1);
      expect(mockDailyDb.get('2026-09-03T00:00:00.000Z')?.totalTips).toBe(1);
    });
  });

  describe('6. Cron Schedule Runner', () => {
    it('computes rollup for yesterday when run at 00:05 UTC', async () => {
      const now = new Date('2026-10-02T00:05:00.000Z');

      mockTipsDb.push({
        id: 'tip_yesterday',
        amountStroops: 12000n,
        fromAddress: 'G_X',
        toAddress: 'G_Y',
        createdAt: new Date('2026-10-01T15:00:00Z'),
        status: 'CONFIRMED',
      });

      const summary = await runCronDailyRollup(now, mockPrisma);
      expect(summary.isoDateString).toBe('2026-10-01');
      expect(summary.totalTips).toBe(1);
      expect(summary.totalStroops).toBe(12000n);
    });
  });
});
