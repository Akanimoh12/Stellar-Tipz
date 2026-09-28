/**
 * #1262 — Dead Letter Queue (DLQ) store and depth metrics.
 */

import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';

export interface DlqEntryInput {
  topic: string;
  ledger: number;
  eventId?: string;
  payload: Record<string, unknown> | unknown;
  error: string;
  stack?: string;
  attempts?: number;
}

export interface DlqEntryRecord {
  id: string;
  topic: string;
  ledger: number;
  eventId: string | null;
  payload: unknown;
  error: string;
  stack: string | null;
  attempts: number;
  status: string; // 'pending' | 'replayed' | 'resolved' | 'discarded'
  replayedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeadLetterStore {
  push(entry: DlqEntryInput): Promise<DlqEntryRecord>;
  list(filter?: { topic?: string; status?: string; limit?: number }): Promise<DlqEntryRecord[]>;
  get(id: string): Promise<DlqEntryRecord | null>;
  getDepth(topic?: string): Promise<number>;
  markReplayed(id: string): Promise<DlqEntryRecord | null>;
  markResolved(id: string): Promise<DlqEntryRecord | null>;
  markDiscarded(id: string): Promise<DlqEntryRecord | null>;
  clear(topic?: string): Promise<void>;
}

export type AlertCallback = (depth: number, topic?: string) => void;

/**
 * Metric and alert manager for DLQ depth.
 */
export class DlqMetricManager {
  private alertListeners: AlertCallback[] = [];

  public onNonZeroDepth(cb: AlertCallback): () => void {
    this.alertListeners.push(cb);
    return () => {
      const idx = this.alertListeners.indexOf(cb);
      if (idx !== -1) this.alertListeners.splice(idx, 1);
    };
  }

  public notifyDepth(depth: number, topic?: string): void {
    if (depth > 0) {
      logger.warn({ depth, topic }, `[DLQ ALERT] Non-zero dead letter queue depth detected: ${depth}`);
      for (const listener of this.alertListeners) {
        try {
          listener(depth, topic);
        } catch (err) {
          logger.error({ err }, 'Error in DLQ depth alert listener');
        }
      }
    }
  }
}

export const dlqMetrics = new DlqMetricManager();

/**
 * Prisma-backed DLQ Store for persistent dead letter tracking.
 */
export class PrismaDeadLetterStore implements IDeadLetterStore {
  async push(entry: DlqEntryInput): Promise<DlqEntryRecord> {
    const record = await prisma.deadLetterEvent.create({
      data: {
        topic: entry.topic,
        ledger: entry.ledger,
        eventId: entry.eventId ?? null,
        payload: entry.payload as object,
        error: entry.error,
        stack: entry.stack ?? null,
        attempts: entry.attempts ?? 1,
        status: 'pending',
      },
    });

    const depth = await this.getDepth(entry.topic);
    dlqMetrics.notifyDepth(depth, entry.topic);

    return record as DlqEntryRecord;
  }

  async list(filter?: { topic?: string; status?: string; limit?: number }): Promise<DlqEntryRecord[]> {
    const where: Record<string, unknown> = {};
    if (filter?.topic) where.topic = filter.topic;
    if (filter?.status) where.status = filter.status;

    const records = await prisma.deadLetterEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 50,
    });

    return records as DlqEntryRecord[];
  }

  async get(id: string): Promise<DlqEntryRecord | null> {
    const record = await prisma.deadLetterEvent.findUnique({
      where: { id },
    });
    return record as DlqEntryRecord | null;
  }

  async getDepth(topic?: string): Promise<number> {
    const where: Record<string, unknown> = { status: 'pending' };
    if (topic) where.topic = topic;

    return prisma.deadLetterEvent.count({ where });
  }

  async markReplayed(id: string): Promise<DlqEntryRecord | null> {
    const updated = await prisma.deadLetterEvent.update({
      where: { id },
      data: { status: 'replayed', replayedAt: new Date() },
    });
    return updated as DlqEntryRecord;
  }

  async markResolved(id: string): Promise<DlqEntryRecord | null> {
    const updated = await prisma.deadLetterEvent.update({
      where: { id },
      data: { status: 'resolved' },
    });
    return updated as DlqEntryRecord;
  }

  async markDiscarded(id: string): Promise<DlqEntryRecord | null> {
    const updated = await prisma.deadLetterEvent.update({
      where: { id },
      data: { status: 'discarded' },
    });
    return updated as DlqEntryRecord;
  }

  async clear(topic?: string): Promise<void> {
    const where: Record<string, unknown> = {};
    if (topic) where.topic = topic;
    await prisma.deadLetterEvent.deleteMany({ where });
  }
}

/**
 * In-memory DLQ store for testing and fallback.
 */
export class InMemoryDeadLetterStore implements IDeadLetterStore {
  private entries: Map<string, DlqEntryRecord> = new Map();
  private idCounter = 1;

  async push(entry: DlqEntryInput): Promise<DlqEntryRecord> {
    const id = `dlq_${this.idCounter++}_${Date.now()}`;
    const now = new Date();
    const record: DlqEntryRecord = {
      id,
      topic: entry.topic,
      ledger: entry.ledger,
      eventId: entry.eventId ?? null,
      payload: entry.payload,
      error: entry.error,
      stack: entry.stack ?? null,
      attempts: entry.attempts ?? 1,
      status: 'pending',
      replayedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.entries.set(id, record);
    const depth = await this.getDepth(entry.topic);
    dlqMetrics.notifyDepth(depth, entry.topic);

    return record;
  }

  async list(filter?: { topic?: string; status?: string; limit?: number }): Promise<DlqEntryRecord[]> {
    let list = Array.from(this.entries.values());
    if (filter?.topic) list = list.filter((e) => e.topic === filter.topic);
    if (filter?.status) list = list.filter((e) => e.status === filter.status);

    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (filter?.limit) list = list.slice(0, filter.limit);

    return list;
  }

  async get(id: string): Promise<DlqEntryRecord | null> {
    return this.entries.get(id) ?? null;
  }

  async getDepth(topic?: string): Promise<number> {
    let list = Array.from(this.entries.values()).filter((e) => e.status === 'pending');
    if (topic) list = list.filter((e) => e.topic === topic);
    return list.length;
  }

  async markReplayed(id: string): Promise<DlqEntryRecord | null> {
    const entry = this.entries.get(id);
    if (!entry) return null;
    entry.status = 'replayed';
    entry.replayedAt = new Date();
    entry.updatedAt = new Date();
    return entry;
  }

  async markResolved(id: string): Promise<DlqEntryRecord | null> {
    const entry = this.entries.get(id);
    if (!entry) return null;
    entry.status = 'resolved';
    entry.updatedAt = new Date();
    return entry;
  }

  async markDiscarded(id: string): Promise<DlqEntryRecord | null> {
    const entry = this.entries.get(id);
    if (!entry) return null;
    entry.status = 'discarded';
    entry.updatedAt = new Date();
    return entry;
  }

  async clear(topic?: string): Promise<void> {
    if (!topic) {
      this.entries.clear();
      return;
    }
    for (const [id, entry] of this.entries.entries()) {
      if (entry.topic === topic) this.entries.delete(id);
    }
  }
}
