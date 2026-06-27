import type { Request, Response, NextFunction } from 'express';
import { imageUploadSchema, checkUsernameQuerySchema } from './profiles.schema.js';
import * as profilesService from './profiles.service.js';

export async function getByAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { address } = req.params;
    const profile = await profilesService.getProfileByAddress(address);
    res.status(200).json({ data: profile });
  } catch (err) {
    next(err);
  }
}

export async function reactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await profilesService.reactivateProfile(req.user!.id);
    res.status(200).json({ data: profile });
  } catch (err) {
    next(err);
  }
}

export async function checkUsername(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username } = checkUsernameQuerySchema.parse(req.query);
    const result = await profilesService.checkUsernameAvailability(username);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function uploadImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { dataUrl } = imageUploadSchema.parse(req.body);
    const result = await profilesService.uploadProfileImage(req.user!.id, dataUrl);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
