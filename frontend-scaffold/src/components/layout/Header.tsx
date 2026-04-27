import React, { useEffect, useRef, useState } from "react";
import { Github, Keyboard, Menu, Moon, Sun, X } from "lucide-react";
import { Link } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import { useWallet } from "@/hooks/useWallet";
import { useI18n } from "@/i18n";

import NetworkBadge from "../shared/NetworkBadge";
import WalletSwitcher from "../shared/WalletSwitcher";
import Button from "../ui/Button";
import { getModifierKey } from "../../hooks/useKeyboardShortcuts";
import MobileMenu from "./MobileMenu";

const UNSEEN_TIPS_KEY = "tipz_unseen_tips";

const Header: React.FC = () => {
  const { connected, publicKey, connect, disconnect } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unseenTips, setUnseenTips] = useState(0);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const readUnseenTips = () => {
      setUnseenTips(
        Number(window.localStorage.getItem(UNSEEN_TIPS_KEY) || "0"),
      );
    };

    readUnseenTips();
    window.addEventListener("storage", readUnseenTips);
    window.addEventListener("tipz:unseen-tips", readUnseenTips);
    return () => {
      window.removeEventListener("storage", readUnseenTips);
      window.removeEventListener("tipz:unseen-tips", readUnseenTips);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        mobileMenuOpen &&
        headerRef.current &&
        !headerRef.current.contains(event.target as Node)
      ) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const handleWalletAction = () => {
    if (connected) {
      disconnect();
    } else {
      connect();
    }
    closeMobileMenu();
  };

  const walletLabel =
    connected && publicKey
      ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`
      : t("wallet.connect");

  const navDashboard = (
    <span className="relative inline-flex items-center gap-2">
      {t("nav.dashboard")}
      {unseenTips > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-black bg-yellow-300 px-1 text-[10px] font-black leading-none text-black">
          {unseenTips > 9 ? "9+" : unseenTips}
        </span>
      )}
    </span>
  );

  const shadow =
    theme === "dark"
      ? "4px 4px 0px 0px rgba(255,255,255,1)"
      : "4px 4px 0px 0px rgba(0,0,0,1)";

  const openKeyboardShortcuts = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        ctrlKey: true,
        metaKey: true,
        bubbles: true,
      }),
    );
  };

  return (
    <header
      ref={headerRef}
      className="relative z-30 border-b-3 border-black bg-white dark:border-white dark:bg-black"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link
          to="/"
          className="flex items-center gap-2"
          onClick={closeMobileMenu}
        >
          <span className="text-2xl font-black tracking-tight">TIPZ</span>
          <span className="text-xl">*</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link
            to="/leaderboard"
            className="text-sm font-bold uppercase tracking-wide hover:underline"
          >
            {t("nav.leaderboard")}
          </Link>
          <Link
            to="/dashboard"
            className="text-sm font-bold uppercase tracking-wide hover:underline"
          >
            {navDashboard}
          </Link>
          <Link
            to="/transactions"
            className="text-sm font-bold uppercase tracking-wide hover:underline"
          >
            Transactions
          </Link>
          <Link
            to="/profile"
            className="text-sm font-bold uppercase tracking-wide hover:underline"
          >
            {t("nav.profile")}
          </Link>
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center justify-center border-2 border-black bg-white p-2 transition-opacity hover:opacity-60 dark:border-white dark:bg-black"
            style={{ boxShadow: shadow }}
            aria-label={`Switch to ${
              theme === "light" ? "dark" : "light"
            } mode`}
          >
            {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <button
            type="button"
            title={`Keyboard shortcuts (${getModifierKey()} + /)`}
            aria-label="Show keyboard shortcuts"
            className="inline-flex items-center justify-center border-2 border-black bg-white p-2 transition-opacity hover:opacity-60 dark:border-white dark:bg-black"
            style={{ boxShadow: shadow }}
            onClick={openKeyboardShortcuts}
          >
            <Keyboard size={20} />
          </button>
          <a
            href="https://github.com/Akanimoh12/stellar-tipz"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="transition-opacity hover:opacity-60"
          >
            <Github size={20} />
          </a>
          <div className="hidden md:block">
            <NetworkBadge />
          </div>
          {connected ? (
            <WalletSwitcher onAddWallet={connect} />
          ) : (
            <Button
              size="sm"
              className="hidden md:inline-flex"
              onClick={connect}
            >
              {walletLabel}
            </Button>
          )}
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center border-2 border-black bg-white p-2 dark:border-white dark:bg-black md:hidden"
          style={{ boxShadow: shadow }}
          aria-label={
            mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"
          }
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <MobileMenu
        isOpen={mobileMenuOpen}
        onClose={closeMobileMenu}
        navDashboard={navDashboard}
        onKeyboardShortcuts={openKeyboardShortcuts}
      />
    </header>
  );
};

export default Header;
