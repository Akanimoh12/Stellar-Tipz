import React, { useState, useEffect } from 'react';
import { onUpdateAvailable, skipWaiting, UpdateInfo } from '@/services/serviceWorker';
import { useI18n } from '@/i18n';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export interface UpdatePromptProps {
  className?: string;
}

export const UpdatePrompt: React.FC<UpdatePromptProps> = ({ className = '' }) => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const unsub = onUpdateAvailable((info) => {
      setUpdateInfo(info);
    });
    return unsub;
  }, []);

  if (!updateInfo) return null;

  const handleUpdate = () => {
    setIsUpdating(true);
    void skipWaiting();
  };

  const isCritical = updateInfo.isCritical;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-50 flex items-center justify-between gap-3 border-b-4 border-black px-4 py-2 text-sm font-black uppercase tracking-wide ${
        isCritical ? 'bg-red-400 text-black' : 'bg-blue-300 text-black'
      } ${className}`}
    >
      <div className="flex items-center gap-2">
        {isCritical ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-950" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-4 w-4 shrink-0 text-blue-950 animate-spin" aria-hidden="true" />
        )}
        <span>
          {isCritical
            ? t('app.criticalUpdateRequired')
            : t('app.updateAvailable')}
        </span>
      </div>
      <button
        type="button"
        disabled={isUpdating}
        onClick={handleUpdate}
        className="shrink-0 border-2 border-black bg-black px-3 py-1 text-xs font-black uppercase text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isUpdating
          ? t('app.updating')
          : t('app.reloadNow')}
      </button>
    </div>
  );
};

export default UpdatePrompt;
