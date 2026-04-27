import React, { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, Moon, Sun, X } from "lucide-react";
import { Link } from "react-router-dom";

import { useI18n } from "@/i18n";
import { useTheme } from "@/hooks/useTheme";
import { useWallet } from "@/hooks/useWallet";
import { getModifierKey } from "@/hooks/useKeyboardShortcuts";
import NetworkBadge from "../shared/NetworkBadge";
import WalletSwitcher from "../shared/WalletSwitcher";
import Button from "../ui/Button";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  navDashboard: React.ReactNode;
  onKeyboardShortcuts: () => void;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  onClose,
  navDashboard,
  onKeyboardShortcuts,
}) => {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { connected, publicKey, connect, disconnect } = useWallet();
  const menuRef = useRef<HTMLDivElement>(null);

  // Escape key + focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = Array.from<HTMLElement>(
        menuRef.current?.querySelectorAll(FOCUSABLE) ?? [],
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    // Move focus into menu on open
    const firstFocusable = menuRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    firstFocusable?.focus();

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const walletLabel =
    connected && publicKey
      ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`
      : t("wallet.connect");

  const shadow =
    theme === "dark"
      ? "4px 4px 0px 0px rgba(255,255,255,1)"
      : "4px 4px 0px 0px rgba(0,0,0,1)";

  const handleWalletAction = () => {
    connected ? disconnect() : connect();
    onClose();
  };

  const navLinkClass =
    "border-2 border-black bg-white px-4 py-3 font-bold uppercase tracking-wide dark:border-white dark:bg-black dark:text-white";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute left-0 right-0 top-full border-b-3 border-black bg-white dark:border-white dark:bg-black md:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-[0.2em]">
                {t("nav.navigation")}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center border-2 border-black bg-white p-2 dark:border-white dark:bg-black"
                aria-label="Close navigation menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Nav links */}
            <nav aria-label="Mobile navigation">
              <ul className="flex flex-col gap-3">
                <li>
                  <Link
                    to="/leaderboard"
                    onClick={onClose}
                    className={`${navLinkClass} block bg-yellow-100 dark:bg-yellow-900`}
                  >
                    {t("nav.leaderboard")}
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" onClick={onClose} className={`${navLinkClass} block`}>
                    {navDashboard}
                  </Link>
                </li>
                <li>
                  <Link to="/transactions" onClick={onClose} className={`${navLinkClass} block`}>
                    Transactions
                  </Link>
                </li>
                <li>
                  <Link to="/profile" onClick={onClose} className={`${navLinkClass} block`}>
                    {t("nav.profile")}
                  </Link>
                </li>
              </ul>
            </nav>

            {/* Controls */}
            <div className="flex flex-col gap-2 border-t-2 border-black pt-2 dark:border-white">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-bold uppercase dark:text-white">
                  {t("nav.theme")}
                </span>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="inline-flex items-center justify-center border-2 border-black bg-white p-2 transition-opacity hover:opacity-60 dark:border-white dark:bg-black"
                  style={{ boxShadow: shadow }}
                  aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
                >
                  {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                </button>
              </div>

              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-bold uppercase dark:text-white">
                  {t("nav.network")}
                </span>
                <NetworkBadge />
              </div>

              <button
                type="button"
                onClick={onKeyboardShortcuts}
                className="flex items-center justify-between border-2 border-black bg-white px-3 py-2 text-xs font-bold uppercase dark:border-white dark:bg-black dark:text-white"
              >
                Keyboard shortcuts ({getModifierKey()} + /)
                <Keyboard size={16} />
              </button>

              {connected ? (
                <div onClick={onClose}>
                  <WalletSwitcher onAddWallet={connect} />
                </div>
              ) : (
                <Button className="w-full" onClick={handleWalletAction}>
                  {walletLabel}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MobileMenu;
