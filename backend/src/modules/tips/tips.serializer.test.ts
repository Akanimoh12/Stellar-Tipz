import { describe, it, expect } from 'vitest';
import { serializeTip } from './tips.serializer.js';
import type { Tip } from '@prisma/client';

function makeTip(overrides: Partial<Tip> = {}): Tip {
  return {
    id: 'clh0000000001',
    txHash: 'deadbeef0001',
    ledger: 100,
    fromAddress: 'GABC',
    toAddress: 'GDEF',
    amountStroops: BigInt(5_000_000),
    status: 'PENDING',
    message: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    networkFee: BigInt(0),
    tokenCode: 'XLM',
    isAnonymous: false,
    senderId: null,
    recipientId: null,
    ...overrides,
  } as Tip;
}

describe('serializeTip', () => {
  it('converts BigInt amountStroops to a string', () => {
    const dto = serializeTip(makeTip({ amountStroops: BigInt(1_234_567) }));
    expect(dto.amountStroops).toBe('1234567');
    expect(typeof dto.amountStroops).toBe('string');
  });

  it('converts createdAt Date to ISO 8601 string', () => {
    const date = new Date('2026-06-15T12:30:00.000Z');
    const dto = serializeTip(makeTip({ createdAt: date }));
    expect(dto.createdAt).toBe('2026-06-15T12:30:00.000Z');
  });

  it('preserves the status field as a string', () => {
    const dto = serializeTip(makeTip({ status: 'PENDING' }));
    expect(dto.status).toBe('PENDING');
  });

  it('serializes CONFIRMED status correctly', () => {
    const dto = serializeTip(makeTip({ status: 'CONFIRMED' }));
    expect(dto.status).toBe('CONFIRMED');
  });

  it('passes through a null message', () => {
    const dto = serializeTip(makeTip({ message: null }));
    expect(dto.message).toBeNull();
  });

  it('passes through a non-null message', () => {
    const dto = serializeTip(makeTip({ message: 'Great content!' }));
    expect(dto.message).toBe('Great content!');
  });

  it('maps all fields correctly', () => {
    const tip = makeTip({
      id: 'clh_abc123',
      txHash: 'txhash001',
      ledger: 200,
      fromAddress: 'GSENDER',
      toAddress: 'GRECEIVER',
      amountStroops: BigInt(999),
      status: 'PENDING',
      message: 'Hello',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    const dto = serializeTip(tip);
    expect(dto).toMatchObject({
      id: 'clh_abc123',
      txHash: 'txhash001',
      ledger: 200,
      fromAddress: 'GSENDER',
      toAddress: 'GRECEIVER',
      amountStroops: '999',
      status: 'PENDING',
      message: 'Hello',
      createdAt: '2026-03-01T00:00:00.000Z',
    });
  });
});
