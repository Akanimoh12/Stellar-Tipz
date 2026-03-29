import React from 'react';
import { useWalletStore } from '@/store/walletStore';

const NetworkBadge: React.FC = () => {
  const { connected, network } = useWalletStore();

  if (!connected) return null;

  const isTestnet =  network === 'TESTNET';
  const isPublic = network === 'PUBLIC';

  const config = {
    label: isTestnet ? "TESTNET" : isPublic ? "MAINNET" : network,
    bg: isTestnet ? "bg-yellow-100" : isPublic ? "bg-green-100" : "bg-gray-100",
    text: isTestnet ? "text-black" : isPublic ? "text-black" : "text-black",
    border: isTestnet ? "border-yellow-300" : isPublic ? "border-green-300" : "border-gray-300"
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wider ${config.bg} ${config.text} ${config.border}`}>
      {config.label}
    </span>
  );
};

export default NetworkBadge;
