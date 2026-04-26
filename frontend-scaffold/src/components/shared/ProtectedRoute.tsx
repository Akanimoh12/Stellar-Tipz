import React, { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useWallet } from '@/hooks/useWallet';
import { useToastStore } from '@/store/toastStore';
import PageLoader from "@/components/shared/PageLoader";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const RECONNECT_TIMEOUT_MS = 5000;

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const { connected, isReconnecting, walletType } = useWallet();
  const { addToast } = useToastStore();
  const [reconnectTimedOut, setReconnectTimedOut] = useState(false);
  const timeoutIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!connected && !isReconnecting) {
      addToast({
        message: 'Please connect your wallet to access this page',
        type: 'info',
        duration: 3000,
      });
    }
  }, [connected, isReconnecting, addToast]);

  useEffect(() => {
    if (timeoutIdRef.current) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }

    if (!walletType || connected) {
      setReconnectTimedOut(false);
      return;
    }

    // Start a 5s window to allow auto-reconnect before redirecting.
    setReconnectTimedOut(false);
    timeoutIdRef.current = window.setTimeout(() => {
      setReconnectTimedOut(true);
    }, RECONNECT_TIMEOUT_MS);

    return () => {
      if (timeoutIdRef.current) {
        window.clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
  }, [walletType, connected]);

  if ((isReconnecting || Boolean(walletType)) && !connected && !reconnectTimedOut) {
    return (
      <div data-testid="reconnect-loader" className="min-h-[60vh] flex">
        <PageLoader />
      </div>
    );
  }

  if (!connected) {
    return (
      <Navigate
        to="/"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
