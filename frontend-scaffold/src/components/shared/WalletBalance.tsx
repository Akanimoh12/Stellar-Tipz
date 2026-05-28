import React, { useEffect, useRef, useCallback } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

import { useWallet } from "@/hooks/useWallet";
import { useBalance } from "@/hooks/useBalance";
import { useXlmPrice } from "@/hooks/useXlmPrice";

const LOW_BALANCE_THRESHOLD = 5;
const AUTO_REFRESH_MS = 30_000;

const formatXlm = (balance: string): string => {
  const num = parseFloat(balance);
  if (isNaN(num)) return "—";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const WalletBalance: React.FC = () => {
  const { connected, publicKey } = useWallet();
  const { balance, loading, error, refetch } = useBalance(publicKey);
  const { price, loading: priceLoading } = useXlmPrice();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh every 30s while connected
  useEffect(() => {
    if (connected && publicKey) {
      intervalRef.current = setInterval(() => {
        refetch();
      }, AUTO_REFRESH_MS);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [connected, publicKey, refetch]);

  if (!connected || !publicKey) return null;

  const xlmBalance = balance ? parseFloat(balance) : null;
  const isLow = xlmBalance !== null && xlmBalance < LOW_BALANCE_THRESHOLD;
  const usdValue =
    xlmBalance !== null && price !== null
      ? (xlmBalance * price).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;

  return (
    <div
      className="flex items-center gap-2 border-2 border-black bg-white px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-black dark:text-white dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]"
      role="status"
      aria-label={
        loading
          ? "Loading wallet balance"
          : `Wallet balance: ${balance ?? "—"} XLM`
      }
    >
      {loading ? (
        <span className="text-xs font-bold uppercase animate-pulse">
          ··· XLM
        </span>
      ) : error ? (
        <span className="text-xs font-bold uppercase text-red-600 dark:text-red-400">
          Balance unavailable
        </span>
      ) : (
        <div className="flex flex-col">
          <span className="text-xs font-black uppercase tracking-tight tabular-nums">
            {formatXlm(balance ?? "0")} XLM
          </span>
          {usdValue && (
            <span className="text-[10px] font-semibold uppercase text-gray-700 dark:text-gray-300">
              ≈ ${usdValue}
              {priceLoading && (
                <span className="ml-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-gray-400" />
              )}
            </span>
          )}
        </div>
      )}

      {isLow && (
        <span
          className="text-yellow-600 dark:text-yellow-300"
          title="Balance is low. Top up to continue tipping."
          aria-label="Low balance warning"
        >
          <AlertTriangle size={14} />
        </span>
      )}

      <button
        type="button"
        onClick={() => refetch()}
        className="p-1 text-gray-700 dark:text-gray-300 transition-colors hover:text-black dark:hover:text-white"
        aria-label="Refresh balance"
        title="Refresh balance"
      >
        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
};

export default WalletBalance;
