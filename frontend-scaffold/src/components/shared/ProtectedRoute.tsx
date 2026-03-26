import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useWallet } from '@/hooks/useWallet';
import { useToastStore } from '@/store/toastStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { connected } = useWallet();
  const { addToast } = useToastStore();

  useEffect(() => {
    if (!connected) {
      addToast({
        message: 'Please connect your wallet to access this page',
        type: 'info',
        duration: 3000,
      });
    }
  }, [connected, addToast]);

  if (!connected) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
