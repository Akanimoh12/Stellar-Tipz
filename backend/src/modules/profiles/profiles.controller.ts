import type { Request, Response, NextFunction } from 'express';
import {
  addressParamSchema,
  usernameQuerySchema,
  updateProfileSchema,
  uploadImageSchema,
  createProfileSchema,
} from './profiles.schema.js';
import * as profilesService from './profiles.service.js';

export async function getByAddress(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { address } = addressParamSchema.parse(req.params);
    const profile = await profilesService.getProfileByAddress(address);
    res.status(200).json({ data: profile });
  } catch (err) {
    next(err);
  }
}

export async function getByUsername(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { username } = usernameQuerySchema.parse({ username: req.params.username });
    const profile = await profilesService.getProfileByUsername(username);
    res.status(200).json({ data: profile });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createProfileSchema.parse(req.body);
    const profile = await profilesService.createProfile(
      req.user!.id,
      req.user!.stellarAddress,
      data,
    );
    res.status(201).json({ data: profile });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateProfileSchema.parse(req.body);
    const profile = await profilesService.updateProfile(req.user!.id, data);
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

export async function uploadImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { dataUrl } = uploadImageSchema.parse(req.body);
    const storedCid = `sim-${dataUrl.slice(0, 16)}`;
    await profilesService.updateProfile(req.user!.id, { avatarCid: storedCid });
    res.status(200).json({ data: { profileImageCid: storedCid } });
  } catch (err) {
    next(err);
  }
}

export async function checkUsername(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { username } = usernameQuerySchema.parse(req.query);
    const result = await profilesService.checkUsername(username);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
