import React, { useEffect } from "react";
import { useBlocker } from "react-router-dom";
import {
  NAVIGATION_CONFIRM_MESSAGE,
  useActiveTransactionCount,
} from "@/hooks/useTransactionGuard";

/**
 * Blocks in-app navigation (Link clicks, history changes) while a transaction
 * is in flight. Prompts with window.confirm; proceeding/cancelling resolves
 * the react-router blocker. Renders nothing; must be mounted inside a data
 * router (createBrowserRouter + RouterProvider).
 */
const TransactionNavigationBlock: React.FC = () => {
  const activeCount = useActiveTransactionCount();
  const blocker = useBlocker(activeCount > 0);

  useEffect(() => {
    if (blocker.state !== "blocked") return;

    const proceed = (() => {
      try {
        return window.confirm(NAVIGATION_CONFIRM_MESSAGE);
      } catch {
        return false;
      }
    })();

    if (proceed) {
      blocker.proceed?.();
    } else {
      blocker.reset?.();
    }
  }, [blocker]);

  return null;
};

export default TransactionNavigationBlock;
