import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Github, Menu, X, Sun, Moon } from "lucide-react";
import { Link } from "react-router-dom";
import Button from "../ui/Button";
import { useWallet } from "../../hooks/useWallet";
import { useTheme } from "../../hooks/useTheme";
import NetworkBadge from "../shared/NetworkBadge";

const Header: React.FC = () => {
  const { connected, publicKey, connect, disconnect } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

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
      : "Connect Wallet";

  return (
    <header
      ref={headerRef}
      className="border-b-3 border-black bg-white relative z-30 dark:bg-black dark:border-white"
    >
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="flex items-center gap-2"
          onClick={closeMobileMenu}
        >
          <span className="text-2xl font-black tracking-tight">TIPZ</span>
          <span className="text-xl">💫</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            to="/leaderboard"
            className="font-bold uppercase text-sm tracking-wide hover:underline"
          >
            Leaderboard
          </Link>
          <Link
            to="/dashboard"
            className="font-bold uppercase text-sm tracking-wide hover:underline"
          >
            Dashboard
          </Link>
          <Link
            to="/profile"
            className="font-bold uppercase text-sm tracking-wide hover:underline"
          >
            Profile
          </Link>
        </nav>

        {/* Desktop right actions */}
        <div className="hidden md:flex items-center gap-4">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center justify-center border-2 border-black bg-white dark:bg-black dark:border-white p-2 hover:opacity-60 transition-opacity"
            style={{ 
              boxShadow: theme === 'dark' 
                ? "4px 4px 0px 0px rgba(255,255,255,1)" 
                : "4px 4px 0px 0px rgba(0,0,0,1)" 
            }}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <a
            href="https://github.com/Akanimoh12/stellar-tipz"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="hover:opacity-60 transition-opacity"
          >
            <Github size={20} />
          </a>
          <div className="hidden md:block">
            <NetworkBadge />
          </div>
          <Button
            size="sm"
            className="hidden md:inline-flex"
            onClick={connected ? disconnect : connect}
          >
            {walletLabel}
          </Button>
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center border-2 border-black bg-white dark:bg-black dark:border-white p-2"
            style={{ 
              boxShadow: theme === 'dark' 
                ? "4px 4px 0px 0px rgba(255,255,255,1)" 
                : "4px 4px 0px 0px rgba(0,0,0,1)" 
            }}
            aria-label={
              mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"
            }
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="md:hidden absolute left-0 right-0 top-full border-b-3 border-black bg-white dark:bg-black dark:border-white"
          >
            <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-[0.2em]">
                  Navigation
                </span>
                <button
                  type="button"
                  onClick={closeMobileMenu}
                  className="inline-flex items-center justify-center border-2 border-black bg-white dark:bg-black dark:border-white p-2"
                  aria-label="Close mobile menu"
                >
                  <X size={18} />
                </button>
              </div>

              <Link
                to="/leaderboard"
                onClick={closeMobileMenu}
                className="border-2 border-black bg-yellow-100 dark:bg-yellow-900 dark:text-white px-4 py-3 font-bold uppercase tracking-wide"
              >
                Leaderboard
              </Link>
              <Link
                to="/dashboard"
                onClick={closeMobileMenu}
                className="border-2 border-black bg-white dark:bg-black dark:border-white dark:text-white px-4 py-3 font-bold uppercase tracking-wide"
              >
                Dashboard
              </Link>
              <Link
                to="/profile"
                onClick={closeMobileMenu}
                className="border-2 border-black bg-white dark:bg-black dark:border-white dark:text-white px-4 py-3 font-bold uppercase tracking-wide"
              >
                Profile
              </Link>

              <div className="flex flex-col gap-2 pt-2 border-t-2 border-black dark:border-white">
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs font-bold uppercase dark:text-white">Theme</span>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="inline-flex items-center justify-center border-2 border-black bg-white dark:bg-black dark:border-white p-2 hover:opacity-60 transition-opacity"
                    style={{ 
                      boxShadow: theme === 'dark' 
                        ? "4px 4px 0px 0px rgba(255,255,255,1)" 
                        : "4px 4px 0px 0px rgba(0,0,0,1)" 
                    }}
                    aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                  >
                    {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                  </button>
                </div>
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs font-bold uppercase dark:text-white">Network</span>
                  <NetworkBadge />
                </div>
                <Button className="w-full" onClick={handleWalletAction}>
                  {connected ? `Disconnect ${walletLabel}` : "Connect Wallet"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
