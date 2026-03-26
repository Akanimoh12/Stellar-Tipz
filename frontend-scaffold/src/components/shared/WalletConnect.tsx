import React from 'react';
import Button from '../ui/Button';
import Toast from '../ui/Toast';
import CreditBadge from './CreditBadge';
import { useWallet, useProfile } from '../../hooks';
import { truncateAddress } from '../../services';

interface WalletConnectProps {
  className?: string;
}

const WalletConnect: React.FC<WalletConnectProps> = ({ className }) => {
  const { publicKey, connected, connecting, error, connect, disconnect } = useWallet();
  const { profile } = useProfile();

  if (connected && publicKey) {
    return (
      <div className={`flex items-center gap-3 ${className || ''}`}>
        <div className="flex items-center gap-2">
          {profile && <CreditBadge score={profile.creditScore} showScore={false} />}
          <span className="text-sm font-mono font-bold border-2 border-black bg-white px-3 py-1.5 shadow-[2px 2px 0px 0px_rgba(0,0,0,1)]">
            {truncateAddress(publicKey)}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={disconnect}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        onClick={connect}
        loading={connecting}
        className={className}
      >
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </Button>

      {error && (
        <Toast
          message={error}
          type="error"
          onClose={() => {}}
        />
      )}
    </>
  );
};

export default WalletConnect;
