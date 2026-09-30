import React from 'react';
import type { ConnectionState } from '@/services/eventStream';

interface ConnectionStatusIndicatorProps {
  state: ConnectionState;
  onRetry?: () => void;
}

const STATE_CONFIG: Record<ConnectionState, { dot: string; label: string; pulse?: boolean }> = {
  connected: { dot: 'bg-green-500', label: 'Live' },
  connecting: { dot: 'bg-yellow-400', label: 'Reconnecting...', pulse: true },
  disconnected: { dot: 'bg-gray-400', label: 'Offline' },
  'gave-up': { dot: 'bg-red-500', label: 'Disconnected' },
};

const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({ state, onRetry }) => {
  const config = STATE_CONFIG[state];

  // Don't clutter UI when connected
  if (state === 'connected') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${config.dot} ${config.pulse ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />
      <span>{config.label}</span>
      {state === 'gave-up' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 underline hover:no-underline text-red-600"
        >
          Retry
        </button>
      )}
    </div>
  );
};

export default ConnectionStatusIndicator;
