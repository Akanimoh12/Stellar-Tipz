import React, { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  duration = 4000,
  onClose,
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  const colors: Record<string, string> = {
    success: 'bg-green-100 border-green-800',
    error: 'bg-red-100 border-red-800',
    info: 'bg-white border-black',
  };

  return (
    <div
      className={`fixed bottom-safe right-safe z-50 px-6 py-4 border-2 font-bold ${colors[type]}`}
      style={{ boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}
      role="alert"
    >
      <div className="flex items-center gap-3">
        <span>{message}</span>
        <button
          onClick={() => { setVisible(false); onClose(); }}
          className="font-black hover:opacity-60"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default Toast;
