/**
 * WalletSwitcher
 *
 * Dropdown that lets users:
 *  - See all connected wallets with their XLM balances
 *  - Switch the active (default) wallet for transactions
 *  - Add a new wallet (opens the kit selection modal)
 *  - Remove individual wallets
 *  - Disconnect all wallets at once
 */
import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Trash2, Wallet } from "lucide-react";

import { useWalletStore, ConnectedWallet } from "@/store/walletStore";
import { useBalance } from "@/hooks/useBalance";

// ── tiny sub-component: one wallet row ──────────────────────────────────────

interface WalletRowProps {
  wallet: ConnectedWallet;
  isActive: boolean;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
}

const WalletRow: React.FC<WalletRowProps> = ({
  wallet,
  isActive,
  onSelect,
  onRemove,
}) => {
  const { balance, loading } = useBalance(wallet.publicKey);
  const label = `${wallet.publicKey.slice(0, 4)}...${wallet.publicKey.slice(-4)}`;

  return (
    <div
      className={`flex items-center justify-between gap-2 border-2 px-3 py-2 ${
        isActive
          ? "border-black bg-yellow-100 dark:bg-yellow-900"
          : "border-transparent hover:border-black hover:bg-gray-50 dark:hover:bg-gray-900"
      }`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={() => onSelect(wallet.publicKey)}
        aria-label={`Switch to wallet ${label}${isActive ? " (active)" : ""}`}
        role="option"
        aria-selected={isActive}
      >
        {isActive ? (
          <Check size={14} className="shrink-0 text-black dark:text-white" />
        ) : (
          <span className="h-[14px] w-[14px] shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide">
            {label}
          </p>
          <p className="text-[10px] font-semibold uppercase text-gray-500">
            {wallet.walletType}
            {" · "}
            {loading ? "…" : balance !== null ? `${balance} XLM` : "—"}
          </p>
        </div>
      </button>
      <button
        type="button"
        aria-label={`Remove wallet ${label}`}
        className="shrink-0 p-1 text-gray-400 transition-colors hover:text-red-600"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(wallet.publicKey);
        }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
};

// ── main component ───────────────────────────────────────────────────────────

interface WalletSwitcherProps {
  /** Called when user clicks "Add wallet". Should open the kit connection modal. */
  onAddWallet: () => void;
}

const WalletSwitcher: React.FC<WalletSwitcherProps> = ({ onAddWallet }) => {
  const wallets = useWalletStore((s) => s.wallets);
  const activeWalletKey = useWalletStore((s) => s.activeWalletKey);
  const setActiveWallet = useWalletStore((s) => s.setActiveWallet);
  const removeWallet = useWalletStore((s) => s.removeWallet);
  const disconnect = useWalletStore((s) => s.disconnect);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  if (wallets.length === 0) return null;

  const activeLabel = activeWalletKey
    ? `${activeWalletKey.slice(0, 4)}...${activeWalletKey.slice(-4)}`
    : "Wallet";

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Wallet switcher"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 border-2 border-black bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-opacity hover:opacity-70 dark:border-white dark:bg-black dark:text-white dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]"
      >
        <Wallet size={14} />
        <span>{activeLabel}</span>
        {wallets.length > 1 && (
          <span className="ml-0.5 rounded-full border border-black bg-yellow-300 px-1 text-[9px] font-black text-black">
            {wallets.length}
          </span>
        )}
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          aria-label="Connected wallets"
          className="absolute right-0 top-full z-50 mt-1 w-64 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-black dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]"
        >
          {/* Header */}
          <div className="border-b-2 border-black px-3 py-2 dark:border-white">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
              Connected wallets
            </p>
          </div>

          {/* Wallet list */}
          <div className="max-h-60 overflow-y-auto">
            {wallets.map((wallet) => (
              <WalletRow
                key={wallet.publicKey}
                wallet={wallet}
                isActive={wallet.publicKey === activeWalletKey}
                onSelect={(key) => {
                  setActiveWallet(key);
                  setOpen(false);
                }}
                onRemove={(key) => {
                  removeWallet(key);
                  if (wallets.length === 1) setOpen(false);
                }}
              />
            ))}
          </div>

          {/* Footer actions */}
          <div className="border-t-2 border-black dark:border-white">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAddWallet();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-black uppercase tracking-wide hover:bg-yellow-100 dark:hover:bg-yellow-900"
            >
              <Plus size={13} />
              Add wallet
            </button>
            <button
              type="button"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Trash2 size={13} />
              Disconnect all
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletSwitcher;
