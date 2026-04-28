import React, { useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import GlobalSearch from "./GlobalSearch";
import ShortcutsModal from "./ShortcutsModal";

/**
 * Mounts global keyboard shortcuts and the modals they control.
 * Place this once inside the router context (e.g. inside AppRoutes).
 */
const KeyboardShortcutsProvider: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const closeAll = useCallback(() => {
    setSearchOpen(false);
    setHelpOpen(false);
  }, []);

  React.useEffect(() => {
    const openSearch = () => {
      setHelpOpen(false);
      setSearchOpen(true);
    };

    window.addEventListener("tipz:open-global-search", openSearch);
    return () => {
      window.removeEventListener("tipz:open-global-search", openSearch);
    };
  }, []);

  // Focus the tip amount input on the current tip page.
  // If the custom input isn't visible yet, click the "Custom" trigger button first.
  const focusTipAmount = useCallback(() => {
    const isTipPage = /^\/@/.test(location.pathname);
    if (!isTipPage) return;

    const input = document.querySelector<HTMLInputElement>(
      '[data-tip-amount="true"]',
    );

    if (input) {
      input.focus();
      input.select();
    } else {
      // Custom input not rendered yet — click the trigger to show it, then focus
      const trigger = document.querySelector<HTMLButtonElement>(
        '[data-tip-amount-trigger="true"]',
      );
      if (trigger) {
        trigger.click();
        // Wait one tick for React to render the input
        requestAnimationFrame(() => {
          const newInput = document.querySelector<HTMLInputElement>(
            '[data-tip-amount="true"]',
          );
          newInput?.focus();
          newInput?.select();
        });
      }
    }
  }, [location.pathname]);

  useKeyboardShortcuts([
    {
      key: "k",
      ctrl: true,
      meta: true,
      description: "Quick search creators",
      action: () => {
        setHelpOpen(false);
        setSearchOpen((o) => !o);
      },
    },
    {
      key: "/",
      ctrl: true,
      meta: true,
      description: "Show keyboard shortcuts help",
      action: () => {
        setSearchOpen(false);
        setHelpOpen((o) => !o);
      },
    },
    {
      key: "d",
      ctrl: true,
      meta: true,
      description: "Go to Dashboard",
      action: () => {
        closeAll();
        navigate("/dashboard");
      },
    },
    {
      key: "l",
      ctrl: true,
      meta: true,
      description: "Go to Leaderboard",
      action: () => {
        closeAll();
        navigate("/leaderboard");
      },
    },
    {
      key: "t",
      description: "Focus tip amount input",
      action: focusTipAmount,
    },
    {
      key: "Escape",
      description: "Close any open modal",
      allowInInput: true,
      action: closeAll,
    },
  ]);

  return (
    <>
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
};

export default KeyboardShortcutsProvider;
