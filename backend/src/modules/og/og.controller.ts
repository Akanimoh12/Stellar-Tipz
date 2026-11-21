import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import * as ogService from './og.service.js';

function sendCachedImage(req: Request, res: Response, image: ogService.OgImageResult): void {
  const etag = `"${createHash('sha256').update(image.buffer).digest('hex')}"`;
  res.set({
    'Content-Type': image.contentType,
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
    ETag: etag,
  });

  if (req.fresh) {
    res.status(304).end();
    return;
  }

  res.status(200).send(image.buffer);
}

export async function getCreatorOgImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Route is /og/creators/:name where :name may include a .png suffix.
    const raw = String((req.params as { name: string }).name ?? '');
    const username = raw.replace(/\.png$/i, '');

    if (!username) {
      res.status(400).json({ error: 'username required' });
      return;
    }

    const image = await ogService.getCreatorOgImage(username);
    if (image) {
      sendCachedImage(req, res, image);
      return;
    }

    // Unknown or errored creator → never a broken image.
    const fallback = await ogService.getDefaultOgImage();
    sendCachedImage(req, res, fallback);
  } catch (err) {
    next(err);
  }
}
