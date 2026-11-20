import { Router } from "express";
import {
  getNotificationsController,
  markNotificationAsReadController,
  markAllNotificationsAsReadController,
} from "./notifications.controller.js";

export const notificationsRouter = Router();

/**
 * GET /notifications
 * Returns paginated notifications for the authenticated user using cursor pagination.
 * Issue #1653
 */
notificationsRouter.get("/", getNotificationsController);

/**
 * PATCH /notifications/:notificationId/read
 * Marks a single notification as read.
 */
notificationsRouter.patch("/:notificationId/read", markNotificationAsReadController);

/**
 * PATCH /notifications/mark-all-read
 * Marks all unread notifications as read for the authenticated user.
 */
notificationsRouter.patch("/mark-all-read", markAllNotificationsAsReadController);
