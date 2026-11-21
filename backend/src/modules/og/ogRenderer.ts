import sharp from 'sharp';
import { logger } from '../../common/utils/logger.js';
import { buildOgSvg, type OgData } from './ogSvg.js';

export type { OgData } from './ogSvg.js';

// Simple in-process concurrency cap so we never rasterize unbounded images.
let activeRenders = 0;
const renderQueue: Array<() => void> = [];

async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeRenders >= 1) {
    await new Promise<void>((resolve) => renderQueue.push(resolve));
  }
  activeRenders += 1;
  try {
    return await fn();
  } finally {
    activeRenders -= 1;
    const next = renderQueue.shift();
    if (next) next();
  }
}

async function rasterize(svg: string): Promise<Buffer> {
  return withConcurrencyLimit(() => sharp(Buffer.from(svg)).png().toBuffer());
}

/**
 * Renders creator OG data to a PNG buffer. Bounded by `timeoutMs`; if rendering
 * exceeds the budget it rejects so the caller can fall back to the default image.
 */
export async function renderOgPng(data: OgData, timeoutMs: number): Promise<Buffer> {
  const svg = buildOgSvg(data);
  const render = rasterize(svg);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('og render timeout')), timeoutMs),
  );
  try {
    return await Promise.race([render, timeout]);
  } catch (err) {
    logger.warn({ err }, 'OG image render failed');
    throw err;
  }
}

/** A neutral default OG image used for unknown/errored creators. */
export async function renderDefaultOgPng(): Promise<Buffer> {
  return renderOgPng(
    {
      displayName: 'Stellar Tipz',
      username: 'stellar-tipz',
      avatarUrl: undefined,
      creditTier: 'New',
      totalTipsStroops: '0',
    },
    3000,
  );
}
