import type { Request, Response, NextFunction } from 'express';
import * as ogService from './og.service.js';

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
      res.set('Content-Type', image.contentType);
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(image.buffer);
      return;
    }

    // Unknown or errored creator → never a broken image.
    const fallback = await ogService.getDefaultOgImage();
    res.set('Content-Type', fallback.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(fallback.buffer);
  } catch (err) {
    next(err);
  }
}
