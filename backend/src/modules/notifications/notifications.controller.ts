import type { Request, Response, NextFunction } from 'express';
import {
  notificationsQuerySchema,
  notificationIdParamSchema,
  updateNotificationPreferencesSchema,
} from './notifications.schema.js';
import * as notificationsService from './notifications.service.js';

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth!.userId;
    const { unreadOnly, limit, offset } = notificationsQuerySchema.parse(req.query);
    const result = await notificationsService.listNotifications(userId, unreadOnly, limit, offset);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth!.userId;
    const { id } = notificationIdParamSchema.parse(req.params);
    const result = await notificationsService.getNotification(userId, id);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function markRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth!.userId;
    const { id } = notificationIdParamSchema.parse(req.params);
    const result = await notificationsService.markAsRead(userId, id);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth!.userId;
    const result = await notificationsService.markAllAsRead(userId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCount(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth!.userId;
    const result = await notificationsService.getUnreadCount(userId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getPreferences(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth!.userId;
    const result = await notificationsService.getPreferences(userId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function updatePreferences(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth!.userId;
    const patch = updateNotificationPreferencesSchema.parse(req.body);
    const result = await notificationsService.updatePreferences(userId, patch);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
