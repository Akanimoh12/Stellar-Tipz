import { describe, it, expect } from 'vitest';
import { serializeProfile } from './profiles.serializer.js';

describe('serializeProfile', () => {
  const baseRow = {
    id: 'user-123',
    stellarAddress: 'GABCDEF123456789012345678901234567890123456789012345678901234',
    username: 'testuser',
    displayName: 'Test User',
    bio: 'Hello, I am a developer!',
    imageUrl: 'https://example.com/avatar.png',
    avatarCid: 'QmHash123',
    xHandle: 'testhandle',
    createdAt: new Date('2026-01-15T10:30:00.000Z'),
    updatedAt: new Date('2026-06-20T14:45:00.000Z'),
  };

  const stats = { tipsCount: 42, totalReceived: '50000000' };

  it('converts Date objects to ISO strings', () => {
    const dto = serializeProfile(baseRow, stats);
    expect(dto.createdAt).toBe('2026-01-15T10:30:00.000Z');
    expect(dto.updatedAt).toBe('2026-06-20T14:45:00.000Z');
  });

  it('accepts ISO string dates without error', () => {
    const row = {
      ...baseRow,
      createdAt: '2026-01-15T10:30:00.000Z',
      updatedAt: '2026-06-20T14:45:00.000Z',
    };
    const dto = serializeProfile(row, stats);
    expect(dto.createdAt).toBe('2026-01-15T10:30:00.000Z');
    expect(dto.updatedAt).toBe('2026-06-20T14:45:00.000Z');
  });

  it('maps all public fields correctly', () => {
    const dto = serializeProfile(baseRow, stats);
    expect(dto).toEqual({
      id: 'user-123',
      stellarAddress: baseRow.stellarAddress,
      username: 'testuser',
      displayName: 'Test User',
      bio: 'Hello, I am a developer!',
      imageUrl: 'https://example.com/avatar.png',
      avatarCid: 'QmHash123',
      xHandle: 'testhandle',
      createdAt: '2026-01-15T10:30:00.000Z',
      updatedAt: '2026-06-20T14:45:00.000Z',
      tipsCount: 42,
      totalReceived: '50000000',
    });
  });

  it('includes tipsCount and totalReceived from stats', () => {
    const dto = serializeProfile(baseRow, stats);
    expect(dto.tipsCount).toBe(42);
    expect(dto.totalReceived).toBe('50000000');
  });

  it('handles null optional fields', () => {
    const row = {
      ...baseRow,
      username: null,
      displayName: null,
      bio: null,
      imageUrl: null,
      avatarCid: null,
      xHandle: null,
    };
    const dto = serializeProfile(row, stats);
    expect(dto.username).toBeNull();
    expect(dto.displayName).toBeNull();
    expect(dto.bio).toBeNull();
    expect(dto.imageUrl).toBeNull();
    expect(dto.avatarCid).toBeNull();
    expect(dto.xHandle).toBeNull();
  });

  it('never exposes internal fields', () => {
    const row = {
      ...baseRow,
      passwordHash: 'secret123',
      email: 'secret@example.com',
      role: 'admin',
      deletedAt: new Date(),
      internalNote: 'do not expose',
    } as never;
    const dto = serializeProfile(row, stats);
    expect(dto).not.toHaveProperty('passwordHash');
    expect(dto).not.toHaveProperty('email');
    expect(dto).not.toHaveProperty('role');
    expect(dto).not.toHaveProperty('deletedAt');
    expect(dto).not.toHaveProperty('internalNote');
  });

  it('maps zero tips stats correctly', () => {
    const zeroStats = { tipsCount: 0, totalReceived: '0' };
    const dto = serializeProfile(baseRow, zeroStats);
    expect(dto.tipsCount).toBe(0);
    expect(dto.totalReceived).toBe('0');
  });
});
