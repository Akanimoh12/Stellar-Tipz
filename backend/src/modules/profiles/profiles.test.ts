import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';
import { validateUsername } from './profiles.service.js';

const { mockFindUnique, mockUpdate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn(() => ({ sub: 'user-1', stellarAddress: 'GABCDEF123456789012345678901234567890123456789012345678901234' })) },
  verify: vi.fn(() => ({ sub: 'user-1', stellarAddress: 'GABCDEF123456789012345678901234567890123456789012345678901234' })),
}));

vi.mock('node:crypto', () => ({
  default: { randomBytes: vi.fn(() => Buffer.from('abcdef1234567890abcdef1234567890')) },
  randomBytes: vi.fn(() => Buffer.from('abcdef1234567890abcdef1234567890')),
}));

const validAddress = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';
const authHeader = 'Bearer mock-token';

describe('GET /api/v1/profiles/by-address/:address', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when profile is not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get(`/api/v1/profiles/by-address/${validAddress}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when profile is soft-deleted', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      stellarAddress: validAddress,
      username: 'olduser',
      profileImageCid: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    });

    const app = createApp();
    const res = await request(app).get(`/api/v1/profiles/by-address/${validAddress}`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Profile has been deactivated');
  });

  it('returns the profile when found and active', async () => {
    const now = new Date();
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      stellarAddress: validAddress,
      username: 'testuser',
      profileImageCid: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const app = createApp();
    const res = await request(app).get(`/api/v1/profiles/by-address/${validAddress}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stellarAddress).toBe(validAddress);
    expect(res.body.data.username).toBe('testuser');
  });
});

describe('PATCH /api/v1/profiles/reactivate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    const app = createApp();
    const res = await request(app).patch('/api/v1/profiles/reactivate').send({});
    expect(res.status).toBe(401);
  });

  it('returns 400 when profile is not deactivated', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      stellarAddress: validAddress,
      username: 'testuser',
      profileImageCid: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/profiles/reactivate')
      .set('Authorization', authHeader)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Profile is not deactivated');
  });

  it('reactivates a soft-deleted profile', async () => {
    const now = new Date();
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      stellarAddress: validAddress,
      username: 'testuser',
      profileImageCid: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    });
    mockUpdate.mockResolvedValue({
      id: 'user-1',
      stellarAddress: validAddress,
      username: 'testuser',
      profileImageCid: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/profiles/reactivate')
      .set('Authorization', authHeader)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.stellarAddress).toBe(validAddress);
  });
});

describe('validateUsername', () => {
  it('accepts a valid lowercase username', () => {
    expect(() => validateUsername('john_doe')).not.toThrow();
  });

  it('accepts a username with numbers', () => {
    expect(() => validateUsername('user123')).not.toThrow();
  });

  it('rejects a username shorter than 3 characters', () => {
    expect(() => validateUsername('ab')).toThrow('Username must be at least 3 characters');
  });

  it('rejects a username longer than 32 characters', () => {
    expect(() => validateUsername('a'.repeat(33))).toThrow('Username must be at most 32 characters');
  });

  it('rejects a username with uppercase letters', () => {
    expect(() => validateUsername('JohnDoe')).toThrow(
      'Username can only contain lowercase letters, numbers, and underscores',
    );
  });

  it('rejects a username with special characters', () => {
    expect(() => validateUsername('john-doe')).toThrow(
      'Username can only contain lowercase letters, numbers, and underscores',
    );
  });

  it('rejects a reserved username', () => {
    expect(() => validateUsername('admin')).toThrow('Username "admin" is reserved');
  });

  it('rejects another reserved username', () => {
    expect(() => validateUsername('stellar')).toThrow('Username "stellar" is reserved');
  });

  it('rejects the test reserved username', () => {
    expect(() => validateUsername('test')).toThrow('Username "test" is reserved');
  });

  it('rejects the help reserved username', () => {
    expect(() => validateUsername('help')).toThrow('Username "help" is reserved');
  });
});

describe('POST /api/v1/profiles/image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/profiles/image')
      .send({ dataUrl: 'data:image/png;base64,abc' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid dataUrl', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/profiles/image')
      .set('Authorization', authHeader)
      .send({ dataUrl: 'not-a-data-url' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('uploads image and stores CID', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      stellarAddress: validAddress,
      username: 'testuser',
      profileImageCid: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    mockUpdate.mockResolvedValue({
      id: 'user-1',
      stellarAddress: validAddress,
      username: 'testuser',
      profileImageCid: 'sim-abcdef123456',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/profiles/image')
      .set('Authorization', authHeader)
      .send({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(res.status).toBe(200);
    expect(res.body.data.profileImageCid).toBeDefined();
  });
});
