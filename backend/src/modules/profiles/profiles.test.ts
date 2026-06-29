import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';
import { validateUsername } from './profiles.service.js';

const { mockFindUnique, mockFindFirst, mockUpdate, mockCreate, mockRedisGet, mockRedisSetex, mockRedisDel } =
  vi.hoisted(() => ({
    mockFindUnique: vi.fn(),
    mockFindFirst: vi.fn(),
    mockUpdate: vi.fn(),
    mockCreate: vi.fn(),
    mockRedisGet: vi.fn(),
    mockRedisSetex: vi.fn(),
    mockRedisDel: vi.fn(),
  }));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
      update: mockUpdate,
      create: mockCreate,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('../../db/redis.js', () => ({
  redis: {
    get: mockRedisGet,
    setex: mockRedisSetex,
    del: mockRedisDel,
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(() => ({
      sub: 'user-1',
      stellarAddress: 'GABCDEF123456789012345678901234567890123456789012345678901234',
    })),
  },
  verify: vi.fn(() => ({
    sub: 'user-1',
    stellarAddress: 'GABCDEF123456789012345678901234567890123456789012345678901234',
  })),
}));

vi.mock('node:crypto', () => ({
  default: { randomBytes: vi.fn(() => Buffer.from('abcdef1234567890abcdef1234567890')) },
  randomBytes: vi.fn(() => Buffer.from('abcdef1234567890abcdef1234567890')),
}));

const validAddress = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';
const authHeader = 'Bearer mock-token';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    stellarAddress: validAddress,
    username: 'testuser',
    displayName: null,
    bio: null,
    imageUrl: null,
    avatarCid: null,
    xHandle: null,
    creditScore: null,
    creditTier: null,
    minTipAmount: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('GET /api/v1/profiles/by-address/:address', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when profile is not found', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockRedisGet.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get(`/api/v1/profiles/by-address/${validAddress}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when profile is soft-deleted', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(makeUser({ deletedAt: new Date() }));

    const app = createApp();
    const res = await request(app).get(`/api/v1/profiles/by-address/${validAddress}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns the profile when found and active', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(makeUser());

    const app = createApp();
    const res = await request(app).get(`/api/v1/profiles/by-address/${validAddress}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stellarAddress).toBe(validAddress);
    expect(res.body.data.username).toBe('testuser');
  });

  it('includes creditScore and creditTier in response', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(makeUser({ creditScore: 750, creditTier: 'silver' }));

    const app = createApp();
    const res = await request(app).get(`/api/v1/profiles/by-address/${validAddress}`);
    expect(res.status).toBe(200);
    expect(res.body.data.creditScore).toBe(750);
    expect(res.body.data.creditTier).toBe('silver');
  });

  it('returns creditScore as null when not set', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(makeUser({ creditScore: null, creditTier: null }));

    const app = createApp();
    const res = await request(app).get(`/api/v1/profiles/by-address/${validAddress}`);
    expect(res.status).toBe(200);
    expect(res.body.data.creditScore).toBeNull();
    expect(res.body.data.creditTier).toBeNull();
  });

  it('returns cached profile on subsequent requests', async () => {
    const cachedProfile = {
      id: 'user-1',
      stellarAddress: validAddress,
      username: 'cacheduser',
      displayName: null,
      bio: null,
      imageUrl: null,
      avatarCid: null,
      xHandle: null,
      creditScore: 800,
      creditTier: 'gold',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockRedisGet.mockResolvedValue(JSON.stringify(cachedProfile));

    const app = createApp();
    const res = await request(app).get(`/api/v1/profiles/by-address/${validAddress}`);
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('cacheduser');
    expect(res.body.data.creditScore).toBe(800);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('caches profile after first DB read', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue('OK');
    mockFindUnique.mockResolvedValue(makeUser({ creditScore: 650, creditTier: 'bronze' }));

    const app = createApp();
    await request(app).get(`/api/v1/profiles/by-address/${validAddress}`);
    expect(mockRedisSetex).toHaveBeenCalled();
  });
});

describe('GET /api/v1/profiles/by-username/:username', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when profile not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/profiles/by-username/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns profile when found', async () => {
    mockFindUnique.mockResolvedValue(
      makeUser({ username: 'testuser', creditScore: 850, creditTier: 'platinum' }),
    );

    const app = createApp();
    const res = await request(app).get('/api/v1/profiles/by-username/testuser');
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('testuser');
    expect(res.body.data.creditScore).toBe(850);
    expect(res.body.data.creditTier).toBe('platinum');
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
    mockFindUnique.mockResolvedValue(makeUser({ deletedAt: null }));

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/profiles/reactivate')
      .set('Authorization', authHeader)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Profile is not deactivated');
  });

  it('reactivates a soft-deleted profile', async () => {
    mockFindUnique.mockResolvedValue(makeUser({ deletedAt: new Date() }));
    mockUpdate.mockResolvedValue(makeUser({ deletedAt: null }));

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/profiles/reactivate')
      .set('Authorization', authHeader)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.stellarAddress).toBe(validAddress);
  });

  it('invalidates cache on reactivation', async () => {
    mockFindUnique.mockResolvedValue(makeUser({ deletedAt: new Date() }));
    mockUpdate.mockResolvedValue(makeUser({ deletedAt: null }));

    const app = createApp();
    await request(app)
      .patch('/api/v1/profiles/reactivate')
      .set('Authorization', authHeader)
      .send({});
    expect(mockRedisDel).toHaveBeenCalled();
  });
});

describe('POST /api/v1/profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/profiles')
      .send({ username: 'newuser' });
    expect(res.status).toBe(401);
  });

  it('returns 201 when profile is created', async () => {
    mockFindUnique.mockResolvedValueOnce(null); // no existing profile
    mockFindUnique.mockResolvedValueOnce(null); // no username conflict
    mockCreate.mockResolvedValue(makeUser({ username: 'newuser' }));
    mockRedisSetex.mockResolvedValue('OK');

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/profiles')
      .set('Authorization', authHeader)
      .send({ username: 'newuser', displayName: 'New User' });
    expect(res.status).toBe(201);
    expect(res.body.data.username).toBe('newuser');
    expect(res.body.data.stellarAddress).toBe(validAddress);
  });

  it('returns 409 when profile already exists', async () => {
    mockFindUnique.mockResolvedValueOnce(makeUser());

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/profiles')
      .set('Authorization', authHeader)
      .send({ username: 'anotheruser' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 400 when username is already taken', async () => {
    mockFindUnique.mockResolvedValueOnce(null); // no existing profile
    mockFindUnique.mockResolvedValueOnce(makeUser()); // username conflict

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/profiles')
      .set('Authorization', authHeader)
      .send({ username: 'testuser' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid username', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/profiles')
      .set('Authorization', authHeader)
      .send({ username: 'ab' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/v1/profiles/me with minTipAmount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates minTipAmount on profile', async () => {
    mockFindUnique.mockResolvedValue(makeUser());
    mockUpdate.mockResolvedValue(makeUser({ minTipAmount: BigInt(100) }));

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/profiles/me')
      .set('Authorization', authHeader)
      .send({ minTipAmount: '100' });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('returns 400 for invalid minTipAmount format', async () => {
    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/profiles/me')
      .set('Authorization', authHeader)
      .send({ minTipAmount: 'not-a-number' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
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
    expect(() => validateUsername('a'.repeat(33))).toThrow(
      'Username must be at most 32 characters',
    );
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
    mockFindUnique.mockResolvedValue(makeUser());
    mockUpdate.mockResolvedValue(makeUser({ avatarCid: 'sim-abcdef123456' }));

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/profiles/image')
      .set('Authorization', authHeader)
      .send({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(res.status).toBe(200);
    expect(res.body.data.profileImageCid).toBeDefined();
  });
});

describe('GET /api/v1/profiles/check-username', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns available=true when username is free', async () => {
    mockFindFirst.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/profiles/check-username?username=newuser');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ available: true });
  });

  it('returns available=false when username is taken', async () => {
    mockFindFirst.mockResolvedValue(makeUser({ username: 'testuser' }));

    const app = createApp();
    const res = await request(app).get('/api/v1/profiles/check-username?username=testuser');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ available: false });
  });

  it('returns available=false when username taken with different case', async () => {
    mockFindFirst.mockResolvedValue(makeUser({ username: 'TestUser' }));

    const app = createApp();
    const res = await request(app).get('/api/v1/profiles/check-username?username=testuser');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ available: false });
  });

  it('returns validation error for invalid username', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/profiles/check-username?username=ab');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
