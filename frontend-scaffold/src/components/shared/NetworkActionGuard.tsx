import React from 'react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { OFFLINE_ACTION_DISABLED_MESSAGE } from '@/hooks/useNetworkAction';
import { WifiOff } from 'lucide-react';

export interface NetworkActionGuardProps {
  children: React.ReactNode;
  fallbackMessage?: string;
  showInlineWarning?: boolean;
}

export const NetworkActionGuard: React.FC<NetworkActionGuardProps> = ({
  children,
  fallbackMessage = OFFLINE_ACTION_DISABLED_MESSAGE,
  showInlineWarning = true,
}) => {
  const { isOffline } = useOfflineStatus();

  return (
    <div className="relative w-full">
      {isOffline && showInlineWarning && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2 rounded border-2 border-red-500 bg-red-50 p-3 text-xs font-semibold text-red-900 dark:bg-red-950 dark:text-red-200"
        >
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <span>{fallbackMessage}</span>
        </div>
      )}
      <div className={isOffline ? 'pointer-events-none opacity-50 select-none' : ''}>
        {children}
      </div>
    </div>
  );
};

export default NetworkActionGuard;
