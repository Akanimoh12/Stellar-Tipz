import React, { useState } from 'react';
import { Bug, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useFeatureFlagDebug } from '@/hooks/useFeatureFlag';
import { refreshFlags } from '@/services/featureFlags';

function shouldShow(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).get('debug') === 'flags';
  } catch {
    return false;
  }
}

const FeatureFlagDebugPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const debug = useFeatureFlagDebug();

  if (!shouldShow()) return null;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshFlags();
    setRefreshing(false);
  };

  const formatAge = (ms: number | null): string => {
    if (ms === null) return 'never';
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s ago`;
    return `${Math.round(secs / 60)}m ago`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 font-black uppercase tracking-wide hover:bg-gray-50"
      >
        <span className="flex items-center gap-1.5">
          <Bug size={14} />
          Feature Flags
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {open && (
        <div className="border-t-2 border-black p-3 space-y-3 max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="font-bold text-gray-600">
              User: {debug.userId ?? 'none'} | Cache: {formatAge(debug.cacheAge)}
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="border border-black px-2 py-0.5 font-bold uppercase hover:bg-gray-100 disabled:opacity-50"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>

          {debug.lastFetchError && (
            <p className="text-red-600 font-bold">Error: {debug.lastFetchError}</p>
          )}

          <div>
            <p className="font-black uppercase tracking-wide mb-1">Env Flags</p>
            {Object.keys(debug.envFlags).length === 0 ? (
              <p className="text-gray-500 italic">none</p>
            ) : (
              <ul className="space-y-0.5">
                {Object.entries(debug.envFlags).map(([k, v]) => (
                  <li key={k} className="flex justify-between font-mono">
                    <span>{k}</span>
                    <span className="font-bold">{String(v)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="font-black uppercase tracking-wide mb-1">Remote Flags</p>
            {Object.keys(debug.remoteFlags).length === 0 ? (
              <p className="text-gray-500 italic">none</p>
            ) : (
              <ul className="space-y-0.5">
                {Object.entries(debug.remoteFlags).map(([k, v]) => (
                  <li key={k} className="flex justify-between font-mono">
                    <span>{k}</span>
                    <span className="font-bold">{String(v)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FeatureFlagDebugPanel;
