import React, { useEffect, useState } from "react";
import { Github, Keyboard, Menu, Moon, Sun, X } from "lucide-react";
import { useLocation } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import { useWallet } from "@/hooks/useWallet";
import { useI18n } from "@/i18n";

import NetworkBadge from "../shared/NetworkBadge";
import PrefetchLink from "../shared/PrefetchLink";
import WalletBalance from "../shared/WalletBalance";
import WalletSwitcher from "../shared/WalletSwitcher";
import Button from "../ui/Button";
import { getModifierKey } from "../../hooks/useKeyboardShortcuts";
import NotificationBell from "@/features/notifications/NotificationBell";
import MobileDrawer from "./MobileDrawer";

const UNSEEN_TIPS_KEY = "tipz_unseen_tips";

const Header: React.FC = () => {
  const { connected, publicKey, connect } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const { t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unseenTips, setUnseenTips] = useState(0);

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

  const closeMobileMenu = () => setMobileMenuOpen(false);

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

  const isActivePath = (path: string) =>
    pathname === path || pathname.startsWith(path + "/");

  return (
    <header
      aria-label={t("nav.header")}
      className="relative z-30 border-b-3 border-black bg-white dark:border-white dark:bg-black"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <PrefetchLink
          to="/"
          className="flex items-center gap-2"
          onClick={closeMobileMenu}
        >
          <span className="text-2xl font-black tracking-tight">TIPZ</span>
          <span className="text-xl">*</span>
        </PrefetchLink>

        <nav aria-label={t("nav.primary")} className="hidden items-center gap-6 md:flex">
          <PrefetchLink
            to="/leaderboard"
            aria-current={isActivePath("/leaderboard") ? "page" : undefined}
            className={`text-sm uppercase tracking-wide nav-indicator ${
              isActivePath("/leaderboard")
                ? "font-black border-b-2 border-black active"
                : "font-bold hover:underline"
            }`}
          >
            {t("nav.leaderboard")}
          </PrefetchLink>
          <PrefetchLink
            to="/help"
            aria-current={isActivePath("/help") ? "page" : undefined}
            className={`text-sm uppercase tracking-wide nav-indicator ${
              isActivePath("/help")
                ? "font-black border-b-2 border-black active"
                : "font-bold hover:underline"
            }`}
          >
            {t("nav.help")}
          </PrefetchLink>
          <PrefetchLink
            to="/dashboard"
            aria-current={isActivePath("/dashboard") ? "page" : undefined}
            className={`text-sm uppercase tracking-wide nav-indicator ${
              isActivePath("/dashboard")
                ? "font-black border-b-2 border-black active"
                : "font-bold hover:underline"
            }`}
          >
            {navDashboard}
          </PrefetchLink>
          <PrefetchLink
            to="/transactions"
            aria-current={isActivePath("/transactions") ? "page" : undefined}
            className={`text-sm uppercase tracking-wide nav-indicator ${
              isActivePath("/transactions")
                ? "font-black border-b-2 border-black active"
                : "font-bold hover:underline"
            }`}
          >
            {t("nav.transactions")}
          </PrefetchLink>
          <PrefetchLink
            to="/profile"
            aria-current={isActivePath("/profile") ? "page" : undefined}
            className={`text-sm uppercase tracking-wide nav-indicator ${
              isActivePath("/profile")
                ? "font-black border-b-2 border-black active"
                : "font-bold hover:underline"
            }`}
          >
            {t("nav.profile")}
          </PrefetchLink>
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <NotificationBell />
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center justify-center border-2 border-black bg-white p-2 transition-opacity hover:opacity-60 dark:border-white dark:bg-black"
            style={{ boxShadow: shadow }}
            aria-label={t("theme.switchTo", {
              mode: theme === "light" ? t("common.dark") : t("common.light"),
            })}
          >
            {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <button
            type="button"
            title={t("shortcuts.keyboard", {
              shortcut: `${getModifierKey()} + /`,
            })}
            aria-label={t("shortcuts.show")}
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
            <>
              <WalletBalance />
              <WalletSwitcher onAddWallet={connect} />
            </>
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

        <div className="flex items-center gap-2 md:hidden">
          <NotificationBell />
          <button
            type="button"
            className="inline-flex items-center justify-center border-2 border-black bg-white p-2 dark:border-white dark:bg-black"
            style={{ boxShadow: shadow }}
            aria-label={
              mobileMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")
            }
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <MobileDrawer
        isOpen={mobileMenuOpen}
        onClose={closeMobileMenu}
        navDashboard={navDashboard}
        onKeyboardShortcuts={openKeyboardShortcuts}
      />
    </header>
  );
};

export default Header;
