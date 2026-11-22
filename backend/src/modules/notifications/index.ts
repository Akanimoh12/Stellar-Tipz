export { notificationsRouter } from "./notifications.routes.js";
export {
  getNotificationsPaginated,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "./notifications.service.js";
export type { PaginatedNotifications, NotificationItem } from "./notifications.types.js";
