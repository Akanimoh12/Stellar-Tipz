import { prisma } from '../db/prisma.js';

export class CursorStore {
  async get(topic: string): Promise<number | null> {
    const cursor = await prisma.indexerCursor.findUnique({ where: { topic } });
    return cursor?.lastLedger ?? null;
  }

  async advance(topic: string, lastLedger: number): Promise<void> {
    await prisma.indexerCursor.upsert({
      where: { topic },
      update: { lastLedger },
      create: { topic, lastLedger },
    });
  }
}
