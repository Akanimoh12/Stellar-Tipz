import { createHash } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { redis } from '../../db/redis.js';
import { config } from '../../config/index.js';
import { logger } from '../../common/utils/logger.js';
import { getCreditScoreByUsername } from '../credit/credit.service.js';
import { renderOgPng, renderDefaultOgPng, type OgData } from './ogRenderer.js';

export interface OgImageResult {
  buffer: Buffer;
  contentType: string;
}

const DEFAULT_CACHE_KEY = 'og:default';

function signatureFor(data: OgData): string {
  return createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 16);
}

async function buildCreatorData(username: string): Promise<OgData | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      displayName: true,
      username: true,
      imageUrl: true,
      avatarCid: true,
      stellarAddress: true,
    },
  });
  if (!user) return null;

  const [credit, tipAgg] = await Promise.all([
    getCreditScoreByUsername(username).catch(() => null),
    prisma.tip.aggregate({
      where: { toAddress: user.stellarAddress, status: 'CONFIRMED' },
      _sum: { amountStroops: true },
    }),
  ]);

  const avatarUrl = user.imageUrl ?? (user.avatarCid ? `${config.ipfs.gatewayUrl}${user.avatarCid}` : undefined);

  return {
    displayName: user.displayName ?? user.username ?? 'Creator',
    username: user.username ?? '',
    avatarUrl,
    creditTier: credit?.tier ?? 'New',
    totalTipsStroops: (tipAgg._sum.amountStroops ?? BigInt(0)).toString(),
  };
}

/**
 * Returns a PNG OG image for a creator. Results are cached and keyed by a
 * content signature, so the image is only regenerated when the underlying data
 * (name, avatar, tier, total tips) actually changes. Returns null when the
 * creator does not exist so the caller can serve the default image.
 */
export async function getCreatorOgImage(username: string): Promise<OgImageResult | null> {
  const data = await buildCreatorData(username);
  if (!data) return null;

  const key = `og:creator:${username.toLowerCase()}:${signatureFor(data)}`;
  try {
    const cached = await redis.get(key);
    if (cached) return { buffer: Buffer.from(cached, 'base64'), contentType: 'image/png' };
  } catch (err) {
    logger.warn({ err, username }, 'OG cache read failed');
  }

  try {
    const buffer = await renderOgPng(data, config.og.timeoutMs);
    try {
      await redis.set(key, buffer.toString('base64'), 'EX', config.og.cacheTtlSeconds);
    } catch (err) {
      logger.warn({ err, username }, 'OG cache write failed');
    }
    return { buffer, contentType: 'image/png' };
  } catch (err) {
    // Render or timeout failure — caller serves the default image.
    logger.warn({ err, username }, 'OG render failed, falling back to default');
    return null;
  }
}

/**
 * Returns the default OG image (for unknown/errored creators). Cached so we only
 * rasterize it once.
 */
export async function getDefaultOgImage(): Promise<OgImageResult> {
  try {
    const cached = await redis.get(DEFAULT_CACHE_KEY);
    if (cached) return { buffer: Buffer.from(cached, 'base64'), contentType: 'image/png' };
  } catch (err) {
    logger.warn({ err }, 'OG default cache read failed');
  }

  const buffer = await renderDefaultOgPng();
  try {
    await redis.set(DEFAULT_CACHE_KEY, buffer.toString('base64'), 'EX', config.og.cacheTtlSeconds);
  } catch (err) {
    logger.warn({ err }, 'OG default cache write failed');
  }
  return { buffer, contentType: 'image/png' };
}
