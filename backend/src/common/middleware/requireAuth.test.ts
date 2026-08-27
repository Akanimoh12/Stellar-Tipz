import request from 'supertest';
import express from 'express';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { requireAuth } from './requireAuth.js';
import { errorHandler } from './errorHandler.js';

vi.mock('../../config/index.js', () => ({
  config: {
    auth: {
      jwtSecret: 'test-secret',
      jwtExpiresIn: '15m',
      refreshTokenExpiresIn: '7d',
      challengeTtlSeconds: 300,
    },
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

const jwt = await import('jsonwebtoken');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/protected', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });
  app.use(errorHandler);
  return app;
}

describe('requireAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const app = buildApp();
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when Authorization header uses a non-Bearer scheme', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when the JWT is invalid', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const app = buildApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Invalid or expired access token');
  });

  it('returns 401 when the JWT is expired', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const err = new Error('jwt expired');
      (err as NodeJS.ErrnoException).name = 'TokenExpiredError';
      throw err;
    });

    const app = buildApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer expired-token');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid or expired access token');
  });

  it('attaches req.user and calls next on a valid token', async () => {
    (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-1',
      stellarAddress: 'GABC123',
    });

    const app = buildApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('user-1');
    expect(res.body.user.stellarAddress).toBe('GABC123');
    expect(res.body.user.username).toBeNull();
  });
});
