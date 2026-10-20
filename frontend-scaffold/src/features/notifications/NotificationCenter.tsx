import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, Gift, Star, Info, Circle } from 'lucide-react';
import { useNotificationStore, type NotificationType, type AppNotification } from '@/store/notificationStore';
import EmptyState from '@/components/ui/EmptyState';

const TYPE_CONFIG: Record<NotificationType, { icon: React.ReactNode; color: string }> = {
  tip: { icon: <Gift size={16} />, color: 'text-green-600' },
  achievement: { icon: <Star size={16} />, color: 'text-yellow-500' },
  system: { icon: <Info size={16} />, color: 'text-blue-500' },
};

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

interface NotificationItemProps {
  notification: AppNotification;
  onClose: () => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onClose }) => {
  const navigate = useNavigate();
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const config = TYPE_CONFIG[notification.type];

  const handleClick = () => {
    if (notification.unread) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
    onClose();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-gray-200 transition-colors hover:bg-gray-50 ${
        notification.unread ? 'bg-blue-50' : ''
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${config.color}`}>{config.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-900 truncate">{notification.title}</p>
        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{notification.message}</p>
        <p className="text-[10px] text-gray-400 mt-1">{formatRelativeTime(notification.timestamp)}</p>
      </div>
      {notification.unread && (
        <Circle size={8} className="mt-1.5 shrink-0 fill-blue-500 text-blue-500" />
      )}
    </button>
  );
};

interface NotificationCenterProps {
  onClose: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ onClose }) => {
  const notifications = useNotificationStore((s) => s.notifications);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <div className="flex flex-col max-h-[400px]">
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black bg-white">
        <div className="flex items-center gap-2">
          <Bell size={18} />
          <h3 className="text-sm font-black uppercase tracking-wide">Notifications</h3>
          {unreadCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-600 hover:bg-gray-100"
            >
              <CheckCheck size={12} />
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-500 hover:bg-red-50"
            >
              <Trash2 size={12} />
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <EmptyState
            icon={<Bell size={32} />}
            title="No notifications yet"
            description="Notifications will appear here when you receive tips or achievements."
          />
        ) : (
          notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} onClose={onClose} />
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
