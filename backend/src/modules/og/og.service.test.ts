import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockUserFindUnique,
  mockTipAggregate,
  mockRedisGet,
  mockRedisSet,
  mockRenderOgPng,
  mockRenderDefaultOgPng,
  mockGetCredit,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockTipAggregate: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRenderOgPng: vi.fn(),
  mockRenderDefaultOgPng: vi.fn(),
  mockGetCredit: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    tip: { aggregate: mockTipAggregate },
  },
}));

vi.mock('../../db/redis.js', () => ({
  redis: { get: mockRedisGet, set: mockRedisSet },
}));

vi.mock('./ogRenderer.js', () => ({
  renderOgPng: mockRenderOgPng,
  renderDefaultOgPng: mockRenderDefaultOgPng,
}));

vi.mock('../credit/credit.service.js', () => ({
  getCreditScoreByUsername: mockGetCredit,
}));

import { getCreatorOgImage, getDefaultOgImage } from './og.service.js';
import { buildOgSvg } from './ogSvg.js';

describe('buildOgSvg', () => {
  it('includes name, username, tier and total tips', () => {
    const svg = buildOgSvg({
      displayName: 'Alice',
      username: 'alice',
      avatarUrl: undefined,
      creditTier: 'Gold',
      totalTipsStroops: '250000000',
    });
    expect(svg).toContain('Alice');
    expect(svg).toContain('@alice');
    expect(svg).toContain('Gold');
    expect(svg).toContain('25 XLM tipped');
  });
});

describe('getCreatorOgImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue(undefined);
    mockGetCredit.mockResolvedValue({ tier: 'Gold' });
    mockTipAggregate.mockResolvedValue({ _sum: { amountStroops: BigInt(250_000_000) } });
  });

  it('renders and caches the image for a known creator', async () => {
    mockUserFindUnique.mockResolvedValue({
      displayName: 'Alice',
      username: 'alice',
      imageUrl: null,
      avatarCid: null,
      stellarAddress: 'GA1',
    });
    const buf = Buffer.from('PNGDATA');
    mockRenderOgPng.mockResolvedValue(buf);

    const res = await getCreatorOgImage('alice');
    expect(res).not.toBeNull();
    expect(res!.buffer).toBe(buf);
    expect(mockRenderOgPng).toHaveBeenCalledTimes(1);
    expect(mockRedisSet).toHaveBeenCalled();
  });

  it('serves from cache on a signature hit without re-rendering', async () => {
    const cached = Buffer.from('CACHED').toString('base64');
    mockRedisGet.mockResolvedValueOnce(cached);
    mockUserFindUnique.mockResolvedValue({
      displayName: 'Alice',
      username: 'alice',
      imageUrl: null,
      avatarCid: null,
      stellarAddress: 'GA1',
    });

    const res = await getCreatorOgImage('alice');
    expect(res!.buffer.equals(Buffer.from('CACHED'))).toBe(true);
    expect(mockRenderOgPng).not.toHaveBeenCalled();
  });

  it('returns null for an unknown creator', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = await getCreatorOgImage('ghost');
    expect(res).toBeNull();
  });

  it('returns null when rendering times out (caller serves default)', async () => {
    mockUserFindUnique.mockResolvedValue({
      displayName: 'Alice',
      username: 'alice',
      imageUrl: null,
      avatarCid: null,
      stellarAddress: 'GA1',
    });
    mockRenderOgPng.mockRejectedValue(new Error('timeout'));
    const res = await getCreatorOgImage('alice');
    expect(res).toBeNull();
  });
});

describe('getDefaultOgImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue(undefined);
  });

  it('renders and caches a default image', async () => {
    const buf = Buffer.from('DEFAULT');
    mockRenderDefaultOgPng.mockResolvedValue(buf);
    const res = await getDefaultOgImage();
    expect(res.buffer).toBe(buf);
    expect(mockRenderDefaultOgPng).toHaveBeenCalledTimes(1);
  });
});
