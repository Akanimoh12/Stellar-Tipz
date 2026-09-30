import request from 'supertest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from '../src/config/env.js';

// Mock rate limiter to avoid Redis
vi.mock('../src/common/middleware/rateLimiter.js', () => ({
  globalRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock prisma and redis for OG embed route so it doesn't need DB
vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    tip: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountStroops: 0n } }) },
  },
}));
vi.mock('../src/db/redis.js', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') },
}));
vi.mock('../src/config/index.js', () => ({
  config: {
    ipfs: { gatewayUrl: 'https://ipfs.io/ipfs/' },
    og: { timeoutMs: 3000, cacheTtlSeconds: 86400 },
  },
}));
vi.mock('../src/modules/credit/credit.service.js', () => ({
  getCreditScoreByUsername: vi.fn().mockResolvedValue(null),
}));
vi.mock('../src/modules/og/ogRenderer.js', () => ({
  renderOgPng: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
  renderDefaultOgPng: vi.fn().mockResolvedValue(Buffer.from('fake-default')),
}));

import { createApp } from '../src/app.js';

describe('Security headers — explicit configuration (issues #079, #080, #066)', () => {
  // Helper to fetch headers from a path
  async function getHeaders(path: string) {
    const app = createApp();
    const res = await request(app).get(path);
    return res.headers as Record<string, string>;
  }

  describe('CSP — strict for API, relaxed only for docs', () => {
    it('API route CSP does NOT contain unsafe-inline in script-src', async () => {
      const app = createApp();
      // Use a JSON API endpoint that is NOT under /docs — after helmet, 404 still carries headers
      const res = await request(app).get('/api/v1/nonexistent-api-route');
      const csp = res.headers['content-security-policy'] as string | undefined;
      expect(csp).toBeDefined();
      // Must contain script-src 'self' without unsafe-inline
      expect(csp).toMatch(/script-src[^;]*'self'/);
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      // style-src also strict for API — no unsafe-inline
      const styleSrc = csp?.match(/style-src[^;]*/)?.[0] || '';
      expect(styleSrc).not.toContain("'unsafe-inline'");
    });

    it('docs UI CSP DOES contain unsafe-inline (scoped relaxation)', async () => {
      const app = createApp();
      const res = await request(app).get('/api/v1/docs/');
      const csp = res.headers['content-security-policy'] as string | undefined;
      expect(csp).toBeDefined();
      // Docs needs inline scripts/styles for Swagger UI — this is the documented exception
      expect(csp).toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
    });

    it('API CSP includes report-uri when CSP_REPORT_URI is configured', async () => {
      // CSP_REPORT_URI is read at env parse time; in test env it's undefined by default,
      // so we test the header structure rather than value. If set, it should appear.
      // Here we verify the header is present and does not break when no report-uri.
      const app = createApp();
      const res = await request(app).get('/api/v1/docs/openapi.json');
      const csp = res.headers['content-security-policy'] as string;
      expect(csp).toBeDefined();
      // When not configured, report-uri should be absent (not failing)
      // We assert the CSP is still valid and contains default-src
      expect(csp).toContain("default-src");
    });
  });

  describe('Full header set — explicit, version-bump-proof', () => {
    async function fetchApiHeaders() {
      const app = createApp();
      // Use a JSON API route (not /health which is before helmet, not /docs which is relaxed)
      const res = await request(app).get('/api/v1/nonexistent-api-route');
      return res.headers as Record<string, string>;
    }

    it('sets X-Content-Type-Options: nosniff', async () => {
      const headers = await fetchApiHeaders();
      expect(headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets Referrer-Policy explicitly (no-referrer)', async () => {
      const headers = await fetchApiHeaders();
      expect(headers['referrer-policy']).toBe('no-referrer');
    });

    it('sets X-Frame-Options: DENY on API routes', async () => {
      const headers = await fetchApiHeaders();
      expect(headers['x-frame-options']).toBe('DENY');
    });

    it('sets Permissions-Policy denying unused features', async () => {
      const headers = await fetchApiHeaders();
      const pp = headers['permissions-policy'];
      expect(pp).toBeDefined();
      expect(pp).toContain('camera=()');
      expect(pp).toContain('microphone=()');
      expect(pp).toContain('geolocation=()');
      expect(pp).toContain('payment=()');
    });

    it('sets X-DNS-Prefetch-Control: off', async () => {
      const headers = await fetchApiHeaders();
      expect(headers['x-dns-prefetch-control']).toBe('off');
    });

    it('sets X-Permitted-Cross-Domain-Policies: none', async () => {
      const headers = await fetchApiHeaders();
      expect(headers['x-permitted-cross-domain-policies']).toBe('none');
    });

    it('does NOT set X-Powered-By', async () => {
      const headers = await fetchApiHeaders();
      expect(headers['x-powered-by']).toBeUndefined();
    });

    it('sets Cross-Origin-Opener-Policy: same-origin', async () => {
      const headers = await fetchApiHeaders();
      expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    });

    it('sets Cross-Origin-Resource-Policy: same-site', async () => {
      const headers = await fetchApiHeaders();
      expect(headers['cross-origin-resource-policy']).toBe('same-site');
    });

    it('sets Origin-Agent-Cluster: ?1', async () => {
      const headers = await fetchApiHeaders();
      expect(headers['origin-agent-cluster']).toBe('?1');
    });

    it('HSTS disabled in non-production (test env)', async () => {
      const headers = await fetchApiHeaders();
      // In test/development helmet is configured with hsts: false, so header absent
      expect(headers['strict-transport-security']).toBeUndefined();
    });

    it('HSTS enabled in production with documented max-age', async () => {
      const original = env.NODE_ENV;
      const originalCsp = (env as Record<string, unknown>).CSP_REPORT_URI;
      try {
        (env as Record<string, unknown>).NODE_ENV = 'production';
        const app = createApp();
        const res = await request(app).get('/api/v1/nonexistent-api-route');
        const hsts = res.headers['strict-transport-security'] as string | undefined;
        expect(hsts).toBeDefined();
        // Must be 1 year = 31536000, includeSubDomains and preload
        expect(hsts).toContain('max-age=31536000');
        expect(hsts).toContain('includeSubDomains');
        expect(hsts).toContain('preload');
      } finally {
        (env as Record<string, unknown>).NODE_ENV = original;
        (env as Record<string, unknown>).CSP_REPORT_URI = originalCsp;
      }
    });

    it('CSP includes report-uri when CSP_REPORT_URI is configured', async () => {
      const original = (env as Record<string, unknown>).CSP_REPORT_URI;
      try {
        (env as Record<string, unknown>).CSP_REPORT_URI = 'https://example.com/csp-report';
        const app = createApp();
        const res = await request(app).get('/api/v1/nonexistent-api-route');
        const csp = res.headers['content-security-policy'] as string;
        expect(csp).toContain('report-uri');
        expect(csp).toContain('https://example.com/csp-report');
      } finally {
        (env as Record<string, unknown>).CSP_REPORT_URI = original;
      }
    });
  });

  describe('Embed route (#066) — own frame policy', () => {
    it('OG image route is embeddable: X-Frame-Options is NOT DENY', async () => {
      const app = createApp();
      const res = await request(app).get('/api/v1/og/creators/testuser.png');
      const xfo = res.headers['x-frame-options'] as string | undefined;
      // Must not be DENY — embed route allows framing
      expect(xfo).toBeDefined();
      expect(xfo).not.toBe('DENY');
      expect(xfo).toBe('ALLOWALL');
    });

    it('OG route CSP has frame-ancestors * (permissive)', async () => {
      const app = createApp();
      const res = await request(app).get('/api/v1/og/creators/testuser.png');
      const csp = res.headers['content-security-policy'] as string | undefined;
      expect(csp).toBeDefined();
      // Should allow framing by any ancestor for embeddability
      expect(csp).toMatch(/frame-ancestors[^;]*\*/);
    });

    it('API route CSP has frame-ancestors none (not embeddable)', async () => {
      const app = createApp();
      const res = await request(app).get('/api/v1/nonexistent-api-route');
      const csp = res.headers['content-security-policy'] as string;
      expect(csp).toMatch(/frame-ancestors[^;]*'none'/);
    });

    it('docs route CSP has frame-ancestors self (not wildcard)', async () => {
      const app = createApp();
      const res = await request(app).get('/api/v1/docs/');
      const csp = res.headers['content-security-policy'] as string;
      // Docs should be self only, not wildcard, not none
      expect(csp).toMatch(/frame-ancestors[^;]*'self'/);
      expect(csp).not.toMatch(/frame-ancestors[^;]*\*/);
    });
  });

  describe('CSP violation reporting endpoint', () => {
    it('POST /api/v1/csp-reports returns 204', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/v1/csp-reports')
        .set('Content-Type', 'application/csp-report')
        .send(JSON.stringify({ 'csp-report': { 'document-uri': 'http://example.com', 'violated-directive': 'script-src' } }));
      expect(res.status).toBe(204);
    });

    it('POST /api/v1/csp-reports accepts application/json', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/v1/csp-reports')
        .set('Content-Type', 'application/json')
        .send({ 'csp-report': { 'document-uri': 'http://example.com' } });
      expect(res.status).toBe(204);
    });
  });
});
