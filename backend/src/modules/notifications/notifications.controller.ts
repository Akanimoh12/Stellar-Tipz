import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { BadRequestError } from "../../common/errors/AppError.js";
import {
  getNotificationsPaginated,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "./notifications.service.js";

const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

const notificationIdSchema = z.object({
  notificationId: z.string().cuid("notificationId must be a valid CUID"),
});

/**
 * GET /notifications
 * Returns paginated notifications for the authenticated user.
 * Query params: cursor (optional), limit (optional, default 20, max 100)
 * Issue #1653
 */
export async function getNotificationsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { cursor, limit } = paginationSchema.parse(req.query);
    const userId = req.user?.id;

    if (!userId) {
      next(new BadRequestError("User not authenticated"));
      return;
    }

    const result = await getNotificationsPaginated(userId, cursor, limit);
    res.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid parameters", error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * PATCH /notifications/:notificationId/read
 * Marks a single notification as read.
 */
export async function markNotificationAsReadController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { notificationId } = notificationIdSchema.parse(req.params);
    const userId = req.user?.id;

    if (!userId) {
      next(new BadRequestError("User not authenticated"));
      return;
    }

    await markNotificationAsRead(notificationId, userId);
    res.json({ data: { success: true } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid notification ID", error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * PATCH /notifications/mark-all-read
 * Marks all notifications as read for the authenticated user.
 */
export async function markAllNotificationsAsReadController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      next(new BadRequestError("User not authenticated"));
      return;
    }

    const count = await markAllNotificationsAsRead(userId);
    res.json({ data: { success: true, markedCount: count } });
  } catch (error) {
    next(error);
  }
}
