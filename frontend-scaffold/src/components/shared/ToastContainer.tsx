import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore, Toast } from '@/store/toastStore';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { announce } from '@/lib/liveRegion';

const ToastItem = React.forwardRef<HTMLDivElement, { toast: Toast }>(({ toast }, ref) => {
  const { removeToast } = useToastStore();

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-500" />,
    error: <AlertCircle className="h-5 w-5 text-red-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
    warning: <AlertCircle className="h-5 w-5 text-yellow-500" />,
  };

  // Announce toast message on mount
  React.useEffect(() => {
    announce(toast.message, toast.type === "error" ? "assertive" : "polite");
  }, [toast.message, toast.type]);

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 50, scale: 0.3 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="flex items-center gap-3 w-80 bg-white border border-gray-200 shadow-lg rounded-xl p-4 mb-3"
    >
      <div className="shrink-0">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 break-words">{toast.message}</div>
        {toast.actionLabel && toast.onAction ? (
          <button
            type="button"
            onClick={() => {
              toast.onAction?.();
              removeToast(toast.id);
            }}
            className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            {toast.actionLabel}
          </button>
        ) : null}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="shrink-0 text-gray-700 dark:text-gray-300 hover:text-gray-600 transition-colors"
        aria-label="Close notification"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
});

ToastItem.displayName = 'ToastItem';

const ToastContainer: React.FC = () => {
  const { visibleToasts, removeToast, position } = useToastStore();

  const timersRef = React.useRef<Map<string, number>>(new Map());

  React.useEffect(() => {
    const seen = new Set(visibleToasts.map((t) => t.id));

    // Clear timers for toasts no longer visible
    for (const [id, handle] of timersRef.current.entries()) {
      if (!seen.has(id)) {
        clearTimeout(handle);
        timersRef.current.delete(id);
      }
    }

    // Set timers for visible toasts that should auto-dismiss
    for (const toast of visibleToasts) {
      if (timersRef.current.has(toast.id)) continue;
      if (toast.duration === undefined || toast.duration <= 0) continue;

      const handle = window.setTimeout(() => {
        removeToast(toast.id);
      }, toast.duration);

      timersRef.current.set(toast.id, handle);
    }

    return () => {
      for (const handle of timersRef.current.values()) clearTimeout(handle);
      timersRef.current.clear();
    };
  }, [visibleToasts, removeToast]);

  const positionClass = (() => {
    switch (position) {
      case 'top-left':
        return 'top-6 left-6 items-start';
      case 'top-right':
        return 'top-6 right-6 items-end';
      case 'bottom-left':
        return 'bottom-6 left-6 items-start';
      case 'bottom-right':
        return 'bottom-6 right-6 items-end';
      case 'top-center':
        return 'top-6 left-1/2 -translate-x-1/2 items-center';
      case 'bottom-center':
        return 'bottom-6 left-1/2 -translate-x-1/2 items-center';
      default:
        return 'bottom-6 right-6 items-end';
    }
  })();

  return (
    <div
      className={`fixed z-[9999] flex flex-col ${positionClass}`}
      aria-live="assertive"
      aria-atomic="true"
    >
      <AnimatePresence mode="popLayout">
        {visibleToasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
};

export default ToastContainer;
