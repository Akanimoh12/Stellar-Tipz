import React from 'react';
import { Clock, RefreshCw } from 'lucide-react';

export interface StalenessIndicatorProps {
  isStale: boolean;
  cachedAt: Date | null;
  onRefresh?: () => void;
  className?: string;
}

export const StalenessIndicator: React.FC<StalenessIndicatorProps> = ({
  isStale,
  cachedAt,
  onRefresh,
  className = '',
}) => {
  if (!isStale && !cachedAt) return null;

  const formattedTime = cachedAt ? cachedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div
      role="note"
      className={`inline-flex items-center gap-1.5 rounded border border-yellow-500 bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200 ${className}`}
    >
      <Clock className="h-3.5 w-3.5 text-yellow-700 dark:text-yellow-400" aria-hidden="true" />
      <span>
        {isStale ? 'Cached data' : 'Updated'}{formattedTime ? ` (${formattedTime})` : ''}
      </span>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="ml-1 rounded p-0.5 hover:bg-yellow-200 dark:hover:bg-yellow-900 focus:outline-none focus:ring-1 focus:ring-yellow-600"
          title="Refresh data"
          aria-label="Refresh data"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

export default StalenessIndicator;
