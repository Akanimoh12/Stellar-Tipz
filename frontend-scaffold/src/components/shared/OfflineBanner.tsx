import React from 'react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useI18n } from '@/i18n';
import { WifiOff } from 'lucide-react';

export interface OfflineBannerProps {
  className?: string;
  customMessage?: string;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  className = '',
  customMessage,
}) => {
  const { isOffline } = useOfflineStatus();
  const { t } = useI18n();

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-50 flex items-center justify-center gap-2 border-b-4 border-black bg-yellow-300 px-4 py-2 text-sm font-black uppercase tracking-wide text-black ${className}`}
    >
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      <span>{customMessage ?? t('app.offlineBanner')}</span>
    </div>
  );
};

export default OfflineBanner;
